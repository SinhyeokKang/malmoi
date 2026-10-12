// ⚠️ **`server-only`를 일부러 붙이지 않았다** — `lib/github.ts`와 같은 이유다(tsx 스모크 스크립트가 프로덕션 경로를 그대로 지난다).
// 이 파일은 DB를 모른다 — 토큰은 호출부(`lib/repo-host`)가 프로젝트가 참조하는 연결에서 열어 넘긴다.
import { AppError, logCaught } from "@/lib/failure";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { planProjectMeta } from "@/lib/gitlab-connect/access-plan";
import { tokenExpired, type RemoteResult } from "@/lib/gitlab-connect/verify";
import type { GitClient, GitTreeBlob, GitTreeEntry } from "@/lib/pull/client";
import { commitMessage } from "@/lib/pull/payload";
import type { BranchList, RepoReader, RepoSizes, RepoSnapshot } from "@/lib/repo-host/reader";
import type { RepoTarget } from "@/lib/repo-host/target";

import {
  buildCommitActions,
  decodeBlob,
  isLfsPointer,
  nextKeysetQuery,
  parseBranchHead,
  parseTreePage,
  planBlobSizes,
  planCompare,
  planGitLabHealth,
  projectGid,
  selectOwnMergeRequest,
} from "./plan";
import { classifyGitLabFailure, createGitLabTransport, isGitLabProjectId, nextPage, projectPath, type GitLabTransport } from "./transport";

/**
 * **GitLab 쪽 리포 I/O** (gitlab-repositories design §2 Publish · §3 "공통 경계"). 경계 서명(`GitClient`·`RepoReader`·`BranchList`·`ConnectionHealth`)을
 * GitLab REST·GraphQL로 채운다 — 판정은 `./plan`, 호스트 선택은 `lib/repo-host`다.
 *
 * ⚠️ **숫자 project id로만 부른다**(`projectPath` — transport가 전송 전에 거부한다). PAT에는 토큰을 리포 하나로 좁히는 층이 없어 이 주소 규칙과
 * 생성 때의 `GET /projects/<id>`가 불변식 11의 GitLab 층이다(design §5).
 * ⚠️ **자체 재시도가 없다** — Publish는 `execution.fetch()`를 넘긴다. 애매한 5xx 뒤 MR POST가 다시 나가면 중복 MR이다(POSTMORTEM 2026-10-09).
 * ⚠️ **토큰은 프로젝트가 참조하는 연결의 PAT다** — 호출자(요청한 사람)의 연결이 아니다(`credential-separation.test.ts`).
 */

export type GitLabTarget = Extract<RepoTarget, { host: "gitlab" }>;
/** 연결에서 연 값 — 원문 토큰과 저장된 만료일. 만료일이 지났으면 원격을 부르지 않는다. */
export type GitLabCredential = { token: string; expiresAt: Date | null };
export type GitLabIoOptions = { fetch?: typeof fetch; now?: Date };

/** 트리 keyset 페이지 상한(100항목 × 200 = 2만 항목). 넘으면 잘린 것으로 본다 — 온보딩은 `truncated`, Publish는 던진다(부분 트리로 비교하지 않는다). */
export const TREE_PAGE_LIMIT = 200;
const TREE_PER_PAGE = "100";
/** GraphQL `blobs` 한 번에 묻는 경로 수 — 복잡도 한도 250 안(100경로 218 — W0 실측). */
const SIZE_CHUNK = 100;
/** 브랜치 목록 100개 × 3페이지 — GitHub `listBranches`와 같은 상한. 넘으면 화면이 자유 입력으로 바꾼다. */
const BRANCH_PAGES = 3;
/** 열린 MR 목록 페이지 상한 — sync 브랜치 하나를 source로 한 열린 MR은 서버가 하나만 허용한다(409). 넘으면 응답이 이상한 것이다. */
const MR_PAGES = 10;

/** 재연결이 고치는 실패 — 저장 코드 `not-installed`("그 프로젝트에 쓸 연결 자격증명이 없음", 재시도 안 함 — design §3 0단계 판정). */
function needsReconnect(reason: string): AppError {
  return new AppError(`GitLab connection cannot write to this repository (${reason}); reconnect the project`, "not-installed");
}

async function remote(scope: string, work: () => Promise<{ body: unknown }>): Promise<RemoteResult> {
  try {
    return { ok: true, body: (await work()).body };
  } catch (error) {
    logCaught("gitlab", scope, error);
    return { ok: false, error };
  }
}

/**
 * 생성 때 한 번 — 만료일(원격 0) → `GET /projects/<id>`(보관·SHA-256·접근). 쓰기·읽기 클라이언트가 같은 문을 지난다(design §3).
 * ⚠️ 일시 장애는 원래 오류를 그대로 던진다(리포 호스트 HTTP 실패 → `github-error`, 재시도) — 재연결로 접지 않는다.
 * 경로가 바뀐 것(같은 id)은 막지 않는다 — 숫자 id로 부르므로 같은 리포다. 표시층(`loadGitLabHealth`)이 `repo-moved`로 말한다.
 */
async function openProject(target: GitLabTarget, credential: GitLabCredential, options: GitLabIoOptions): Promise<GitLabTransport> {
  if (!isGitLabProjectId(target.repositoryId)) throw new AppError("unreachable: GitLab project without a numeric id");
  if (tokenExpired(credential.expiresAt, options.now ?? new Date())) throw needsReconnect("token expired");
  const transport = createGitLabTransport(credential.token, { fetch: options.fetch });
  let body: unknown;
  try {
    body = (await transport.get(projectPath(target.repositoryId))).body;
  } catch (error) {
    if (classifyGitLabFailure(error) === "unavailable") throw error;
    throw needsReconnect(classifyGitLabFailure(error));
  }
  const meta = planProjectMeta({ ok: true, body }, target.repositoryId);
  if (meta.status === "unavailable") throw new AppError("unexpected GitLab project response");
  if (meta.status !== "ok") throw needsReconnect(meta.status);
  if (meta.archived) throw needsReconnect("archived");
  return transport;
}

function branchPath(repositoryId: string, branch: string): string {
  // 브랜치 이름은 경로 조각 하나다 — `malmoi-i18n/sync-<slug>`의 슬래시를 인코딩한다(transport가 `/repository/` 아래에서만 허용한다 — D22).
  return projectPath(repositoryId, `repository/branches/${encodeURIComponent(branch)}`);
}

/** 트리 전체(keyset 끝까지). 상한을 넘으면 `null` — 호출부가 truncated로 말하거나 던진다. 페이지 실패·모양 오류는 던진다. */
async function readTree(transport: GitLabTransport, repositoryId: string, sha: string): Promise<(GitTreeEntry & { type: string })[] | null> {
  const path = projectPath(repositoryId, "repository/tree");
  let query: Record<string, string> | null = { ref: sha, recursive: "true", per_page: TREE_PER_PAGE, pagination: "keyset" };
  const entries: (GitTreeEntry & { type: string })[] = [];
  for (let page = 0; page < TREE_PAGE_LIMIT && query !== null; page += 1) {
    const response = await transport.get(path, query);
    const items = parseTreePage(response.body);
    if (items === null) throw new AppError("unexpected GitLab tree page");
    entries.push(...items);
    query = nextKeysetQuery(response.headers.get("link"), path);
  }
  return query === null ? entries : null;
}

async function readBlobText(transport: GitLabTransport, repositoryId: string, sha: string): Promise<string> {
  const text = decodeBlob((await transport.get(projectPath(repositoryId, `repository/blobs/${encodeURIComponent(sha)}`))).body);
  if (text === null) throw new AppError("unexpected GitLab blob encoding");
  if (isLfsPointer(text)) throw new AppError("refusing a Git LFS pointer file — the locale file is stored in LFS");
  return text;
}

/**
 * Publish·목록·게이트의 클라이언트. `options.fetch`에 Publish 실행 수명(`execution.fetch()`)이 오면 비GET이 쓰기로 세어진다.
 * ⚠️ **GraphQL(POST)을 부르지 않는다** — 이 클라이언트 안의 POST는 전부 실제 쓰기다(commit·MR·노트).
 */
export async function createGitLabClient(target: GitLabTarget, credential: GitLabCredential, options: GitLabIoOptions = {}): Promise<GitClient> {
  const transport = await openProject(target, credential, options);
  const id = target.repositoryId;
  const mr = (iid: number, rest = "") => projectPath(id, `merge_requests/${iid}${rest}`);

  return {
    async getRefSha(ref) {
      // 경계 계약의 `heads/<branch>` 꼴만 받는다 — GitLab에는 태그·커밋 ref를 이 자리로 물을 호출부가 없다.
      if (!ref.startsWith("heads/")) throw new AppError(`unsupported ref for GitLab (expected heads/<branch>): ${ref}`);
      try {
        const head = parseBranchHead((await transport.get(branchPath(id, ref.slice("heads/".length)))).body);
        if (head === null) throw new AppError("unexpected GitLab branch response");
        return head.sha;
      } catch (error) {
        // 브랜치 부재는 정상 입력이다(sync 브랜치의 첫 실행). ⚠️ base 브랜치의 `null`은 호출부가 즉시 던진다(`client.ts` 주석 — 권한 은폐 404).
        if (classifyGitLabFailure(error) === "not-found") return null;
        throw error;
      }
    },

    async getTree(commitSha) {
      const entries = await readTree(transport, id, commitSha);
      // 잘린 트리를 그대로 쓰면 base에 있는 파일을 "없다"고 판정해 신규로 올린다 — 조용히 진행하는 것이 최악이다.
      if (entries === null) throw new AppError(`tree is truncated (${commitSha}) — too many files for the comparison to be trusted`);
      return entries.map(({ path, sha, mode }) => ({ path, sha, mode }));
    },

    getBlobText: (sha) => readBlobText(transport, id, sha),

    /**
     * 커밋 API 한 번이 트리·커밋·ref 셋을 한다 — `start_sha` = 고정 base, `force: true`(브랜치 유무와 무관한 한 형태 — W0 실측). **첫 외부 쓰기가 이 호출 하나**다.
     * ⚠️ 내용이 같은 update도 빈 diff 커밋을 만든다(GitLab은 no-op을 걸러 주지 않는다) — 2층(blob hash 전부 같으면 호출 0)이 유일한 방어선이다.
     */
    async publishSnapshot({ branch, baseSha, changes, summary }) {
      const actions = buildCommitActions(changes);
      const response = await transport.send("POST", projectPath(id, "repository/commits"), {
        body: { branch, start_sha: baseSha, force: true, commit_message: commitMessage(summary), actions },
      });
      const commit = response.body;
      if (typeof commit !== "object" || commit === null || !("id" in commit) || typeof commit.id !== "string") throw new AppError("unexpected GitLab commit response");
      return commit.id;
    },

    /**
     * no-changes 수렴 — **sync 브랜치를 지운다**(D9). GitLab엔 ref 강제 이동 API가 없고 `allow_empty` 빈 커밋은 head ≠ base라 수렴하지 않는다.
     * 지운 뒤 `getRefSha`가 `null`이라 두 번째 실행은 읽기만 한다. 404는 이미 수렴한 것이다. 열린 MR은 그 **전에** 호출부가 닫는다.
     */
    async resetSyncBranch(branch) {
      try {
        await transport.send("DELETE", branchPath(id, branch));
      } catch (error) {
        if (classifyGitLabFailure(error) !== "not-found") throw error;
      }
    },

    /** 자기 프로젝트의 열린 MR(fork 제외 — `selectOwnMergeRequest`). 오프셋 페이지 끝까지. ⚠️ 404는 던진다 — "없음"이 아니다. */
    async findOpenPr(branch) {
      const path = projectPath(id, "merge_requests");
      let page: string | null = "1";
      for (let read = 0; read < MR_PAGES && page !== null; read += 1) {
        const response = await transport.get(path, { state: "opened", source_branch: branch, per_page: "100", page });
        const own = selectOwnMergeRequest(response.body, id, branch);
        if (own !== null) return own;
        page = nextPage(response.headers);
      }
      if (page !== null) throw new AppError("GitLab merge request list did not end");
      return null;
    },

    /** ⚠️ 409(같은 source 브랜치의 열린 MR)는 성공으로 읽지 않고 던진다 — 응답 유실 뒤엔 결과 미확인 경로가 다시 판정한다(W0 실측). */
    async createPr(headBranch, baseBranch, title, body) {
      const response = await transport.send("POST", projectPath(id, "merge_requests"), {
        body: { source_branch: headBranch, target_branch: baseBranch, title, description: body },
      });
      const created = response.body;
      if (typeof created !== "object" || created === null || !("web_url" in created) || typeof created.web_url !== "string") throw new AppError("unexpected GitLab merge request response");
      return created.web_url;
    },

    async updatePrTitle(iid, title) {
      await transport.send("PUT", mr(iid), { body: { title } });
    },

    async updatePrBase(iid, base) {
      await transport.send("PUT", mr(iid), { body: { target_branch: base } });
    },

    /** 이유 노트 → 닫기. 노트가 먼저다 — 닫기가 성공하고 노트가 실패하면 이유 없이 닫힌 MR이 남는다(GitHub `closePr`과 같은 순서). */
    async closePr(iid, comment) {
      await transport.send("POST", mr(iid, "/notes"), { body: { body: comment } });
      await transport.send("PUT", mr(iid), { body: { state_event: "close" } });
    },

    async compareToBase(baseSha, branch) {
      const response = await transport.get(projectPath(id, "repository/compare"), { from: baseSha, to: branch, straight: "true" });
      return planCompare(response.body);
    },

    async isPullRequestOpen(iid) {
      const response = await transport.get(mr(iid));
      const body = response.body;
      if (typeof body !== "object" || body === null || !("state" in body) || typeof body.state !== "string") throw new AppError("unexpected GitLab merge request response");
      return body.state === "opened";
    },
  };
}

/**
 * 온보딩·Sync의 리더(`RepoReader` — 계약은 `lib/repo-host/reader.ts`). 실패를 값으로 준다(`unavailable`·`base-branch-missing`·`truncated`).
 * ⚠️ 생성 때의 `GET /projects/<id>`는 던진다 — 재연결 필요와 일시 장애를 가른 오류다(쓰기 클라이언트와 같은 문).
 */
export async function openGitLabReader(target: GitLabTarget, credential: GitLabCredential, options: GitLabIoOptions = {}): Promise<RepoReader> {
  const transport = await openProject(target, credential, options);
  const id = target.repositoryId;
  return {
    async snapshot(baseBranch: string): Promise<RepoSnapshot> {
      try {
        let head: { sha: string; committedAt: string } | null;
        try {
          head = parseBranchHead((await transport.get(branchPath(id, baseBranch))).body);
        } catch (error) {
          // ⚠️ 접근은 생성 때 확인했다 — 그 뒤의 404만 "브랜치가 없다"로 읽는다(GitHub 리더와 같은 순서).
          if (classifyGitLabFailure(error) === "not-found") return { status: "base-branch-missing" };
          throw error;
        }
        if (head === null) return { status: "unavailable" };
        const entries = await readTree(transport, id, head.sha);
        if (entries === null) return { status: "truncated" };
        // 크기는 트리에 없다 — `sizes`가 예산 대상 경로만 묻는다.
        const files: GitTreeBlob[] = entries.filter((entry) => entry.type === "blob").map(({ path, sha }) => ({ path, sha }));
        return { status: "ok", headSha: head.sha, headCommittedAt: head.committedAt, files };
      } catch (error) {
        // 장애를 거부로 접지 않는다 — 화면이 "잠시 뒤 다시"를 말할 수 있는 유일한 갈래다.
        logCaught("gitlab", "snapshot", error);
        return { status: "unavailable" };
      }
    },

    async blob(sha: string): Promise<string | undefined> {
      try {
        return await readBlobText(transport, id, sha);
      } catch (error) {
        logCaught("gitlab", "blob", error);
        return undefined;
      }
    },

    /** GraphQL `blobs` 100경로씩(design §3). ⚠️ 적재 전용이다 — Publish 실행 안에서 부르지 않는다(POST가 쓰기로 세어진다). */
    async sizes(snapshot, paths): Promise<RepoSizes> {
      const sizes = new Map<string, number>();
      for (let i = 0; i < paths.length; i += SIZE_CHUNK) {
        const chunk = paths.slice(i, i + SIZE_CHUNK);
        let data: unknown;
        try {
          data = await transport.graphql(BLOB_SIZES, { ids: [projectGid(id)], ref: snapshot.headSha, paths: chunk });
        } catch (error) {
          logCaught("gitlab", "sizes", error);
          return { status: "unavailable" };
        }
        const planned = planBlobSizes(data, id, snapshot, chunk);
        if (planned.status !== "ok") return planned;
        for (const [path, size] of planned.sizes) sizes.set(path, size);
      }
      return { status: "ok", sizes };
    },
  };
}

/** 숫자 id 주소(`projects(ids:)`) — `project(fullPath:)`를 쓰지 않는다(design §3). `oid`는 스냅샷 blob id와 대조한다(`planBlobSizes`). */
const BLOB_SIZES = "query($ids: [ID!], $ref: String!, $paths: [String!]!) { projects(ids: $ids) { nodes { id repository { blobs(ref: $ref, paths: $paths) { pageInfo { hasNextPage } nodes { path size lfsOid oid } } } } } }";

/** ①·설정의 브랜치 목록. 실패가 값인 이유는 ①을 막지 않기 위해서다(GitHub `listBranches`와 같다). 생성 문(`openProject`)의 실패도 값이다. */
export async function listGitLabBranches(target: GitLabTarget, credential: GitLabCredential, options: GitLabIoOptions = {}): Promise<BranchList> {
  try {
    const transport = await openProject(target, credential, options);
    const names: string[] = [];
    let page: string | null = "1";
    for (let read = 0; read < BRANCH_PAGES && page !== null; read += 1) {
      const response = await transport.get(projectPath(target.repositoryId, "repository/branches"), { per_page: "100", page });
      const body = response.body;
      if (!Array.isArray(body) || !body.every((branch): branch is { name: string } => typeof branch === "object" && branch !== null && typeof branch.name === "string")) {
        throw new AppError("unexpected GitLab branch list");
      }
      names.push(...body.map((branch) => branch.name));
      page = nextPage(response.headers);
    }
    return { status: "ok", names, truncated: page !== null };
  } catch (error) {
    logCaught("gitlab", "list-branches", error);
    return { status: "unavailable" };
  }
}

/**
 * 연결 건강성(설정·Home·번역·MCP). 만료일이 지났으면 원격 0으로 `connection-unusable`. 그 밖은 `GET /projects/<id>` 한 번 → `planGitLabHealth`.
 * ⚠️ 일시 장애는 `unknown`이다 — 끊김으로 접지 않는다. 마감(`GITHUB_WAIT_MS`)은 호출부(`lib/repo-host`)가 건다.
 */
export async function loadGitLabHealth(target: GitLabTarget, credential: GitLabCredential, options: GitLabIoOptions = {}): Promise<ConnectionHealth> {
  if (tokenExpired(credential.expiresAt, options.now ?? new Date())) return { status: "connection-unusable" };
  const transport = createGitLabTransport(credential.token, { fetch: options.fetch });
  const meta = planProjectMeta(await remote("health", () => transport.get(projectPath(target.repositoryId))), target.repositoryId);
  return planGitLabHealth(target, meta);
}
