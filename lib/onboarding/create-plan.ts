import type { RepoConnect } from "@/lib/github-connect/connect-plan";

/**
 * 프로젝트 생성 가부가 값으로 판정되는 한 자리 (ARCHITECTURE §3.1). `planRepoConnect`(ARCHITECTURE §6 3중 검증)의 결과를
 * 받아 **그대로 흘리고**, 그 위에 OWNER 개수 제한과 slug 충돌을 얹는다. 순서: 연결 거부 → 제한 → 충돌 —
 * 거부될 요청에 다른 사유를 덧붙이지 않고, 슬롯이 없으면 slug를 바꿔도 소용없다.
 *
 * ⚠️ **`unavailable`은 `unavailable`로 그대로 나간다.** 조회 실패를 거부로 접으면 사용자가 있는 권한을
 * 없다고 믿는다 (POSTMORTEM 2026-09-03).
 */

/**
 * 사용자당 프로젝트 상한 — 자율 가입의 대가로 5단계가 먼저 건 유일한 고정 제한이다 (PRODUCT §4.2). 호출부는
 * `projectLimitFor`로 사용자별 값을 받아 `limit`으로 넘기고, 문구(`onboardErrorMessage` 등)는 **이 상수**를 숫자로
 * 쓴다 — 거부를 받는 사람은 운영자가 아니므로 문구의 3은 계속 참이다.
 */
export const PROJECT_LIMIT = 3;

/**
 * 그 사용자의 상한 — 운영자(자율 가입자가 아니다)는 `Infinity`. ⚠️ **비교에만 쓴다** — 결과 타입·문구·MCP 응답에
 * 실으면 화면에 `∞`, JSON에 `null`이 나간다. 이 파일은 클라이언트 그래프라 운영자 판정(`lib/operator/`)을
 * 부르지 않고 판정 결과만 받는다.
 */
export function projectLimitFor(operator: boolean): number {
  return operator ? Infinity : PROJECT_LIMIT;
}

export type ProjectCreate =
  | { status: "ok"; installationId: string; repoOwner: string; repoName: string }
  | { status: Exclude<RepoConnect["status"], "ok"> | "limit-reached" | "slug-taken" };

/**
 * @param ownerCount 호출부가 **OWNER 행만** 센 값이다 (`projectMember.count({ userId, role: OWNER })`).
 *   멤버십 전체를 세면 EDITOR로 초대만 받은 사람이 하나도 못 만든다 (ARCHITECTURE §3.1).
 *   ⚠️ **이 값은 트랜잭션 밖의 선조회다** — 거부될 요청이 GitHub을 읽지 않게 하는 것이 그 목적이고,
 *   **제한의 실제 방어선은 `createProject`의 트랜잭션 안 재집계**다(`User` 행을 잠그고 다시 센다,
 *   2026-09-07 리뷰 🟡7). 여기만 믿으면 두 탭의 동시 생성이 슬롯을 하나 더 만든다.
 * @param limit 그 사용자의 상한 — `projectLimitFor`의 값이다(운영자면 `Infinity`, 아니면 `PROJECT_LIMIT`).
 */
export function planProjectCreate(input: {
  repoConnect: RepoConnect;
  ownerCount: number;
  slugTaken: boolean;
  limit: number;
}): ProjectCreate {
  const { repoConnect, ownerCount, slugTaken, limit } = input;

  if (repoConnect.status !== "ok") return { status: repoConnect.status };
  if (ownerCount >= limit) return { status: "limit-reached" };
  if (slugTaken) return { status: "slug-taken" };

  // installationId·이름은 **probe가 준 값**이다 — 클라이언트 입력이 아니다 (ARCHITECTURE §6.00 ③).
  const { installationId, repoOwner, repoName } = repoConnect;
  return { status: "ok", installationId, repoOwner, repoName };
}
