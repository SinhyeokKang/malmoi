import { describe, expect, it } from "vitest";

import { isExpired } from "../expiry";

/**
 * **만료 경계 하나** (ux-drift-unify 6-⚪14) — 초대·MCP 토큰의 사본 여섯이 `<=`·`>=` 두 모양으로 같은 뜻을 적고 있었다.
 * 정각은 이미 만료다 — 유효 구간을 만료 이전까지로 닫는다(인증 경계와 카드가 같은 순간에 같은 답을 낸다).
 */
describe("isExpired", () => {
  const at = new Date("2026-10-01T00:00:00.000Z");
  it("정각은 만료다", () => expect(isExpired(at, new Date(at.getTime()))).toBe(true));
  it("1ms 전은 유효하다", () => expect(isExpired(at, new Date(at.getTime() - 1))).toBe(false));
  it("1ms 뒤는 만료다", () => expect(isExpired(at, new Date(at.getTime() + 1))).toBe(true));
});
