/**
 * `push-local --url` 판정 — 그 요청은 `PUSH_TOKEN`(프로젝트 토큰 원문)을 Bearer로 싣는다.
 *
 * 평문 http는 로컬 개발 서버(루프백)에서만 받는다. 호스트는 `URL`이 정규화한 값으로 **정확히** 대조한다 —
 * 접두 비교면 `localhost.example.com`이 통과한다.
 *
 * 순수 함수다.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedPushUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}
