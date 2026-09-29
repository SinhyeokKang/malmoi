import { describe, expect, it } from "vitest";

import { callbackRedirect } from "../callback";

/**
 * 동의 뒤 콜백 URL (RFC 6749 §4.1.2 · §4.1.2.1). `redirect_uri`는 이미 등록 대조를 지난 값이고 query를 가질 수 있다 — 기존 query를 보존하고 붙인다.
 * `state`가 없던 요청엔 싣지 않는다.
 */
describe("callbackRedirect", () => {
  it("code + state", () => {
    expect(callbackRedirect("http://localhost:5555/callback", { code: "abc", state: "s1" })).toBe("http://localhost:5555/callback?code=abc&state=s1");
  });

  it("state 없음 → 싣지 않는다 · 기존 query 보존 · 값은 인코딩", () => {
    expect(callbackRedirect("https://claude.ai/cb?x=1", { code: "a b", state: null })).toBe("https://claude.ai/cb?x=1&code=a+b");
  });

  it("거부는 error=access_denied + 원래 state", () => {
    expect(callbackRedirect("http://127.0.0.1:1/callback/x", { error: "access_denied", state: "s&1" })).toBe("http://127.0.0.1:1/callback/x?error=access_denied&state=s%261");
  });
});
