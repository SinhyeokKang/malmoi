// ⚠️ **`server-only`를 직접 붙이지 않았다** — 클라이언트 유입은 `components/__tests__/client-graph.test.ts`가 막는다(이 파일은 `octokit`을 무는 구현을
// import한다). GitLab 갈래가 DB(`lib/db`)·연결 봉투(`lib/gitlab-connect/connection`)를 물어 tsx 스크립트에서는 열리지 않는다 — 스모크는 호스트 구현
// (`lib/github.ts`·`lib/gitlab/client.ts`)을 직접 문다.
import { getPrisma } from "@/lib/db";
import { AppError, logCaught } from "@/lib/failure";
import * as github from "@/lib/github";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { createProbeMemo, probeMemoKey, PROBE_MEMO_MAX, PROBE_MEMO_TTL_MS } from "@/lib/github-connect/probe-memo";
import { GITHUB_WAIT_MS, withinGithubWait } from "@/lib/github-wait";
import { openGitLabConnection } from "@/lib/gitlab-connect/connection";
import * as gitlab from "@/lib/gitlab/client";
import type { GitClient } from "@/lib/pull/client";
import type { PublishExecution } from "@/lib/sync/execution";
import type { BranchList, RepoReader } from "./reader";
import { unreachable, type RepoTarget, type RepoTargetResult } from "./target";

/**
 * 리포 호스트별 구현을 고르는 **유일한 자리** (gitlab-repositories design §3 "공통 경계"). 소비자는 호스트 구현(`lib/github.ts`)을 직접
 * import하지 않는다 — GitHub App·사용자 연결처럼 호스트 전용인 흐름만 예외다(consumers.md §1 "GitHub 전용 유지").
 *
 * ⚠️ **입력은 `repoTargetOf(project)`다** — 호출자 접근 확인을 지난 뒤에도 I/O는 프로젝트가 참조하는 연결로 연다. 호출자의 연결로 열지 않는다.
 * 판정은 여기 없다: 호스트를 고르고 넘길 뿐이다. 호스트가 늘면 각 `switch`에 갈래를 하나 더한다(`never` 검사가 빠뜨린 자리를 알린다).
 */

/** Publish·목록·게이트의 클라이언트. `execution`은 Publish 실행 수명이다 — 주면 요청이 그 수명에 묶이고 비GET은 쓰기로 세어진다. */
export function createGitClient(target: RepoTarget, execution?: PublishExecution): Promise<GitClient> {
  switch (target.host) {
    case "github":
      return github.createGitClient(target.owner, target.name, target.installationId, target.repositoryId, execution);
    case "gitlab":
      return gitlabCredential(target).then((credential) => gitlab.createGitLabClient(target, credential, { fetch: execution?.fetch() }));
    default:
      return unreachable(target);
  }
}

export function openRepoReader(target: RepoTarget): Promise<RepoReader> {
  switch (target.host) {
    case "github":
      return github.openRepoReader(target.owner, target.name, target.installationId, target.repositoryId);
    case "gitlab":
      return gitlabCredential(target).then((credential) => gitlab.openGitLabReader(target, credential));
    default:
      return unreachable(target);
  }
}

export function listBranches(target: RepoTarget): Promise<BranchList> {
  switch (target.host) {
    case "github":
      return github.listBranches(target.owner, target.name, target.installationId, target.repositoryId);
    case "gitlab":
      return listGitLabBranches(target);
    default:
      return unreachable(target);
  }
}

type GitLabTarget = Extract<RepoTarget, { host: "gitlab" }>;

/**
 * **프로젝트가 참조하는 연결**의 PAT를 연다(`target.connectionId` — 호출자의 연결이 아니다, design §5 · `credential-separation.test.ts`).
 * 참조가 가리키는 행이 없으면(해제와의 경합 — FK `SET NULL` 사이) 끊긴 것이다: 재연결이 고친다(`not-installed`). 봉투가 안 열리면 던진다 — 설정 오류다.
 */
async function gitlabCredential(target: GitLabTarget): Promise<gitlab.GitLabCredential> {
  const connection = await openGitLabConnection(getPrisma(), { connectionId: target.connectionId });
  if (connection === null) throw new AppError("GitLab connection was removed; reconnect the project", "not-installed");
  return { token: connection.token, expiresAt: connection.expiresAt };
}

async function listGitLabBranches(target: GitLabTarget): Promise<BranchList> {
  const connection = await openGitLabConnection(getPrisma(), { connectionId: target.connectionId });
  if (connection === null) return { status: "unavailable" };
  return gitlab.listGitLabBranches(target, { token: connection.token, expiresAt: connection.expiresAt });
}

/** Home·번역 화면의 GitLab 연결 건강성 메모 — GitHub probe 메모와 같은 TTL·상한, `unknown`은 기억하지 않는다(`probe-memo.ts`). */
const gitlabHealthMemo = createProbeMemo<ConnectionHealth>({ ttlMs: PROBE_MEMO_TTL_MS, max: PROBE_MEMO_MAX, transient: "unknown" });

async function loadGitLabHealth(target: GitLabTarget, options: { memo?: boolean }): Promise<ConnectionHealth> {
  const connection = await openGitLabConnection(getPrisma(), { connectionId: target.connectionId });
  // 참조가 가리키는 행이 사라졌다 — 끊김이다(`repoTargetOf`의 `connection-removed`와 같은 결론).
  if (connection === null) return { status: "connection-removed" };
  const credential = { token: connection.token, expiresAt: connection.expiresAt };
  // ⚠️ **마감이 GitHub probe와 같다**(`GITHUB_WAIT_MS` — 리포 호스트 원격 대기 전체의 공유 마감). 넘기면 `unknown`("확인할 수 없어요")이다.
  const probe = () => withinGithubWait(gitlab.loadGitLabHealth(target, credential), () => {
    logCaught("gitlab", "health-deadline", new AppError(`no response within ${GITHUB_WAIT_MS}ms`));
    return { status: "unknown" as const };
  });
  if (!options.memo) return probe();
  const key = probeMemoKey({ repoHost: "gitlab", repoOwner: target.owner, repoName: target.name, installationId: null, gitlabConnectionId: target.connectionId, repositoryId: target.repositoryId });
  return gitlabHealthMemo(key, probe);
}

/**
 * 저장된 연결 + 원격 확인 → 연결 건강성 (ARCHITECTURE §6.5.1). **`ok`가 아니면 원격 호출 0으로** 그 갈래를 돌려준다 — 판정이 이미 끝났다
 * (`storedConnection`과 같은 판정, `target.test.ts`).
 *
 * ⚠️ **try로 감싸지 않는다** — 구현이 던지는 것은 환경변수 누락(설정 오류)뿐이고, 그것을 `unknown`으로 접으면 설정 오류가 영원히
 * 일시 장애로 보인다(`lib/github.ts`의 `loadConnectionHealth` 주석).
 *
 * @param options.memo Home과 번역 화면만 켠다 — 표시 전용 판정을 짧게 기억한다(`probe-memo.ts`).
 */
export async function loadConnectionHealth(result: RepoTargetResult, options: { memo?: boolean } = {}): Promise<ConnectionHealth> {
  if (result.status !== "ok") return { status: result.status };
  const { target } = result;
  switch (target.host) {
    case "github":
      return github.loadConnectionHealth(
        { repoOwner: target.owner, repoName: target.name, installationId: target.installationId, repositoryId: target.repositoryId },
        options,
      );
    case "gitlab":
      return loadGitLabHealth(target, options);
    default:
      return unreachable(target);
  }
}
