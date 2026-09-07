import type { RepoConnect } from "@/lib/github-connect/connect-plan";

/**
 * 프로젝트 생성 가부가 값으로 판정되는 한 자리 (design §5). `planRepoConnect`(SAAS §5.4 3중 검증)의 결과를
 * 받아 **그대로 흘리고**, 그 위에 OWNER 개수 제한과 slug 충돌을 얹는다. 순서: 연결 거부 → 제한 → 충돌 —
 * 거부될 요청에 다른 사유를 덧붙이지 않고, 슬롯이 없으면 slug를 바꿔도 소용없다.
 *
 * ⚠️ **`unavailable`은 `unavailable`로 그대로 나간다.** 조회 실패를 거부로 접으면 사용자가 있는 권한을
 * 없다고 믿는다 (POSTMORTEM 2026-09-03).
 */

/**
 * 사용자당 프로젝트 상한 — 자율 가입의 대가로 5단계가 먼저 건 유일한 고정 제한이다 (spec §4). 호출부가 `limit`으로
 * 넘기고 `onboardErrorMessage`가 문구의 숫자로 쓴다 — 두 곳이 갈리면 문구가 거짓이 된다.
 */
export const PROJECT_LIMIT = 3;

export type ProjectCreate =
  | { status: "ok"; installationId: string; repoOwner: string; repoName: string }
  | { status: Exclude<RepoConnect["status"], "ok"> | "limit-reached" | "slug-taken" };

/**
 * @param ownerCount 호출부가 **OWNER 행만** 센 값이다 (`projectMember.count({ userId, role: OWNER })`).
 *   멤버십 전체를 세면 EDITOR로 초대만 받은 사람이 하나도 못 만든다 (spec §4).
 * @param limit 사용자당 프로젝트 상한 — 보통 `PROJECT_LIMIT`이다. 인자로 받는 것은 테스트가 상수를 바꾸지 않고
 *   경계를 밟기 위해서다.
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

  // installationId·이름은 **probe가 준 값**이다 — 클라이언트 입력이 아니다 (SAAS §5.2).
  const { installationId, repoOwner, repoName } = repoConnect;
  return { status: "ok", installationId, repoOwner, repoName };
}
