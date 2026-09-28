import { describe, expect, it } from "vitest";

import { planTokenCard } from "../view";

/**
 * `/mcp` 토큰 카드의 판정 (핸드오프 `1a`·`1b`·`1c` · README §10-3). 화면이 쓰는 범위는 **현재 멤버십(보관 제외)과 교집합한** 값이다 —
 * 발급 뒤 멤버에서 빠진 id는 판정에서 효과가 없으므로 개수에도 안 든다. 만료 경계는 인증과 같은 `expiresAt <= now`다.
 */

const now = new Date("2026-09-28T12:00:00.000Z");
const row = (over: Partial<Parameters<typeof planTokenCard>[0]["row"] & object> = {}) => ({
  grants: ["member:manage", "translation:write"],
  allProjects: true,
  projectIds: [],
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  lastUsedAt: null,
  expiresAt: new Date(now.getTime() + 86_400_000),
  ...over,
});

describe("planTokenCard", () => {
  it("행 없음 → none", () => {
    expect(planTokenCard({ row: null, memberProjectIds: ["p1"], now })).toEqual({ state: "none" });
  });

  it("만료 전 → active, grant는 어휘 순서로", () => {
    expect(planTokenCard({ row: row(), memberProjectIds: [], now })).toEqual({
      state: "active",
      grants: ["translation:write", "member:manage"],
      scope: { kind: "all" },
      createdAt: row().createdAt,
      lastUsedAt: null,
      expiresAt: row().expiresAt,
    });
  });

  it("expiresAt == now → expired (인증 경계와 같다)", () => {
    expect(planTokenCard({ row: row({ expiresAt: new Date(now) }), memberProjectIds: [], now })).toMatchObject({ state: "expired" });
  });

  it("projects 범위는 현재 멤버십과 교집합한다 — 빠진 프로젝트는 세지 않는다", () => {
    const card = planTokenCard({ row: row({ allProjects: false, projectIds: ["p1", "p2", "gone"] }), memberProjectIds: ["p2", "p1", "p3"], now });
    expect(card).toMatchObject({ scope: { kind: "projects", projectIds: ["p1", "p2"] } });
  });

  it("어휘 밖 grant는 버린다", () => {
    expect(planTokenCard({ row: row({ grants: ["admin", "project:create"] }), memberProjectIds: [], now })).toMatchObject({ grants: ["project:create"] });
  });
});
