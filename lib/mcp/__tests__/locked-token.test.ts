import { describe, expect, it } from "vitest";

import { planLockedToken } from "../locked-token";

/**
 * **잠금 뒤 토큰 재판정** (mcp-connector design §1.25 "쓰기 주체와 잠금 뒤 재판정"). 입구의 grants/scope를 재사용하지 않고
 * 잠금 뒤 다시 읽은 행으로 판정한다 — 대기 중 폐기·재발급이 먼저 커밋됐으면 그것을 본다(spec 조건 6).
 * 순서: 토큰 유효성 → 범위 → (호출자의 멤버십·역할·보관) → grant. grant 거부는 역할 판정 뒤에 내야 하므로 `grant` 갈래를 따로 싣는다.
 */
const NOW = new Date("2026-09-28T00:00:00Z");
const row = (over: Partial<{ grants: string[]; allProjects: boolean; projectIds: string[]; expiresAt: Date }> = {}) =>
  ({ grants: ["translation:write"], allProjects: true, projectIds: [], expiresAt: new Date(NOW.getTime() + 1000), ...over });

describe("planLockedToken", () => {
  it("행이 없으면(폐기·재발급) unauthorized", () => {
    expect(planLockedToken({ row: null, now: NOW, projectId: "p", grant: "translation:write" })).toEqual({ status: "unauthorized" });
  });

  it("만료 경계 — expiresAt == now도 unauthorized, 1ms 앞이면 통과", () => {
    expect(planLockedToken({ row: row({ expiresAt: NOW }), now: NOW, projectId: "p", grant: "translation:write" })).toEqual({ status: "unauthorized" });
    expect(planLockedToken({ row: row({ expiresAt: new Date(NOW.getTime() + 1) }), now: NOW, projectId: "p", grant: "translation:write" })).toEqual({ status: "ok", grant: "ok" });
  });

  it("고른-범위 토큰의 범위 밖 프로젝트는 not-found — 존재를 말하지 않는다", () => {
    expect(planLockedToken({ row: row({ allProjects: false, projectIds: ["q"] }), now: NOW, projectId: "p", grant: "translation:write" })).toEqual({ status: "not-found" });
    expect(planLockedToken({ row: row({ allProjects: false, projectIds: ["p"] }), now: NOW, projectId: "p", grant: "translation:write" })).toEqual({ status: "ok", grant: "ok" });
  });

  it("grant가 없으면 token-scope를 싣되 ok로 돌려준다 — 역할 판정이 먼저다", () => {
    expect(planLockedToken({ row: row({ grants: ["translation:write"] }), now: NOW, projectId: "p", grant: "project:settings" })).toEqual({ status: "ok", grant: "token-scope" });
  });

  it("어휘 밖 grant 문자열은 어느 grant로도 읽지 않는다", () => {
    expect(planLockedToken({ row: row({ grants: ["project:settings "] }), now: NOW, projectId: "p", grant: "project:settings" })).toEqual({ status: "ok", grant: "token-scope" });
  });

  it("프로젝트가 없는 동작(project:create)은 범위를 보지 않는다", () => {
    expect(planLockedToken({ row: row({ allProjects: false, projectIds: [], grants: ["project:create"] }), now: NOW, projectId: null, grant: "project:create" })).toEqual({ status: "ok", grant: "ok" });
  });
});
