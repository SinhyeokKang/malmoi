import { describe, expect, it } from "vitest";

import type { MemberContext } from "@/lib/auth/access";
import type { Permission, Role } from "@/lib/auth/permission";

import { TOKEN_GRANTS, inScope, planCreateAccess, planToolAccess, type ApiTokenAuthority, type TokenGrant } from "../grant";

/**
 * 유효 권한 = 역할 ∩ 토큰 (mcp-connector design §1.25). **판정 순서가 계약이다** — 범위 → 멤버십·역할·보관(`planProjectAccess`) →
 * 토큰 grant. 역할 조건(`rolePermission`)과 grant 조건(`tokenGrant`)은 별개이고 grant가 `null`이면 요구하지 않는다.
 *
 * ⚠️ **사용자 둘 · 토큰 둘로 시드한다** (POSTMORTEM 2026-09-06 — 인가는 지났는데 사용자로 안 좁혔다). 사용자 한 명이면
 * "토큰 A의 범위가 사용자 B의 멤버십을 연다" 같은 교차 누수를 셀 수 없다.
 */

const ALICE = "user-alice";
const BOB = "user-bob";
const P1 = "project-1";
const P2 = "project-2";

/** 사용자별 멤버십 — alice는 P1 OWNER · P2 EDITOR, bob은 P2 OWNER만. */
const MEMBERS: Record<string, Record<string, Role>> = {
  [ALICE]: { [P1]: "OWNER", [P2]: "EDITOR" },
  [BOB]: { [P2]: "OWNER" },
};

function member(userId: string, projectId: string): MemberContext | null {
  const role = MEMBERS[userId]?.[projectId];
  return role === undefined ? null : { projectId, role };
}

/** alice의 토큰: 번역만 · 전 프로젝트. bob의 토큰: 설정 · P2만. */
const ALICE_TOKEN: ApiTokenAuthority = { userId: ALICE, grants: ["translation:write"], scope: { kind: "all" } };
const BOB_TOKEN: ApiTokenAuthority = { userId: BOB, grants: ["project:settings", "member:manage"], scope: { kind: "projects", projectIds: [P2] } };

function access(token: ApiTokenAuthority, projectId: string, rolePermission: Permission, tokenGrant: TokenGrant | null, archivedAt: Date | null = null) {
  return planToolAccess({ token, member: member(token.userId, projectId), archivedAt, rolePermission, tokenGrant });
}

describe("TOKEN_GRANTS", () => {
  it("기존 Permission 셋 + 토큰 전용 project:create 하나다 — 역할 표에 넷째를 만들지 않는다", () => {
    expect(TOKEN_GRANTS).toEqual(["translation:write", "project:settings", "member:manage", "project:create"]);
  });
});

describe("inScope", () => {
  it("all은 모든 프로젝트", () => {
    expect(inScope({ kind: "all" }, P1)).toBe(true);
  });
  it("projects는 목록 안만", () => {
    expect(inScope({ kind: "projects", projectIds: [P2] }, P2)).toBe(true);
    expect(inScope({ kind: "projects", projectIds: [P2] }, P1)).toBe(false);
  });
  it("빈 목록은 아무것도 열지 않는다", () => {
    expect(inScope({ kind: "projects", projectIds: [] }, P1)).toBe(false);
  });
});

describe("planToolAccess — 역할 × 토큰 × 범위", () => {
  it("OWNER + grant 있음 → ok (역할·projectId는 멤버십 행의 것)", () => {
    expect(access(BOB_TOKEN, P2, "project:settings", "project:settings")).toEqual({ status: "ok", projectId: P2, role: "OWNER", archived: false });
  });

  it("grant 조건이 null이면 grant 없는 토큰도 읽는다 — '내 프로젝트 안의 데이터'", () => {
    const readOnly: ApiTokenAuthority = { ...ALICE_TOKEN, grants: [] };
    expect(access(readOnly, P2, "translation:write", null)).toEqual({ status: "ok", projectId: P2, role: "EDITOR", archived: false });
  });

  it("역할은 되는데 토큰이 안 받았다 → token-scope", () => {
    // alice는 P1 OWNER지만 토큰은 번역만 준다.
    expect(access(ALICE_TOKEN, P1, "member:manage", "member:manage")).toEqual({ status: "token-scope" });
  });

  it("역할이 못 하면 토큰에 grant가 있어도 forbidden — 토큰은 좁히기만 한다", () => {
    const wide: ApiTokenAuthority = { ...ALICE_TOKEN, grants: ["translation:write", "project:settings"] };
    expect(access(wide, P2, "project:settings", "project:settings")).toEqual({ status: "forbidden" });
  });

  it("역할 판정이 토큰보다 먼저다 — EDITOR에게 '토큰을 고치면 된다'는 거짓 안내가 안 선다", () => {
    // 역할도 안 되고 토큰도 안 받은 경우 → forbidden (token-scope가 아니다)
    expect(access(ALICE_TOKEN, P2, "project:settings", "project:settings")).toEqual({ status: "forbidden" });
  });

  it("범위 밖은 not-found — 존재를 말하지 않는다(멤버 아님과 같은 갈래)", () => {
    // bob의 토큰은 P2만. bob이 P1 멤버가 아니기도 하지만, 멤버였어도 범위 밖이다 — 아래 케이스.
    const bobWithP1: ApiTokenAuthority = { ...BOB_TOKEN };
    const res = planToolAccess({ token: bobWithP1, member: { projectId: P1, role: "OWNER" }, archivedAt: null, rolePermission: "project:settings", tokenGrant: null });
    expect(res).toEqual({ status: "not-found" });
  });

  it("범위를 멤버십보다 먼저 본다 — 범위 밖 프로젝트의 보관·역할이 새지 않는다", () => {
    const scoped: ApiTokenAuthority = { userId: ALICE, grants: [], scope: { kind: "projects", projectIds: [P1] } };
    // P2에서 alice는 EDITOR라 settings는 forbidden이고, 보관돼 있으면 archived일 텐데 — 범위 밖이라 둘 다 not-found다.
    expect(planToolAccess({ token: scoped, member: member(ALICE, P2), archivedAt: new Date(), rolePermission: "project:settings", tokenGrant: null })).toEqual({ status: "not-found" });
    expect(planToolAccess({ token: scoped, member: member(ALICE, P2), archivedAt: new Date(), rolePermission: "translation:write", tokenGrant: null })).toEqual({ status: "not-found" });
  });

  it("범위 안이어도 멤버가 아니면 not-found — 범위는 멤버십을 넓히지 않는다", () => {
    // alice의 토큰은 all이지만 bob의 프로젝트에 alice가 없다고 가정한 P3.
    expect(access(ALICE_TOKEN, "project-3", "translation:write", null)).toEqual({ status: "not-found" });
  });

  it("사용자 교차 — 토큰 범위가 다른 사용자의 멤버십을 열지 않는다", () => {
    // bob 토큰(범위 P2)을 alice의 멤버십으로 평가하는 경로가 없다: member는 token.userId로 조회한다.
    // alice의 P1 OWNER 멤버십을 bob 토큰에 붙이면 범위 밖 → not-found.
    expect(planToolAccess({ token: BOB_TOKEN, member: member(ALICE, P1), archivedAt: null, rolePermission: "translation:write", tokenGrant: null })).toEqual({ status: "not-found" });
    // bob 자신은 P1 멤버가 아니다.
    expect(access(BOB_TOKEN, P1, "translation:write", null)).toEqual({ status: "not-found" });
  });

  it("멤버에서 제거된 사용자는 범위 안이어도 not-found", () => {
    expect(planToolAccess({ token: ALICE_TOKEN, member: null, archivedAt: null, rolePermission: "translation:write", tokenGrant: null })).toEqual({ status: "not-found" });
  });

  it("allProjects=false + 빈 projectIds 토큰은 모든 프로젝트가 not-found", () => {
    const empty: ApiTokenAuthority = { userId: ALICE, grants: ["translation:write"], scope: { kind: "projects", projectIds: [] } };
    expect(access(empty, P1, "translation:write", "translation:write")).toEqual({ status: "not-found" });
    expect(access(empty, P2, "translation:write", null)).toEqual({ status: "not-found" });
  });
});

describe("planToolAccess — 보관", () => {
  const archivedAt = new Date("2026-09-01T00:00:00.000Z");

  it("보관된 프로젝트의 쓰기는 archived — planProjectAccess와 같은 판정", () => {
    expect(access(ALICE_TOKEN, P2, "translation:write", "translation:write", archivedAt)).toEqual({ status: "archived", projectId: P2, role: "EDITOR" });
  });

  it("보관 판정이 토큰보다 먼저다 — grant가 없어도 archived로 답한다(되돌리는 법을 말한다)", () => {
    const readOnly: ApiTokenAuthority = { ...ALICE_TOKEN, grants: [] };
    expect(access(readOnly, P2, "translation:write", "translation:write", archivedAt)).toEqual({ status: "archived", projectId: P2, role: "EDITOR" });
  });

  it("역할 부족이 보관보다 먼저다 — 권한 없는 사람에게 보관 여부가 새지 않는다", () => {
    expect(access(ALICE_TOKEN, P2, "project:settings", "project:settings", archivedAt)).toEqual({ status: "forbidden" });
  });

  it("project:settings는 보관 중에도 통과한다(복원 경로) — 단 grant는 여전히 요구한다", () => {
    expect(access(BOB_TOKEN, P2, "project:settings", "project:settings", archivedAt)).toEqual({ status: "ok", projectId: P2, role: "OWNER", archived: true });
    const noSettings: ApiTokenAuthority = { ...BOB_TOKEN, grants: ["member:manage"] };
    expect(access(noSettings, P2, "project:settings", "project:settings", archivedAt)).toEqual({ status: "token-scope" });
  });

  it("archivedPolicy read는 읽기 예외(list_events)만 연다", () => {
    const res = planToolAccess({ token: ALICE_TOKEN, member: member(ALICE, P2), archivedAt, archivedPolicy: "read", rolePermission: "translation:write", tokenGrant: null });
    expect(res).toEqual({ status: "ok", projectId: P2, role: "EDITOR", archived: true });
  });
});

describe("planCreateAccess — 프로젝트가 없는 동작", () => {
  it("project:create grant가 있으면 ok", () => {
    expect(planCreateAccess({ grants: ["project:create"] })).toEqual({ status: "ok" });
  });

  it("없으면 token-scope — 역할 판정이 없다(프로젝트가 생기기 전의 일)", () => {
    expect(planCreateAccess({ grants: ["translation:write", "project:settings", "member:manage"] })).toEqual({ status: "token-scope" });
    expect(planCreateAccess({ grants: [] })).toEqual({ status: "token-scope" });
  });
});
