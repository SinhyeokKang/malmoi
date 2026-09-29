/**
 * `redirect_uri` 대조 (mcp-oauth design §2). **완전 일치**가 기본이고, 예외는 loopback IP literal의 **포트만**이다
 * ([RFC 8252 §7.3](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)) — CLI는 빈 포트를 그때그때 잡는다.
 *
 * ⚠️ `localhost`는 예외가 아니다 — 이름 해석이 loopback을 보장하지 않는다(RFC 8252 §8.3). 등록 문자열과 완전 일치만 받는다.
 * ⚠️ 허용 목록을 하드코딩하지 않는다 — `registered`는 클라이언트 메타데이터가 선언한 값뿐이다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

/**
 * 포트를 뺀 **원문**으로 대조한다 — `URL`로 정규화하면 `127.1`·`2130706433`·`/a/../callback`·끝의 빈 `?`가 등록 값과 같아진다.
 * 호스트가 `http://` 바로 뒤에 와야 하므로 userinfo·대문자 scheme은 이 모양에 안 맞아 예외가 아니다.
 */
const LOOPBACK = /^(http:\/\/(?:127\.0\.0\.1|\[::1\]))(?::\d{1,5})?(?=[/?]|$)/;

function withoutLoopbackPort(value: string): string | null {
  return LOOPBACK.test(value) ? value.replace(LOOPBACK, "$1") : null;
}

export function planRedirectUri(registered: readonly string[], requested: string): boolean {
  // fragment는 등록과 같아도 받지 않는다(RFC 6749 §3.1.2) — code가 브라우저 쪽에 남는다.
  if (!URL.canParse(requested) || requested.includes("#")) return false;
  const loopback = withoutLoopbackPort(requested);
  return registered.some(candidate => candidate === requested || (loopback !== null && withoutLoopbackPort(candidate) === loopback));
}
