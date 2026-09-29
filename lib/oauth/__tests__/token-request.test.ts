import { describe, expect, it } from "vitest";

import { parseRevokeRequest, parseTokenRequest } from "../token-request";

/**
 * `/oauth/token`·`/oauth/revoke` 본문 파싱 (RFC 6749 §3.2 · §4.1.3 · §6 · RFC 7009 §2.1). 본문은 `application/x-www-form-urlencoded`만 받는다.
 * 값 없는 파라미터는 생략과 같다(RFC 6749 §3.1) · 중복은 `invalid_request`다. 키는 남이 정한 것이다 — `__proto__`가 값으로 읽히지 않는다.
 */
const FORM = "application/x-www-form-urlencoded";
const form = (params: Record<string, string>) => new URLSearchParams(params).toString();

describe("parseTokenRequest", () => {
  it("authorization_code — T1에서 두 CLI가 보낸 필드 그대로", () => {
    const body = form({ grant_type: "authorization_code", code: "c", code_verifier: "v", redirect_uri: "http://localhost:1/callback", resource: "https://mal-moi.com/api/mcp", client_id: "https://claude.ai/oauth/claude-code-client-metadata" });
    expect(parseTokenRequest(FORM, body)).toEqual({ ok: true, request: {
      grantType: "authorization_code", code: "c", codeVerifier: "v", redirectUri: "http://localhost:1/callback", resource: "https://mal-moi.com/api/mcp", clientId: "https://claude.ai/oauth/claude-code-client-metadata",
    } });
  });

  it("refresh_token — resource·client_id 생략은 undefined", () => {
    expect(parseTokenRequest(`${FORM}; charset=UTF-8`, form({ grant_type: "refresh_token", refresh_token: "mlr_x" })))
      .toEqual({ ok: true, request: { grantType: "refresh_token", refreshToken: "mlr_x", clientId: undefined, resource: undefined } });
  });

  it("값 없는 파라미터는 생략이다", () => {
    expect(parseTokenRequest(FORM, "grant_type=refresh_token&refresh_token=mlr_x&resource=&client_id="))
      .toEqual({ ok: true, request: { grantType: "refresh_token", refreshToken: "mlr_x", clientId: undefined, resource: undefined } });
  });

  it("code·refresh_token·grant_type이 없으면 invalid_request · 모르는 grant는 unsupported_grant_type", () => {
    expect(parseTokenRequest(FORM, form({ grant_type: "authorization_code" }))).toEqual({ ok: false, error: "invalid_request" });
    expect(parseTokenRequest(FORM, form({ grant_type: "refresh_token" }))).toEqual({ ok: false, error: "invalid_request" });
    expect(parseTokenRequest(FORM, form({ code: "c" }))).toEqual({ ok: false, error: "invalid_request" });
    expect(parseTokenRequest(FORM, form({ grant_type: "client_credentials" }))).toEqual({ ok: false, error: "unsupported_grant_type" });
    expect(parseTokenRequest(FORM, form({ grant_type: "__proto__" }))).toEqual({ ok: false, error: "unsupported_grant_type" });
  });

  it("중복 파라미터는 invalid_request — 어느 값을 믿을지 정할 수 없다", () => {
    expect(parseTokenRequest(FORM, "grant_type=authorization_code&code=a&code=b")).toEqual({ ok: false, error: "invalid_request" });
    expect(parseTokenRequest(FORM, "grant_type=refresh_token&refresh_token=x&client_id=a&client_id=b")).toEqual({ ok: false, error: "invalid_request" });
  });

  it("form이 아닌 본문(JSON·없음)은 invalid_request", () => {
    expect(parseTokenRequest("application/json", JSON.stringify({ grant_type: "refresh_token", refresh_token: "x" }))).toEqual({ ok: false, error: "invalid_request" });
    expect(parseTokenRequest(null, form({ grant_type: "refresh_token", refresh_token: "x" }))).toEqual({ ok: false, error: "invalid_request" });
  });
});

describe("parseRevokeRequest", () => {
  it("token + client_id (Claude Code가 보낸 모양) — token_type_hint는 읽지 않는다", () => {
    expect(parseRevokeRequest(FORM, form({ token: "mlr_x", token_type_hint: "refresh_token", client_id: "https://claude.ai/oauth/claude-code-client-metadata" })))
      .toEqual({ ok: true, token: "mlr_x", clientId: "https://claude.ai/oauth/claude-code-client-metadata" });
  });

  it("token·client_id가 없거나 중복이거나 form이 아니면 invalid_request", () => {
    for (const [type, body] of [[FORM, form({ client_id: "c" })], [FORM, form({ token: "t" })], [FORM, "token=a&token=b&client_id=c"], ["text/plain", form({ token: "t", client_id: "c" })]] as const) {
      expect(parseRevokeRequest(type, body)).toEqual({ ok: false, error: "invalid_request" });
    }
  });
});
