import { describe, expect, it } from "vitest";

import { API_TOKEN_EXPIRY_DAYS, planApiTokenIssue } from "../issue-plan";

/**
 * 토큰 발급 판정 (mcp-connector design §3). 만료는 필수(30/90/365) · grant는 어휘 안 · 범위는 **현재 멤버십의 비보관 프로젝트**만 ·
 * 멤버십 0이면 `projects` 범위를 거부한다. 입력은 클라이언트가 보내므로 전부 거부 가능해야 한다.
 */

const now = new Date("2026-09-28T12:00:00.000Z");
const DAY = 86_400_000;
const MEMBER = ["p1", "p2"] as const;

describe("planApiTokenIssue — 만료", () => {
  it("선택지는 30 / 90 / 365일이다 — 만료 없는 토큰은 만들 수 없다", () => {
    expect(API_TOKEN_EXPIRY_DAYS).toEqual([30, 90, 365]);
  });

  it.each([30, 90, 365])("%i일 → now + N일", days => {
    const plan = planApiTokenIssue({ expiresInDays: days, grants: [], scope: { kind: "all" }, memberProjectIds: MEMBER, now });
    expect(plan).toMatchObject({ status: "ok", expiresAt: new Date(now.getTime() + days * DAY) });
  });

  it.each([0, 1, 7, 60, 366, -30, 90.5, Number.NaN, Number.POSITIVE_INFINITY])("목록 밖 %s → invalid expiresIn", days => {
    expect(planApiTokenIssue({ expiresInDays: days, grants: [], scope: { kind: "all" }, memberProjectIds: MEMBER, now })).toEqual({ status: "invalid", field: "expiresIn" });
  });
});

describe("planApiTokenIssue — grant", () => {
  it("빈 grant는 허용한다 — 읽기 전용 토큰", () => {
    expect(planApiTokenIssue({ expiresInDays: 90, grants: [], scope: { kind: "all" }, memberProjectIds: MEMBER, now })).toMatchObject({ status: "ok", grants: [] });
  });

  it("어휘 순서로 정규화하고 중복을 접는다 — 같은 선택이 같은 행이다", () => {
    const plan = planApiTokenIssue({ expiresInDays: 90, grants: ["project:create", "translation:write", "project:create"], scope: { kind: "all" }, memberProjectIds: MEMBER, now });
    expect(plan).toMatchObject({ status: "ok", grants: ["translation:write", "project:create"] });
  });

  it.each(["admin", "owner", "", "Translation:Write", "__proto__", "toString"])("어휘 밖 %j → invalid grants", grant => {
    expect(planApiTokenIssue({ expiresInDays: 90, grants: [grant], scope: { kind: "all" }, memberProjectIds: MEMBER, now })).toEqual({ status: "invalid", field: "grants" });
  });
});

describe("planApiTokenIssue — 범위", () => {
  it("all → allProjects true · projectIds 빈 배열", () => {
    const plan = planApiTokenIssue({ expiresInDays: 30, grants: [], scope: { kind: "all" }, memberProjectIds: MEMBER, now });
    expect(plan).toEqual({ status: "ok", grants: [], allProjects: true, projectIds: [], expiresAt: new Date(now.getTime() + 30 * DAY) });
  });

  it("멤버십 0이어도 all은 된다 — 생성 전용 토큰의 자리", () => {
    expect(planApiTokenIssue({ expiresInDays: 30, grants: ["project:create"], scope: { kind: "all" }, memberProjectIds: [], now })).toMatchObject({ status: "ok", allProjects: true });
  });

  it("projects → 현재 멤버십(비보관) 안이면 ok, 중복을 접고 입력 순서를 유지한다", () => {
    const plan = planApiTokenIssue({ expiresInDays: 30, grants: [], scope: { kind: "projects", projectIds: ["p2", "p1", "p2"] }, memberProjectIds: MEMBER, now });
    expect(plan).toMatchObject({ status: "ok", allProjects: false, projectIds: ["p2", "p1"] });
  });

  it("멤버십 밖(보관 포함 — 호출부가 비보관만 넘긴다) id가 하나라도 있으면 invalid scope", () => {
    expect(planApiTokenIssue({ expiresInDays: 30, grants: [], scope: { kind: "projects", projectIds: ["p1", "p9"] }, memberProjectIds: MEMBER, now })).toEqual({ status: "invalid", field: "scope" });
  });

  it("멤버십 0이면 projects 범위는 거부 — 고를 것이 없다", () => {
    expect(planApiTokenIssue({ expiresInDays: 30, grants: [], scope: { kind: "projects", projectIds: [] }, memberProjectIds: [], now })).toEqual({ status: "invalid", field: "scope" });
  });

  it("projects인데 빈 목록이면 거부 — 아무것도 못 여는 토큰을 만들지 않는다", () => {
    expect(planApiTokenIssue({ expiresInDays: 30, grants: [], scope: { kind: "projects", projectIds: [] }, memberProjectIds: MEMBER, now })).toEqual({ status: "invalid", field: "scope" });
  });

  it("프로토타입 키를 멤버십으로 읽지 않는다", () => {
    expect(planApiTokenIssue({ expiresInDays: 30, grants: [], scope: { kind: "projects", projectIds: ["__proto__"] }, memberProjectIds: MEMBER, now })).toEqual({ status: "invalid", field: "scope" });
  });
});
