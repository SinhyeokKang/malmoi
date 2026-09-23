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
   * 보관된 프로젝트 (7단계 — ARCHITECTURE §5.6.4). **`forbidden`과 가른다** — 권한은 그대로이고
   * 프로젝트가 멈춘 것이라, 화면이 "권한이 없다" 대신 "되돌리는 법"을 말해야 한다.
   */
  | { status: "archived"; projectId: string; role: Role }
  /**
   * `archived`는 **보관 사실과 함께** 통과한 경우에도 참이다 (logs-rework T4a) — 읽기를 허용한
   * 화면이 배너를 그려야 하므로, "통과했다"와 "멈춰 있다"를 한 값에 함께 싣는다.
   */
  | { status: "ok"; projectId: string; role: Role; archived: boolean };

/**
 * 보관된 프로젝트에서 이 permission을 **읽기로 통과시킬지**. 기본은 `block`이고, 지금 `read`를 받는
 * 화면은 Logs 하나다 (logs-rework spec 완료조건 11).
 *
 * ⚠️ **읽기 허용이 쓰기 허용이 아니다.** Server Action은 계속 기본값을 쓴다 — 정책이 인자라는 것이
 * 요지이고, 라우트 목록을 이 모듈 안에 두는 안은 **고르지 않았다**(경로 문자열이 판정 모듈에
 * 들어오면 `lib/routes.ts` 하나라는 생성기 규칙이 깨진다).
 */
export type ArchivedPolicy = "block" | "read";

/**
 * ⚠️ **"그런 slug가 없다"와 "멤버가 아니다"를 같은 `not-found`로 접는다.** URL을 안다는 사실은
 * 접근 권한이 아니고(PRODUCT §7.7), 둘을 404/403으로 가르면 **프로젝트 존재 여부가 샌다.**
 * 호출부는 프로젝트를 못 찾았을 때도 `member: null`을 넘긴다.
 *
 * 이건 `planInvitationAccept`가 `not-found`를 **가르는** 것과 방향이 반대인데 축이 다르다 —
 * 저기는 토큰 소지자에게 실패 이유를 알려야 하고, 여기는 남의 프로젝트 존재를 숨겨야 한다.
 *
 * `forbidden`은 **멤버이지만 permission이 모자란** 경우에만 쓴다. 그래야 화면이 "권한이 없다"와
 * "그런 프로젝트가 없다"를 다르게 말한다.
 *
 * 반환하는 `projectId`는 **멤버십 행의 것**이다 — 클라이언트가 보낸 값을 믿지 않는다 (ARCHITECTURE §6.00 ③).
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
  /** 기본은 `block`이다 — **정책을 안 준 진입점은 계속 막힌다**(fail-closed). */
  archivedPolicy?: ArchivedPolicy;
}): ProjectAccess {
  const { member, permission, archivedAt, archivedPolicy = "block" } = input;

  if (member === null) return { status: "not-found" };
  if (!canPerform(member.role, permission)) return { status: "forbidden" };
  const archived = archivedAt !== null;
  // ⚠️ **`project:settings`만 통과한다** — 그것이 되돌리는 길이다. 전부 막으면 보관이 편도가 된다.
  // `read` 정책은 그 위에 **읽기 전용 통과**를 하나 더 연다: 보관 사건과 그 직전 기록을 확인하려고
  // 복원해야 하는 순환을 끊는 것이 목적이고, 쓰기는 정책을 안 주는 Action 쪽에서 그대로 막힌다.
  if (archived && permission !== "project:settings" && archivedPolicy !== "read") {
    return { status: "archived", projectId: member.projectId, role: member.role };
  }
  return { status: "ok", projectId: member.projectId, role: member.role, archived };
}

export type LockedAccess = { status: "ok"; role: Role } | { status: "not-found" } | { status: "forbidden" } | { status: "archived" };

/**
 * **잠금 뒤 다시 읽은 값으로 쓰기를 판정한다** (감사 #9·#10·#26 — ARCHITECTURE §5.6.4). 진입점 판정은 잠금 전 1회라
 * 대기 중 제거·강등·보관을 못 본다. 판정은 `planProjectAccess` 그대로이고 **쓰기 규칙 하나**를 얹는다:
 * 보관된 프로젝트의 `project:settings` 쓰기는 보관 토글(`archiveToggle` — `archiveProject`·`unarchiveProject`)만 통과한다(PRODUCT §7.9 "보관 = Restore만").
 *
 * @param surface 표면 범위 쓰기면 잠금 뒤 읽은 표면. 없거나 보관됐으면 `not-found` — 진입점의 `getSurfaceAccess`와 같은 낱말이다.
 */
export function planLockedAccess(input: {
  member: MemberContext | null;
  permission: Permission;
  archivedAt: Date | null;
  surface?: { archivedAt: Date | null } | null;
  archiveToggle?: boolean;
}): LockedAccess {
  const access = planProjectAccess(input);
  if (access.status === "not-found" || access.status === "forbidden" || access.status === "archived") return { status: access.status };
  if (access.archived && input.archiveToggle !== true) return { status: "archived" };
  if (input.surface !== undefined && (input.surface === null || input.surface.archivedAt !== null)) return { status: "not-found" };
  return { status: "ok", role: access.role };
}
