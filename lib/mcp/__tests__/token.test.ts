import { describe, expect, it } from "vitest";

import { hashInviteToken } from "@/lib/auth/invitation";

import { API_TOKEN_PREFIX, generateApiToken, hashApiToken, parseBearer, planApiTokenUse, shouldTouch } from "../token";

/**
 * MCP 개인 토큰 (mcp-connector design §1.2). 원문은 저장하지 않고 sha256 hex로 **행을 조회**한다 — push 토큰·초대와 같은 해시
 * 규칙 한 벌이다. 판정은 `ok | rejected` 두 갈래뿐이라 401 하나로 접힌다(spec 조건 4).
 */

describe("generateApiToken", () => {
  it("mlm_ 접두 + 32바이트 base64url(43자)이다", () => {
    const token = generateApiToken();
    expect(API_TOKEN_PREFIX).toBe("mlm_");
    expect(token).toMatch(/^mlm_[A-Za-z0-9_-]{43}$/);
  });

  it("호출마다 다르다", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateApiToken()));
    expect(seen.size).toBe(50);
  });
});

describe("hashApiToken", () => {
  it("초대·push 토큰과 같은 sha256 hex 규칙이다 — 해시 규칙이 한 곳에 모인다", () => {
    const raw = "mlm_abc";
    expect(hashApiToken(raw)).toBe(hashInviteToken(raw));
    expect(hashApiToken("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("원문을 담지 않는다", () => {
    const raw = generateApiToken();
    expect(hashApiToken(raw)).not.toContain(raw.slice(4));
  });
});

describe("parseBearer", () => {
  it("Bearer <token>에서 토큰을 꺼낸다", () => {
    expect(parseBearer("Bearer mlm_x")).toBe("mlm_x");
  });

  it("scheme은 대소문자를 가리지 않는다 (RFC 7235)", () => {
    expect(parseBearer("bearer mlm_x")).toBe("mlm_x");
    expect(parseBearer("BEARER mlm_x")).toBe("mlm_x");
  });

  it("앞뒤 공백을 견딘다", () => {
    expect(parseBearer("  Bearer   mlm_x  ")).toBe("mlm_x");
  });

  it("헤더 없음·빈 값·scheme만 있음은 null", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
    expect(parseBearer("Bearer    ")).toBeNull();
  });

  it("다른 scheme은 null — Basic을 토큰으로 조회하지 않는다", () => {
    expect(parseBearer("Basic mlm_x")).toBeNull();
    expect(parseBearer("Bearermlm_x")).toBeNull();
  });

  it("토큰 안에 공백이 있으면 null — 두 값을 하나로 붙여 조회하지 않는다", () => {
    expect(parseBearer("Bearer mlm_x extra")).toBeNull();
  });
});

describe("planApiTokenUse", () => {
  const now = new Date("2026-09-28T00:00:00.000Z");

  it("행이 있고 만료 전이면 ok", () => {
    expect(planApiTokenUse({ row: { expiresAt: new Date(now.getTime() + 1) }, now })).toEqual({ status: "ok" });
  });

  it("행 없음(없음·폐기·재발급으로 교체)은 rejected", () => {
    expect(planApiTokenUse({ row: null, now })).toEqual({ status: "rejected" });
  });

  it("expiresAt == now 는 거부다 — 경계는 `<=`", () => {
    expect(planApiTokenUse({ row: { expiresAt: new Date(now) }, now })).toEqual({ status: "rejected" });
  });

  it("만료 뒤는 rejected — 없음과 같은 갈래라 401 본문이 갈래를 말하지 않는다", () => {
    const expired = planApiTokenUse({ row: { expiresAt: new Date(now.getTime() - 1) }, now });
    expect(expired).toEqual(planApiTokenUse({ row: null, now }));
  });
});

describe("shouldTouch", () => {
  const now = new Date("2026-09-28T00:01:00.000Z");

  it("한 번도 안 썼으면 쓴다", () => {
    expect(shouldTouch(null, now)).toBe(true);
  });

  it("1분 안이면 쓰지 않는다 — 에이전트 루프가 행을 두드리지 않게", () => {
    expect(shouldTouch(new Date(now.getTime() - 59_999), now)).toBe(false);
  });

  it("정확히 1분이면 쓴다", () => {
    expect(shouldTouch(new Date(now.getTime() - 60_000), now)).toBe(true);
  });

  it("미래 시각(시계 차)이면 쓰지 않는다", () => {
    expect(shouldTouch(new Date(now.getTime() + 5_000), now)).toBe(false);
  });
});
