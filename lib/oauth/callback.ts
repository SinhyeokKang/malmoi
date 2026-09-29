/**
 * 동의 뒤 콜백 URL (RFC 6749 §4.1.2 · §4.1.2.1). `redirectUri`는 **이미 등록 대조를 지난 값**이어야 한다 — 이 함수는 붙이기만 한다.
 * 기존 query는 보존한다(등록된 URI가 query를 가질 수 있다). `state`가 없던 요청엔 싣지 않는다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 조립이다.
 */
export function callbackRedirect(redirectUri: string, params: { code: string; state: string | null } | { error: "access_denied"; state: string | null }): string {
  const url = new URL(redirectUri);
  if ("code" in params) url.searchParams.append("code", params.code);
  else url.searchParams.append("error", params.error);
  if (params.state !== null) url.searchParams.append("state", params.state);
  return url.href;
}
