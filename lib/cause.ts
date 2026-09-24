/**
 * 잡은 값의 메시지. **`(cause as Error).message`를 대신한다** (audit #73) — 그 캐스트는 `Error`가 아닌 값(문자열·객체)을
 * 던지는 라이브러리에서 `undefined`를 내고, 어댑터 오류 `detail`·측정 `failure`가 `"undefined"`로 남았다.
 *
 * `instanceof Error`로 가르지 않는다 — 다른 realm(vm·워커)의 Error는 거짓이 된다. `message` 문자열을 든 객체면 그 값이다.
 * 순수 함수다 — 어댑터·스크립트·서버가 함께 쓴다.
 */
export function causeMessage(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string") return cause.message;
  return String(cause);
}
