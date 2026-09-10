import { canPerform, type Permission, type Role } from "./permission";

/**
 * 프로젝트 인가의 **판정 전부**. 껍데기(`requireProjectAccess`)는 조회와 redirect만 한다 —
 * `checkBearer`(`lib/push/auth.ts`)·`planSave`(`lib/keys/save.ts`)와 같은 결이다.
 */

export type MemberContext = { projectId: string; role: Role };

export type ProjectAccess =
  | { status: "not-found" }
  | { status: "forbidden" }
  /**
   * 보관된 프로젝트 (7단계 — sync-runs design §4). **`forbidden`과 가른다** — 권한은 그대로이고
   * 프로젝트가 멈춘 것이라, 화면이 "권한이 없다" 대신 "되돌리는 법"을 말해야 한다.
   */
  | { status: "archived"; projectId: string; role: Role }
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
 *
 * ⚠️ **보관 판정이 여기 있는 이유** (7단계, 결정 1): 페이지·Server Action이 각자 `archivedAt`을 보면
 * 새 화면 하나가 조용히 빠지는데, 인가 union에 두면 `entry-points.test.ts`가 세는 **모든 진입점이
 * 한 자리에서** 거부된다. 목록에서 숨기는 대신 이렇게 하는 것은, 숨기면 되돌릴 링크에 도달할 길이
 * 없어지기 때문이다.
 *
 * @param archivedAt 보관 시각. **판정 순서가 의미를 갖는다** — 권한 부족이 보관보다 앞이다:
 *   EDITOR가 보관된 프로젝트의 설정을 열려 할 때 답은 "권한 없음"이지 "보관됨"이 아니고,
 *   그래야 보관 여부가 권한 없는 사람에게 새지 않는다.
 */
export function planProjectAccess(input: {
  member: MemberContext | null;
  permission: Permission;
  archivedAt: Date | null;
}): ProjectAccess {
  const { member, permission, archivedAt } = input;

  if (member === null) return { status: "not-found" };
  if (!canPerform(member.role, permission)) return { status: "forbidden" };
  // ⚠️ **`project:settings`만 통과한다** — 그것이 되돌리는 길이다. 전부 막으면 보관이 편도가 된다.
  if (archivedAt !== null && permission !== "project:settings") {
    return { status: "archived", projectId: member.projectId, role: member.role };
  }
  return { status: "ok", projectId: member.projectId, role: member.role };
}
