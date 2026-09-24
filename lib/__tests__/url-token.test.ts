import { describe, expect, it } from "vitest";

import { decodeUrlToken, encodeUrlToken } from "../url-token";

/**
 * 주소창에 싣는 불투명 토큰(키셋 커서) — Logs(`lib/events/filter.ts`)와 번역 목록(`lib/keys/translation-list.ts`)이
 * 같은 코덱을 쓴다 (audit #73 — 전엔 세 벌이었다).
 *
 * ⚠️ **주소창 값이다** — 무엇을 받아도 던지지 않고 `null`이다. 화면은 그때 첫 페이지를 그린다.
 */
describe("url-token", () => {
  it("왕복한다 — latin1 밖 문자도 (btoa는 latin1만 받는다)", () => {
    for (const value of ["2026-09-10T12:00:00.000Z|evt_1", "안녕|a", "🙂", "[0,\"web\",3,\"a.b\",\"id\"]", "a|b|c"]) {
      expect(decodeUrlToken(encodeUrlToken(value)), value).toBe(value);
    }
  });

  it("URL에 그대로 실린다 — `+`·`/`·`=`가 없다", () => {
    for (const value of ["??>>", "안녕하세요", "x".repeat(31)]) {
      expect(encodeUrlToken(value), value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("무엇을 받아도 던지지 않고 null이다", () => {
    // `JQ`는 base64로는 풀리지만 퍼센트 디코딩이 실패하는 값(`%`)이다.
    for (const bad of ["", "!!!", "a b", "a+b", "a/b", "a=", "JQ", "__proto__?", "a".repeat(5001)]) {
      expect(() => decodeUrlToken(bad), bad).not.toThrow();
      expect(decodeUrlToken(bad), bad).toBe(null);
    }
  });

  it("빈 값을 인코딩한 토큰도 null이다 — 빈 커서는 커서가 아니다", () => {
    expect(decodeUrlToken(encodeUrlToken(""))).toBe(null);
  });
});
