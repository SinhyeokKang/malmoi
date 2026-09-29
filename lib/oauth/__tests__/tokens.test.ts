import { describe, expect, it } from "vitest";

import { resolveBearerKind } from "../bearer";
import {
  ACCESS_TOKEN_TTL_MS, AUTHORIZATION_CODE_TTL_MS, AUTHORIZATION_REQUEST_TTL_MS, accessExpiry, generateAccessToken, generateAuthorizationCode,
  generateRefreshToken, generateRequestId, tokenResponse,
} from "../tokens";

/** 발급 원문과 수명 (mcp-oauth design §4 · 결정 기록). 원문은 응답에만 있고 저장은 해시다 — 여기는 모양과 수명만 정한다. */
describe("생성", () => {
  it("access는 mlo_ · refresh는 mlr_ — Bearer 판정이 access만 받는다", () => {
    const access = generateAccessToken();
    const refresh = generateRefreshToken();
    expect(access).toMatch(/^mlo_[A-Za-z0-9_-]{43}$/);
    expect(refresh).toMatch(/^mlr_[A-Za-z0-9_-]{43}$/);
    expect(resolveBearerKind(access)).toBe("oauth");
    expect(resolveBearerKind(refresh)).toBeNull();
  });

  it("code·요청 id는 32바이트 난수 base64url이고 매번 다르다", () => {
    const values = [generateAuthorizationCode(), generateAuthorizationCode(), generateRequestId(), generateRequestId()];
    for (const v of values) expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(values).size).toBe(4);
  });
});

describe("수명", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");
  it("access 1시간 · code 60초 · 요청 10분", () => {
    expect([ACCESS_TOKEN_TTL_MS, AUTHORIZATION_CODE_TTL_MS, AUTHORIZATION_REQUEST_TTL_MS]).toEqual([3_600_000, 60_000, 600_000]);
  });

  it("access는 연결 수명을 넘지 않는다", () => {
    expect(accessExpiry(now, new Date(now.getTime() + 86_400_000))).toEqual(new Date(now.getTime() + 3_600_000));
    const soon = new Date(now.getTime() + 90_000);
    expect(accessExpiry(now, soon)).toEqual(soon);
  });

  it("응답은 RFC 6749 §5.1 형 — expires_in은 남은 초(내림)", () => {
    const body = tokenResponse({ accessToken: "mlo_a", refreshToken: "mlr_r", accessExpiresAt: new Date(now.getTime() + 89_999) }, now);
    expect(body).toEqual({ access_token: "mlo_a", token_type: "Bearer", expires_in: 89, refresh_token: "mlr_r" });
  });
});
