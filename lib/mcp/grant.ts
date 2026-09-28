import { planProjectAccess, type ArchivedPolicy, type MemberContext } from "@/lib/auth/access";
import type { Permission, Role } from "@/lib/auth/permission";

/**
 * 유효 권한 = 역할 ∩ 토큰 (mcp-connector design §1.25). **토큰은 좁히기만 한다** — 새 역할도 넷째 `Permission`도 아니고(PRODUCT §4.2
 * "세밀한 RBAC" 비범위가 그대로 선다), 어휘는 기존 셋 + 프로젝트가 없는 동작 하나(`project:create`)다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

export type TokenGrant = Permission | "project:create";

/** 어휘 순서 — 발급 판정이 이 순서로 정규화하고 화면 체크박스도 이 순서다. */
export const TOKEN_GRANTS: readonly TokenGrant[] = ["translation:write", "project:settings", "member:manage", "project:create"];

export type TokenScope = { kind: "all" } | { kind: "projects"; projectIds: readonly string[] };

/** 서버가 토큰 행에서 구성한 권한. 도구 입력으로 받지 않는다 — `userId`는 멤버십 조회를 좁히는 데만 쓴다(POSTMORTEM 2026-09-06). */
export type ApiTokenAuthority = { userId: string; grants: readonly TokenGrant[]; scope: TokenScope };

export function inScope(scope: TokenScope, projectId: string): boolean {
  return scope.kind === "all" || scope.projectIds.includes(projectId);
}

export type ToolAccess =
  | { status: "ok"; projectId: string; role: Role; archived: boolean }
  /** 범위 밖 · 멤버 아님 · 없는 프로젝트 — 존재를 말하지 않는다. */
  | { status: "not-found" }
  /** 역할이 못 한다 — 화면과 같은 사유. */
  | { status: "forbidden" }
  | { status: "archived"; projectId: string; role: Role }
  /** 역할은 되는데 이 토큰이 그 동작을 안 받았다. */
  | { status: "token-scope" };

/**
 * **판정 순서가 계약이다**: 범위 → 멤버십·역할·보관(`planProjectAccess` 그대로) → 토큰 grant.
 * - 범위를 먼저 봐야 범위 밖 프로젝트의 보관·역할이 새지 않는다.
 * - 역할을 토큰보다 먼저 봐야 EDITOR에게 "토큰을 고치면 된다"는 거짓 안내가 안 선다.
 * - 보관도 토큰보다 먼저다 — 답이 "되돌리는 법"이어야 하고, grant를 고쳐도 보관된 프로젝트엔 못 쓴다.
 *
 * `rolePermission`(역할 조건)과 `tokenGrant`(위임 조건)는 별개다 — 역할의 permission을 grant로 자동 복제하지 않는다.
 * `tokenGrant === null`이면 grant 없는 토큰도 통과한다("내 프로젝트 안의 데이터"는 역할·범위 안에서 읽는다).
 */
export function planToolAccess(input: {
  token: ApiTokenAuthority;
  /** `token.userId`로 조회한 멤버십. 멤버가 아니거나 프로젝트가 없으면 `null`. */
  member: MemberContext | null;
  archivedAt: Date | null;
  archivedPolicy?: ArchivedPolicy;
  rolePermission: Permission;
  tokenGrant: TokenGrant | null;
}): ToolAccess {
  const { token, member, tokenGrant } = input;
  if (member === null || !inScope(token.scope, member.projectId)) return { status: "not-found" };
  const access = planProjectAccess({ member, permission: input.rolePermission, archivedAt: input.archivedAt, archivedPolicy: input.archivedPolicy });
  if (access.status !== "ok") return access;
  if (tokenGrant !== null && !token.grants.includes(tokenGrant)) return { status: "token-scope" };
  return access;
}

/** 프로젝트가 생기기 전의 동작(`create_project`·`list_repositories`·신규 경로의 `list_branches`·`detect_formats`). 역할 판정이 없다. */
export function planCreateAccess(input: { grants: readonly TokenGrant[] }): { status: "ok" } | { status: "token-scope" } {
  return input.grants.includes("project:create") ? { status: "ok" } : { status: "token-scope" };
}
