import { inScope, TOKEN_GRANTS, type TokenGrant } from "./grant";
import { planApiTokenUse } from "./token";

/**
 * **잠금 뒤 다시 읽은 `ApiToken` 행으로 쓰기를 재판정한다** (mcp-connector design §1.25 "쓰기 주체와 잠금 뒤 재판정").
 * 입구에서 얻은 grants/scope를 재사용하지 않는다 — 대기 중 폐기·재발급 tx가 먼저 커밋됐으면 재읽기가 그것을 본다(spec 조건 6).
 *
 * 순서는 `planToolAccess`와 같다: 유효성 → 범위 → (호출자의 멤버십·역할·보관) → grant. 멤버십 이하는 잠금 자리가 이미 읽으므로
 * grant 판정은 **값으로만 싣고** 거부는 호출자가 역할 판정 뒤에 낸다 — EDITOR에게 "토큰을 고치면 된다"는 거짓 안내를 막는 순서다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다. 행 조회는 `lib/auth/lock.ts`가 `userId`와 `tokenHash`를 **함께** 조건으로 한다.
 */
export type LockedToken =
  | { status: "ok"; grant: "ok" | "token-scope" }
  /** 없음·폐기·재발급·만료 — 인증 거부. 사건을 남기지 않는다. */
  | { status: "unauthorized" }
  /** 범위 밖 — 존재를 말하지 않는다. */
  | { status: "not-found" };

export type LockedTokenRow = { grants: readonly string[]; allProjects: boolean; projectIds: readonly string[]; expiresAt: Date };

export function planLockedToken(input: {
  row: LockedTokenRow | null;
  now: Date;
  /** `null`은 프로젝트가 생기기 전의 동작(`project:create`)이다 — 범위를 보지 않는다. */
  projectId: string | null;
  grant: TokenGrant;
}): LockedToken {
  const { row } = input;
  if (row === null || planApiTokenUse({ row, now: input.now }).status !== "ok") return { status: "unauthorized" };
  const scope = row.allProjects ? { kind: "all" as const } : { kind: "projects" as const, projectIds: row.projectIds };
  if (input.projectId !== null && !inScope(scope, input.projectId)) return { status: "not-found" };
  // 어휘 밖 문자열은 어느 grant로도 읽지 않는다 — 저장 컬럼이 `String[]`라 DB가 어휘를 강제하지 않는다.
  const grants = row.grants.filter((g): g is TokenGrant => (TOKEN_GRANTS as readonly string[]).includes(g));
  return { status: "ok", grant: grants.includes(input.grant) ? "ok" : "token-scope" };
}
