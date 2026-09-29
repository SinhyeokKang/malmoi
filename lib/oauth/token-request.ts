/**
 * `/oauth/token`·`/oauth/revoke` 본문 파싱 (RFC 6749 §3.2 · §4.1.3 · §6 · RFC 7009 §2.1). 값 판정은 코어(`planCodeExchange`·`planRefresh`·`planRevoke`)가
 * 하고 여기는 **모양**만 본다: form 본문 · 필수 파라미터 · 중복 없음. 값 없는 파라미터는 생략과 같다(RFC 6749 §3.1).
 *
 * ⚠️ `URLSearchParams`는 키를 객체 속성으로 두지 않는다 — `__proto__` 같은 남의 키가 값으로 읽히지 않는다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

export type TokenRequest =
  | { grantType: "authorization_code"; code: string; codeVerifier: string | undefined; clientId: string | undefined; redirectUri: string | undefined; resource: string | undefined }
  | { grantType: "refresh_token"; refreshToken: string; clientId: string | undefined; resource: string | undefined };

export type TokenRequestParse = { ok: true; request: TokenRequest } | { ok: false; error: "invalid_request" | "unsupported_grant_type" };

type Form = { get(key: string): string | undefined } | null;

/** 중복이면 `null` — 어느 값을 믿을지 정할 수 없다(RFC 6749 §3.1 "MUST NOT be included more than once"). */
function readForm(contentType: string | null, body: string): Form {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return null;
  const params = new URLSearchParams(body);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return null;
  return { get: key => { const value = params.get(key); return value === null || value === "" ? undefined : value; } };
}

export function parseTokenRequest(contentType: string | null, body: string): TokenRequestParse {
  const invalid = { ok: false, error: "invalid_request" } as const;
  const form = readForm(contentType, body);
  if (form === null) return invalid;
  const grantType = form.get("grant_type");
  if (grantType === undefined) return invalid;
  const clientId = form.get("client_id");
  const resource = form.get("resource");
  if (grantType === "authorization_code") {
    const code = form.get("code");
    if (code === undefined) return invalid;
    return { ok: true, request: { grantType, code, codeVerifier: form.get("code_verifier"), clientId, redirectUri: form.get("redirect_uri"), resource } };
  }
  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (refreshToken === undefined) return invalid;
    return { ok: true, request: { grantType, refreshToken, clientId, resource } };
  }
  return { ok: false, error: "unsupported_grant_type" };
}

/** `token_type_hint`는 읽지 않는다 — 접두가 종류를 정한다(`revokeLookup`). `client_id`가 없으면 묶을 연결을 정할 수 없다. */
export function parseRevokeRequest(contentType: string | null, body: string): { ok: true; token: string; clientId: string } | { ok: false; error: "invalid_request" } {
  const form = readForm(contentType, body);
  const token = form?.get("token");
  const clientId = form?.get("client_id");
  if (token === undefined || clientId === undefined) return { ok: false, error: "invalid_request" };
  return { ok: true, token, clientId };
}
