/**
 * 역할별 권한 (SAAS.md §3).
 *
 * **역할은 둘뿐이다.** Viewer·Admin·Billing은 실제 요구가 생기기 전까지 만들지 않는다 —
 * MVP §7의 "세밀한 권한" 비범위가 SaaS에서도 유지된다.
 *
 * ⚠️ **Publish는 별도 permission이 아니라 `translation:write`에 들어 있다.** SAAS §3이 EDITOR에게
 * Publish를 허용했고(PR 생성이지 base branch 직접 쓰기가 아니다), "개발자만 Publish"가 실제로
 * 필요해지면 그때 나눈다. 지금 넷째 permission을 두는 것은 쓰이지 않는 축을 미리 만드는 것이다.
 *
 * **로그인 provider가 권한을 정하지 않는다** — `ProjectMember.role`만 정한다 (SAAS §9 불변식 7).
 */

/**
 * ⚠️ **§2에서 Prisma가 `enum Role`을 생성하면 이 타입을 그것의 별칭으로 바꾼다** —
 * 두 벌로 두면 한쪽만 늘어났을 때 컴파일러가 침묵하고, 스키마와 판정이 서로 다른 역할 집합을
 * 본다. 지금 별칭이 아닌 이유는 하나뿐이다: 그 enum이 아직 없고, 이 모듈은 생성물
 * (`generated/prisma/client`)에 의존하지 않아야 테스트가 `db:generate` 없이 돈다.
 */
export type Role = "OWNER" | "EDITOR";

export type Permission = "translation:write" | "project:settings" | "member:manage";

/**
 * `Record<Role, ...>`라 **역할이 늘면 여기서 컴파일 에러가 난다.** 목록을 빠뜨린 역할이
 * 조용히 `undefined`가 되어 전부 통과하거나 전부 거부되는 일을 막는다.
 */
const GRANTED: Record<Role, readonly Permission[]> = {
  OWNER: ["translation:write", "project:settings", "member:manage"],
  EDITOR: ["translation:write"],
};

/** 표에 없으면 거부한다 — fail-closed (ARCHITECTURE §6). */
export function canPerform(role: Role, permission: Permission): boolean {
  return GRANTED[role].includes(permission);
}
