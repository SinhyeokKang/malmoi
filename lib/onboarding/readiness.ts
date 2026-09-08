import { m } from "@/lib/i18n";

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

/**
 * 목록 화면의 상태 텍스트 (design §3.7). **raw 색을 늘리지 않는다** — `ready`가 아닌 것은 오류가
 * 아니라 진행 중이므로 `text-muted-foreground` 텍스트로만 보인다 (DESIGN §6.2의 `not-connected`·
 * `unknown` 전례).
 *
 * ⚠️ **`ready`는 `null`이다.** 가장 흔한 상태가 가장 조용해야 한다 — "번역됨"에 배지를 안 붙이고
 * "연결됨"에 초록을 안 쓰는 것과 같은 원리다 (DESIGN §6.1).
 *
 * ⚠️ **내부 이름을 화면에 쓰지 않는다** (SAAS §3). 번역자도 이 목록을 보고, `awaiting_first_sync`는
 * 그에게 아무것도 알려주지 않는다.
 */
export function readinessLabel(readiness: ProjectReadiness): string | null {
  // ⚠️ `ready`는 `null`이다 — 가장 흔한 상태가 가장 조용해야 한다. 사전에 그 키를 두지 않는 이유이기도 하다.
  return readiness === "ready" ? null : m.projects.readiness[readiness];
}
