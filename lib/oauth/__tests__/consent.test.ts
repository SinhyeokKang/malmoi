import { describe, expect, it } from "vitest";

import { planConsent } from "../consent";

const NOW = new Date("2026-09-29T00:00:00Z");
const DAY = 86_400_000;

/**
 * 동의 = 개인 토큰 발급과 같은 판정 (spec 조건 4 · design §3). 호출자는 **현재 멤버십 중 비보관** 프로젝트 id만 넘긴다 —
 * 보관·비멤버 프로젝트는 그 목록에 없어서 거부된다. 역할은 입력이 아니다: 역할 ∩ grant는 도구 실행 시 판정한다.
 */
const consent = (over: Partial<Parameters<typeof planConsent>[0]> = {}) => planConsent({
  expiresInDays: 90, grants: ["translation:write"], scope: { kind: "all" }, memberProjectIds: ["p1", "p2"], now: NOW, ...over,
});

describe("planConsent", () => {
  it("전체 범위 — 연결 수명은 동의 시점 + 고른 일수", () => {
    expect(consent()).toEqual({ status: "ok", grants: ["translation:write"], allProjects: true, projectIds: [], connectionExpiresAt: new Date(NOW.getTime() + 90 * DAY) });
  });

  it.each([30, 90, 365])("만료 %i일은 받는다", days => {
    expect(consent({ expiresInDays: days })).toMatchObject({ status: "ok", connectionExpiresAt: new Date(NOW.getTime() + days * DAY) });
  });

  it.each([0, 1, 60, 366, -30, Number.NaN])("만료 %s일은 거부한다 — 만료 없는 연결은 없다", days => {
    expect(consent({ expiresInDays: days })).toEqual({ status: "invalid", field: "expiresIn" });
  });

  it("grant 어휘 밖·프로토타입 이름은 거부한다", () => {
    expect(consent({ grants: ["admin"] })).toEqual({ status: "invalid", field: "grants" });
    expect(consent({ grants: ["__proto__"] })).toEqual({ status: "invalid", field: "grants" });
  });

  it("grant는 어휘 순서로 정규화된다", () => {
    expect(consent({ grants: ["project:create", "translation:write"] })).toMatchObject({ grants: ["translation:write", "project:create"] });
  });

  it("역할로 선택을 좁히지 않는다 — member:manage도 그대로 받는다(실행 시 역할 ∩ grant)", () => {
    expect(consent({ grants: ["member:manage", "project:settings"] })).toMatchObject({ status: "ok", grants: ["project:settings", "member:manage"] });
  });

  it("고른 범위 — 현재 비보관 멤버십 안이면 받는다(중복은 한 번)", () => {
    expect(consent({ scope: { kind: "projects", projectIds: ["p2", "p2"] } })).toMatchObject({ status: "ok", allProjects: false, projectIds: ["p2"] });
  });

  it("비멤버·보관 프로젝트(목록 밖)를 고르면 거부한다", () => {
    expect(consent({ scope: { kind: "projects", projectIds: ["p1", "archived"] } })).toEqual({ status: "invalid", field: "scope" });
  });

  it("빈 선택은 거부한다", () => {
    expect(consent({ scope: { kind: "projects", projectIds: [] } })).toEqual({ status: "invalid", field: "scope" });
  });
});
