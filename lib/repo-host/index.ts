// ⚠️ **`server-only`를 일부러 붙이지 않았다** — `lib/github.ts`와 같은 이유다(tsx 스크립트가 프로덕션 경로를 그대로 지난다).
// 클라이언트 유입은 `components/__tests__/client-graph.test.ts`가 막는다 — 이 파일은 `octokit`을 무는 구현을 import한다.
import * as github from "@/lib/github";
import type { ConnectionHealth } from "@/lib/github-connect/health";
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
    default:
      return unreachable(target.host);
  }
}

export function openRepoReader(target: RepoTarget): Promise<RepoReader> {
  switch (target.host) {
    case "github":
      return github.openRepoReader(target.owner, target.name, target.installationId, target.repositoryId);
    default:
      return unreachable(target.host);
  }
}

export function listBranches(target: RepoTarget): Promise<BranchList> {
  switch (target.host) {
    case "github":
      return github.listBranches(target.owner, target.name, target.installationId, target.repositoryId);
    default:
      return unreachable(target.host);
  }
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
    default:
      return unreachable(target.host);
  }
}
