import { expect, it } from "vitest";
import { causeMessage } from "../cause";

/**
 * **잡은 값의 메시지** (audit #73). `(cause as Error).message`가 여덟 곳에 있었고, `Error`가 아닌 값을 던지는 라이브러리에서
 * `undefined`가 되어 어댑터 오류 `detail`·측정 `failure`가 `"undefined"`로 남았다.
 */
it("Error면 message를 준다", () => {
  expect(causeMessage(new SyntaxError("Unexpected token"))).toBe("Unexpected token");
});

it("message 문자열을 든 객체도 그 값을 준다 — 다른 realm의 Error는 instanceof가 거짓이다", () => {
  expect(causeMessage({ message: "from another realm" })).toBe("from another realm");
});

it("그 밖의 값은 문자열로 바꾼다 — undefined가 되지 않는다", () => {
  expect(causeMessage("thrown string")).toBe("thrown string");
  expect(causeMessage(42)).toBe("42");
  expect(causeMessage(undefined)).toBe("undefined");
  expect(causeMessage({ message: 1 })).toBe("[object Object]");
});
