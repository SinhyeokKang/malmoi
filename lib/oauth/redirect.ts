/**
 * `redirect_uri` 대조 (mcp-oauth design §2). **완전 일치**가 기본이고, 예외는 loopback IP literal의 **포트만**이다
 * ([RFC 8252 §7.3](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)) — CLI는 빈 포트를 그때그때 잡는다.
 *
 * ⚠️ `localhost`는 예외가 아니다 — 이름 해석이 loopback을 보장하지 않는다(RFC 8252 §8.3). 등록 문자열과 완전 일치만 받는다.
 * ⚠️ 허용 목록을 하드코딩하지 않는다 — `registered`는 클라이언트 메타데이터가 선언한 값뿐이다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "[::1]"];

function parse(value: string): URL | null {
  return URL.canParse(value) ? new URL(value) : null;
}

export function planRedirectUri(registered: readonly string[], requested: string): boolean {
  const url = parse(requested);
  // fragment는 등록과 같아도 받지 않는다(RFC 6749 §3.1.2) — code가 브라우저 쪽에 남는다.
  if (url === null || url.hash !== "" || requested.includes("#")) return false;
  return registered.some(candidate => candidate === requested || loopbackMatch(candidate, url));
}

/** scheme·host·path·query는 그대로, 포트만 무시한다. userinfo가 끼면 예외가 아니다. */
function loopbackMatch(candidate: string, requested: URL): boolean {
  const registered = parse(candidate);
  if (registered === null || registered.protocol !== "http:" || requested.protocol !== "http:") return false;
  if (!LOOPBACK_HOSTS.includes(registered.hostname) || registered.hostname !== requested.hostname) return false;
  if (registered.username !== "" || registered.password !== "" || requested.username !== "" || requested.password !== "") return false;
  return registered.pathname === requested.pathname && registered.search === requested.search && registered.hash === "";
}
