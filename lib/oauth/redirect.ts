/**
 * `redirect_uri` 대조 (mcp-oauth design §2). **완전 일치**가 기본이고, 예외는 loopback의 **포트만**이다
 * ([RFC 8252 §7.3](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)) — CLI는 빈 포트를 그때그때 잡고, CIMD 문서의 등록값엔 포트가 없다.
 *
 * ⚠️ loopback 호스트는 `127.0.0.1`·`[::1]`·**문자 그대로의 `localhost`**다(design §2 "T1 판정" — Claude Code는 `localhost`만, Codex는
 * `127.0.0.1`만 썼다). 등록과 요청의 호스트가 **같은 문자열**일 때만 예외다 — `localhost` ↔ `127.0.0.1` 교차 일치는 없다.
 * ⚠️ 허용 목록을 하드코딩하지 않는다 — `registered`는 클라이언트 메타데이터가 선언한 값뿐이다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

/**
 * 포트를 뺀 **원문**으로 대조한다 — `URL`로 정규화하면 `127.1`·`2130706433`·`/a/../callback`·끝의 빈 `?`가 등록 값과 같아진다.
 * 호스트가 `http://` 바로 뒤에 와야 하므로 userinfo·대문자 scheme·`localhost.evil.example`은 이 모양에 안 맞아 예외가 아니다.
 */
// 등록값에 포트가 있어도 양쪽 다 무시한다(RFC 8252 §7.3 — 포트는 요청 시점에 정해진다).
const LOOPBACK = /^(http:\/\/(?:127\.0\.0\.1|\[::1\]|localhost))(?::\d{1,5})?(?=[/?]|$)/;

function withoutLoopbackPort(value: string): string | null {
  return LOOPBACK.test(value) ? value.replace(LOOPBACK, "$1") : null;
}

/**
 * 콜백으로 쓸 수 있는 URI — `https:` 또는 loopback `http:`뿐이다. `javascript:`·`data:`는 동의 뒤 **우리 origin에서** 실행되고,
 * 원격 `http:`는 code를 평문으로 내보내며, 사설 scheme은 받는 앱을 가릴 수 없다. CIMD 문서 검증·authorize 파싱·대조가 전부 이것을 지난다.
 */
export function isAllowedRedirectUri(value: string): boolean {
  if (!URL.canParse(value) || value.includes("#")) return false;
  const url = new URL(value);
  if (url.username !== "" || url.password !== "") return false;
  return url.protocol === "https:" || LOOPBACK.test(value);
}

export function planRedirectUri(registered: readonly string[], requested: string): boolean {
  // fragment는 등록과 같아도 받지 않는다(RFC 6749 §3.1.2) — code가 브라우저 쪽에 남는다.
  if (!isAllowedRedirectUri(requested)) return false;
  const loopback = withoutLoopbackPort(requested);
  return registered.some(candidate => candidate === requested || (loopback !== null && withoutLoopbackPort(candidate) === loopback));
}
