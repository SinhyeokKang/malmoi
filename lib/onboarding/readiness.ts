/**
 * `ready` 판정 — 컬럼을 만들지 않고 기존 두 컬럼으로 판정한다 (design §3.7).
 *
 * ```
 * setup               installationId == null   연결 전 — 온보딩이 만들면 이 상태로 안 남는다. skillflo-web이 여기다
 * awaiting_first_sync lastCommitSha == null    행은 있는데 적재가 안 끝났다
 * ready               lastCommitSha != null
 * ```
 *
 * ⚠️ **`lastCommitSha`가 "첫 적재가 성공했다"의 유일한 증거다.** `applyPush`가 키·번역·refs와 **한 배열형
 * `$transaction`** 에서 그 컬럼을 쓰므로 부분 성공 상태가 없다. 설정(어댑터·경로·기준 로케일)이 저장됐다는
 * 것은 `ready`가 아니다 — SAAS 불변식 8. `ProjectAccess` union에 넣지 않는 이유는 design §3.7에 있다
 * (넣으면 `saveTranslation`·설정 화면까지 그 값이 흘러가고 `ACCESS_ERRORS` Set을 손으로 늘리게 된다).
 */

export type ProjectReadiness = "setup" | "awaiting_first_sync" | "ready";

export function planProjectReadiness(project: {
  installationId: string | null;
  lastCommitSha: string | null;
}): ProjectReadiness {
  // 연결이 먼저다 — 더미 SHA가 있어도 설치가 없으면 pull이 돌 수 없다.
  if (project.installationId === null) return "setup";
  if (project.lastCommitSha === null) return "awaiting_first_sync";
  return "ready";
}
