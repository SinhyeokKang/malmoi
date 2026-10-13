import { hasRepoConnection, type ProjectRepoColumns } from "@/lib/repo-host/target";

/**
 * `ready` 판정 — 컬럼을 만들지 않고 기존 두 컬럼으로 판정한다 (PRODUCT §7.5).
 *
 * ```
 * setup               연결 증거 없음           연결 전 — 온보딩이 만들면 이 상태로 안 남는다. skillflo-web이 여기다
 *                     (GitHub installationId == null · GitLab repositoryId == null — GitLab 행은 생성 때 연결된 채로 태어나 여기 오지 않는다.
 *                      연결자가 떠난 GitLab 프로젝트는 `ready` 그대로이고 [Reconnect]가 고친다 — `repoConnectionPinned`)
 * awaiting_first_sync lastCommitSha == null    행은 있는데 적재가 안 끝났다
 * ready               lastCommitSha != null
 * ```
 *
 * ⚠️ **`lastCommitSha`가 "첫 적재가 성공했다"의 유일한 증거다.** `applyPush`가 키·번역·refs와 **한
 * `$transaction`** 에서 그 컬럼을 쓰므로 부분 성공 상태가 없다. 설정(어댑터·경로·기준 로케일)이 저장됐다는
 * 것은 `ready`가 아니다 — ARCHITECTURE §0 불변식 8. `ProjectAccess` union에 넣지 않는 이유는 ARCHITECTURE §6.3에 있다
 * (넣으면 `saveTranslationKey`·설정 화면까지 그 값이 흘러가고 `ACCESS_ERRORS` Set을 손으로 늘리게 된다).
 */

export type ProjectReadiness = "setup" | "awaiting_first_sync" | "ready";

export function planProjectReadiness(project: Pick<ProjectRepoColumns, "repoHost" | "installationId" | "repositoryId"> & {
  surfaces: readonly { archivedAt: Date | null; lastCommitSha: string | null }[];
}): ProjectReadiness {
  // 연결이 먼저다 — 더미 SHA가 있어도 연결이 없으면 pull이 돌 수 없다. GitHub은 설치, GitLab은 고정된 리포다(`hasRepoConnection` —
  // 참조가 빈 GitLab 프로젝트는 `setup`이 아니라 [Reconnect]다).
  const connected = hasRepoConnection(project);
  if (!connected) return "setup";
  if (!project.surfaces.some(surface => surface.archivedAt === null && planSurfaceReadiness({ connected, surface }) === "ready")) return "awaiting_first_sync";
  return "ready";
}

/** @param connected `hasRepoConnection(project)` — 프로젝트의 연결 증거가 있는가. */
export function planSurfaceReadiness(input: {
  connected: boolean;
  surface: { lastCommitSha: string | null };
}): ProjectReadiness {
  if (!input.connected) return "setup";
  return input.surface.lastCommitSha === null ? "awaiting_first_sync" : "ready";
}
