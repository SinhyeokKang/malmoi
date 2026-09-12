import type { Role } from "./permission";

/**
 * 멤버 제거·역할 변경 판정. **Project에는 항상 OWNER가 한 명 이상 있어야 한다** (ARCHITECTURE §6.02).
 *
 * ⚠️ **제거와 강등이 같은 함수를 지난다.** 강등을 별도 경로로 두면 "제거는 막고 강등은 통과"가
 * 되는데 결과는 같다 — OWNER 없는 프로젝트이고, 그 프로젝트는 아무도 설정을 바꿀 수 없다.
 */

export type MemberRow = { userId: string; role: Role };

export type MemberChange = "ok" | "last-owner" | "not-member";

/**
 * @param nextRole `null`이면 제거다. 자기 제거·탈퇴·타인 제거가 전부 이 값으로 들어온다.
 */
export function planMemberChange(input: {
  members: readonly MemberRow[];
  targetUserId: string;
  nextRole: Role | null;
}): MemberChange {
  const { members, targetUserId, nextRole } = input;

  const target = members.find((m) => m.userId === targetUserId);
  // 대상이 멤버가 아닌 것을 "성공"으로 접지 않는다 — 호출부가 없는 행을 지웠다고 보고하게 된다.
  if (target === undefined) return "not-member";

  // 소유권이 줄어드는 변경만 검사한다. 대상이 EDITOR이거나 OWNER를 유지하면 OWNER 수가 안 줄어든다.
  if (target.role !== "OWNER" || nextRole === "OWNER") return "ok";

  return members.filter((m) => m.role === "OWNER").length <= 1 ? "last-owner" : "ok";
}
