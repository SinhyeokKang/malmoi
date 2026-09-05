import { canPerform, type Permission, type Role } from "./permission";

/**
 * 프로젝트 인가의 **판정 전부**. 껍데기(`requireProjectAccess`)는 조회와 redirect만 한다 —
 * `checkBearer`(`lib/push/auth.ts`)·`planSave`(`lib/keys/save.ts`)와 같은 결이다.
 */

export type MemberContext = { projectId: string; role: Role };

export type ProjectAccess =
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "ok"; projectId: string; role: Role };

/**
 * ⚠️ **"그런 slug가 없다"와 "멤버가 아니다"를 같은 `not-found`로 접는다.** URL을 안다는 사실은
 * 접근 권한이 아니고(SAAS §7.7), 둘을 404/403으로 가르면 **프로젝트 존재 여부가 샌다.**
 * 호출부는 프로젝트를 못 찾았을 때도 `member: null`을 넘긴다.
 *
 * 이건 `planInvitationAccept`가 `not-found`를 **가르는** 것과 방향이 반대인데 축이 다르다 —
 * 저기는 토큰 소지자에게 실패 이유를 알려야 하고, 여기는 남의 프로젝트 존재를 숨겨야 한다.
 *
 * `forbidden`은 **멤버이지만 permission이 모자란** 경우에만 쓴다. 그래야 화면이 "권한이 없다"와
 * "그런 프로젝트가 없다"를 다르게 말한다.
 *
 * 반환하는 `projectId`는 **멤버십 행의 것**이다 — 클라이언트가 보낸 값을 믿지 않는다 (SAAS §5.2).
 */
export function planProjectAccess(input: {
  member: MemberContext | null;
  permission: Permission;
}): ProjectAccess {
  const { member, permission } = input;

  if (member === null) return { status: "not-found" };
  if (!canPerform(member.role, permission)) return { status: "forbidden" };
  return { status: "ok", projectId: member.projectId, role: member.role };
}
