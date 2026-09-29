import { describe, expect, it } from "vitest";

import { planOAuthAccess } from "../access";

/**
 * OAuth access → 주체 판정 (mcp-oauth design §5 · §6). 개인 토큰의 `planApiTokenUse`처럼 **없음·만료·다른 환경이 한 갈래**다 —
 * 401 본문이 갈래를 말하지 않는다. 발급 환경 바인딩은 DB를 공유하는 로컬·preview 사이에서도 예외가 없다(spec 조건 13).
 */
const now = new Date("2026-09-29T12:00:00.000Z");
const endpoint = { issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" };
const row = (over: Record<string, unknown> = {}) => ({
  issuer: endpoint.issuer, resource: endpoint.resource,
  accessExpiresAt: new Date(now.getTime() + 60_000), expiresAt: new Date(now.getTime() + 86_400_000), ...over,
});

describe("planOAuthAccess", () => {
  it("유효한 연결 → ok", () => {
    expect(planOAuthAccess({ row: row(), now, endpoint })).toEqual({ status: "ok" });
  });

  it("행 없음(끊김·재동의·회전된 옛 access) → rejected", () => {
    expect(planOAuthAccess({ row: null, now, endpoint })).toEqual({ status: "rejected" });
  });

  it("access 만료 — 경계 포함(<=)", () => {
    expect(planOAuthAccess({ row: row({ accessExpiresAt: now }), now, endpoint })).toEqual({ status: "rejected" });
    expect(planOAuthAccess({ row: row({ accessExpiresAt: new Date(now.getTime() + 1) }), now, endpoint })).toEqual({ status: "ok" });
  });

  it("연결 수명 만료는 access가 남아 있어도 거부한다 — 경계 포함", () => {
    expect(planOAuthAccess({ row: row({ expiresAt: now }), now, endpoint })).toEqual({ status: "rejected" });
  });

  it("다른 issuer·resource의 access는 거부한다 — 같은 DB를 보는 다른 origin", () => {
    expect(planOAuthAccess({ row: row({ issuer: "https://dev.mal-moi.com" }), now, endpoint })).toEqual({ status: "rejected" });
    expect(planOAuthAccess({ row: row({ resource: "https://dev.mal-moi.com/api/mcp" }), now, endpoint })).toEqual({ status: "rejected" });
  });
});
