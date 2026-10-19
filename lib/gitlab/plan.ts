import { decodeLocaleFile, encodeFileContent, type DecodedLocaleFile } from "@/lib/file-encoding";
import { z } from "zod";

import { AppError } from "@/lib/failure";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import type { ProjectMetaVerdict } from "@/lib/gitlab-connect/access-plan";
import type { ChangedFile, GitTreeEntry, SnapshotChange } from "@/lib/pull/client";
import type { RepoSizes, RepoSnapshot } from "@/lib/repo-host/reader";

import { GITLAB_API } from "./transport";

/**
 * **GitLab 원격 응답의 순수 판정** (gitlab-repositories design §3 표). I/O는 `./client`가 하고 여기는 응답 모양 → 값/거부만 가른다.
 *
 * ⚠️ **모양이 다른 응답을 "없음"·"빈 목록"으로 접지 않는다** — 열린 MR 목록을 빈 것으로 읽으면 자동 적재 게이트가 열리고, 트리 페이지를 빈 것으로
 * 읽으면 base의 파일을 "없다"로 판정해 신규로 올린다(POSTMORTEM 2026-09-03 형). 그런 자리는 `null`을 주거나 던진다.
 */

/** commit API의 action 하나. `execute_filemode`를 넣지 않는다 — 수정 파일이 `100644`로 남는다(W0 실측, GitHub `buildTreePayload`와 같은 동작). */
export type GitLabCommitAction =
  | { action: "create" | "update"; file_path: string; content: string; encoding: "text" | "base64" }
  | { action: "delete"; file_path: string };

/**
 * 고정 base 위 스냅샷의 actions. **명시적 삭제 의도만 delete가 된다** — `planPullChanges`가 의도 중 base에 있는 경로만 delete로 내고,
 * writer의 `null`은 삭제로 읽지 않는다. 빈 변경·경로 안전·중복 검사는 두 종류 모두에 건다(같은 경로의 update+delete도 중복이다).
 * ⚠️ 경로는 JSON 본문 값이라 인코딩하지 않는다(왕복 동일). 대신 리포 밖·다른 파일을 가리키는 모양은 조립 전에 던진다 —
 * 경로는 이미 `resolveLocalePaths`를 지났지만, 쓰기 직전의 마지막 문이 여기다.
 */
export function buildCommitActions(changes: readonly SnapshotChange[]): GitLabCommitAction[] {
  if (changes.length === 0) throw new AppError("unreachable: a GitLab commit needs at least one change");
  const seen = new Set<string>();
  return changes.map((change): GitLabCommitAction => {
    const { path } = change;
    if (!isSafeRepoPath(path)) throw new AppError(`unsafe repository path for a GitLab commit: ${JSON.stringify(path)}`);
    if (seen.has(path)) throw new AppError(`duplicate path in one GitLab commit: ${JSON.stringify(path)}`);
    seen.add(path);
    if (change.kind === "delete") return { action: "delete", file_path: path };
    const utf16 = change.encoding !== undefined && change.encoding !== "utf-8";
    return { action: change.inBase ? "update" : "create", file_path: path,
      content: utf16 ? encodeFileContent(change.content, change.encoding!).toString("base64") : change.content,
      encoding: utf16 ? "base64" : "text" };
  });
}

function isSafeRepoPath(path: string): boolean {
  if (path === "" || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

const TreeItem = z.object({ id: z.string().min(1), path: z.string().min(1), type: z.string().min(1), mode: z.string().min(1) });

/** 트리 한 페이지. 모양이 다르면 `null` — 호출부가 던지거나 `unavailable`로 판정한다. */
export function parseTreePage(body: unknown): (GitTreeEntry & { type: string })[] | null {
  const parsed = z.array(TreeItem).safeParse(body);
  if (!parsed.success) return null;
  return parsed.data.map(({ id, path, type, mode }) => ({ path, sha: id, mode, type }));
}

/**
 * keyset 페이지의 다음 질의 — `Link: <…>; rel="next"`. 없으면 `null`(마지막 페이지).
 * ⚠️ **링크를 그대로 fetch하지 않는다** — 질의만 꺼내 같은 경로로 다시 부른다. 링크의 호스트·경로가 기대와 다르면 던진다(토큰을 실은 요청이 응답이
 * 정한 주소로 가지 않는다). 오프셋 `x-total`은 큰 리포에서 빠진다(문서) — keyset으로 `next`가 없을 때까지 읽는다(W0 실측).
 */
export function nextKeysetQuery(link: string | null, expectedPath: string): Record<string, string> | null {
  if (link === null) return null;
  for (const part of link.split(",")) {
    const matched = /^\s*<([^>]+)>\s*;\s*rel="([^"]+)"\s*$/.exec(part);
    if (matched === null || matched[2] !== "next") continue;
    const next = new URL(matched[1]!);
    if (`${next.origin}${next.pathname}` !== `${GITLAB_API}${expectedPath}`) throw new AppError("GitLab pagination link points elsewhere");
    return Object.fromEntries(next.searchParams);
  }
  return null;
}

const BranchHead = z.object({ commit: z.object({ id: z.string().min(1), committed_date: z.string().min(1) }) });

/**
 * 브랜치 head SHA와 커밋 시각. 시각은 **ISO UTC로 정규화한다** — GitLab은 `+00:00` 오프셋으로 준다. 첫 적재가 이 값을 `lastCommitAt`으로 쓰고
 * CI의 첫 push가 그것과 비교한다(`checkCommitOrder` — 미래 시각이면 `stale-commit` 409).
 */
export function parseBranchHead(body: unknown): { sha: string; committedAt: string } | null {
  const parsed = BranchHead.safeParse(body);
  if (!parsed.success) return null;
  const at = Date.parse(parsed.data.commit.committed_date);
  if (Number.isNaN(at)) return null;
  return { sha: parsed.data.commit.id, committedAt: new Date(at).toISOString() };
}

const Blob = z.object({ encoding: z.literal("base64"), content: z.string() });

/** 전송 base64를 풀고 경로별 파일 인코딩을 판별한다. 전송 형식 오류는 null, 손상된 내용은 parse-failed다. */
export function decodeBlob(body: unknown, path = ""): DecodedLocaleFile | null {
  const parsed = Blob.safeParse(body);
  return parsed.success ? decodeLocaleFile(path, Buffer.from(parsed.data.content, "base64")) : null;
}

/**
 * Git LFS 포인터 파일인가 — REST 트리에는 표시가 없어 내용 첫 줄로 안다(spec 문법: 첫 줄이 정확히 이 값).
 * ⚠️ 포인터를 로케일 파일로 파싱하거나 Publish가 그 위에 실제 내용을 덮어쓰면 안 된다(design §3 원격 파일 판정).
 */
export function isLfsPointer(content: string): boolean {
  return content.startsWith("version https://git-lfs.github.com/spec/v1\n");
}

const BlobSizes = z.object({
  projects: z.object({
    nodes: z.array(z.object({
      id: z.string(),
      repository: z.object({
        blobs: z.object({
          pageInfo: z.object({ hasNextPage: z.boolean() }),
          nodes: z.array(z.object({ path: z.string(), size: z.string(), lfsOid: z.string().nullable(), oid: z.string() })),
        }),
      }),
    })),
  }),
});

/** GraphQL 숫자 id 주소 — `projects(ids: [...])`. `project(fullPath:)`는 쓰지 않는다(이름 주소 — design §3). */
export function projectGid(repositoryId: string): string {
  return `gid://gitlab/Project/${repositoryId}`;
}

/**
 * GraphQL `repository.blobs` 한 묶음 → 크기 지도 (design §3 `sizes`).
 *
 * - ⚠️ `size`는 **문자열**로 온다(`"89"`) — 숫자로 바꾸고 안전 정수가 아니면 `unavailable`(`checkDownloadBudget`이 `Number.isSafeInteger`를 본다).
 * - ⚠️ 응답 `project.id`가 저장된 gid와 다르면 `unavailable`(불변 id 검증). `oid`가 스냅샷의 blob id와 다르면 다른 ref의 크기다 — 역시 `unavailable`.
 * - `lfsOid`가 있으면 그 경로가 LFS 포인터다 — 거부 사유로 준다.
 * - 없는 경로는 결과에서 빠진다(GitLab 동작) — 지도에서도 빠지고 예산이 "크기를 모른다"로 거부한다. 0으로 세지 않는다.
 * - 다음 페이지가 있으면(잘림) `unavailable`이다.
 */
export function planBlobSizes(data: unknown, repositoryId: string, snapshot: Extract<RepoSnapshot, { status: "ok" }>, paths: readonly string[]): RepoSizes {
  const parsed = BlobSizes.safeParse(data);
  if (!parsed.success) return { status: "unavailable" };
  const [project, ...rest] = parsed.data.projects.nodes;
  if (project === undefined || rest.length > 0 || project.id !== projectGid(repositoryId)) return { status: "unavailable" };
  const blobs = project.repository.blobs;
  if (blobs.pageInfo.hasNextPage) return { status: "unavailable" };
  const wanted = new Set(paths);
  const shaByPath = new Map(snapshot.files.map((file) => [file.path, file.sha]));
  const sizes = new Map<string, number>();
  for (const node of blobs.nodes) {
    if (!wanted.has(node.path) || shaByPath.get(node.path) !== node.oid) return { status: "unavailable" };
    if (node.lfsOid !== null) return { status: "lfs", path: node.path };
    if (!/^(0|[1-9][0-9]*)$/.test(node.size)) return { status: "unavailable" };
    const size = Number(node.size);
    if (!Number.isSafeInteger(size)) return { status: "unavailable" };
    sizes.set(node.path, size);
  }
  return { status: "ok", sizes };
}

const MergeRequest = z.object({
  iid: z.number().int().positive(),
  web_url: z.string().url(),
  title: z.string(),
  target_branch: z.string().min(1),
  source_branch: z.string().min(1),
  source_project_id: z.number().int(),
  target_project_id: z.number().int(),
  state: z.string(),
  // 열린 MR 갱신의 비교 입력(locale-add R-B2 Y3) — 설명이 없으면 GitLab이 `null`을 준다.
  description: z.string().nullable().optional(),
});

/**
 * 열린 MR 목록 한 페이지 → 자기 프로젝트의 sync MR (design §2 "fork MR").
 *
 * ⚠️ **`source_project_id === target_project_id === 저장된 repositoryId`만** 고른다 — 프로젝트 MR 목록은 그 프로젝트를 target으로 하는 fork MR도
 * 돌려주고, 동명 브랜치의 fork MR을 재사용·닫기·자동 적재 보호 대상으로 고르면 남의 MR을 닫거나 남의 브랜치가 게이트를 쥔다.
 * 서버 필터(`state`·`source_branch`)를 믿지 않고 다시 본다 — 필터가 조용히 무시되면 다른 MR이 섞인다(GitHub `head` 필터의 함정과 같은 형).
 * ⚠️ 모양이 다르면 **던진다** — `null`(없음)로 접으면 게이트가 열린다.
 */
export function selectOwnMergeRequest(body: unknown, repositoryId: string, branch: string): { url: string; number: number; title: string; base: string; body: string } | null {
  const parsed = z.array(MergeRequest).safeParse(body);
  if (!parsed.success) throw new AppError("unexpected GitLab merge request list");
  const id = Number(repositoryId);
  const own = parsed.data.find((mr) => mr.state === "opened" && mr.source_branch === branch && mr.source_project_id === id && mr.target_project_id === id);
  return own === undefined ? null : { url: own.web_url, number: own.iid, title: own.title, base: own.target_branch, body: own.description ?? "" };
}

const Compare = z.object({
  commits: z.array(z.unknown()),
  diffs: z.array(z.object({ old_path: z.string(), new_path: z.string(), renamed_file: z.boolean() })),
  compare_timeout: z.boolean().optional(),
});

/**
 * compare(`straight=true` — from..to 직접 비교) → base 드리프트. `ahead = commits.length > 0 || diffs.length > 0`(design §3).
 * ⚠️ `compare_timeout: true`는 "변경 없음"이 아니라 **조회 실패**다 — 던진다(목록의 compare 모름은 0으로 접힌다, `lib/projects/remote.ts`).
 */
export function planCompare(body: unknown): { ahead: boolean; files: ChangedFile[] } {
  const parsed = Compare.safeParse(body);
  if (!parsed.success) throw new AppError("unexpected GitLab compare response");
  if (parsed.data.compare_timeout === true) throw new AppError("GitLab compare timed out");
  const { commits, diffs } = parsed.data;
  return {
    ahead: commits.length > 0 || diffs.length > 0,
    files: diffs.map((diff) => (diff.renamed_file ? { filename: diff.new_path, previous_filename: diff.old_path } : { filename: diff.new_path })),
  };
}

/**
 * `GET /projects/<id>` 판정 → 연결 건강성 (design §2 톤 표 — 프로젝트 Connection 행).
 *
 * - 재인가(401·403 스코프)·접근 상실(404·403)·SHA-256·보관 → `connection-unusable`(Disconnected — D22). 복구는 토큰 주인의 교체나 다른 OWNER의 재연결이다.
 * - ⚠️ 일시 장애 → `unknown`. **끊김으로 접지 않는다** — 장애를 끊김으로 말하면 멀쩡한 연결을 다시 만들게 한다(POSTMORTEM 2026-09-03).
 * - 같은 id·다른 경로 → `repo-moved`. 쓰기는 숫자 id로 가므로 끊김이 아니다 — 설정이 새 주소를 보인다. 대소문자만 다른 것은 이동이 아니다.
 * 저장된 만료일이 지난 경우는 호출 전에 판정한다(`./client`의 `loadGitLabHealth` — 원격 0).
 */
export function planGitLabHealth(stored: { owner: string; name: string }, meta: ProjectMetaVerdict): ConnectionHealth {
  switch (meta.status) {
    case "reconnect": case "forbidden": case "unsupported": return { status: "connection-unusable" };
    case "unavailable": return { status: "unknown" };
    case "ok": {
      if (meta.archived) return { status: "connection-unusable" };
      const now = `${meta.owner}/${meta.name}`;
      return now.toLowerCase() === `${stored.owner}/${stored.name}`.toLowerCase() ? { status: "ok" } : { status: "repo-moved", fullName: now };
    }
    default: return meta satisfies never;
  }
}
