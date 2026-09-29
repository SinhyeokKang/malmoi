import { describe, expect, it } from "vitest";

import { planRedirectUri } from "../redirect";

/**
 * `redirect_uri`는 **완전 일치**이고, 표준 예외는 loopback IP literal의 **포트만**이다(RFC 8252 §7.3 · design §2).
 * `localhost`는 그 예외에 들지 않는다 — 등록 URI와 완전 일치만 받는다(T1 실측 전 기본값).
 */
describe("planRedirectUri", () => {
  it("등록 URI와 문자열이 같으면 통과한다", () => {
    expect(planRedirectUri(["https://claude.ai/api/mcp/auth_callback"], "https://claude.ai/api/mcp/auth_callback")).toBe(true);
  });

  it("HTTPS는 path·query·끝 슬래시·대소문자 차이를 전부 거부한다", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback"];
    for (const requested of [
      "https://claude.ai/api/mcp/auth_callback/",
      "https://claude.ai/api/mcp/auth_callback?x=1",
      "https://Claude.ai/api/mcp/auth_callback",
      "https://claude.ai:443/api/mcp/auth_callback",
      "https://claude.ai:8443/api/mcp/auth_callback",
      "https://evil.claude.ai/api/mcp/auth_callback",
      "http://claude.ai/api/mcp/auth_callback",
    ]) expect(planRedirectUri(registered, requested)).toBe(false);
  });

  it("등록 목록이 비면 아무것도 통과하지 않는다", () => {
    expect(planRedirectUri([], "http://127.0.0.1:5000/callback")).toBe(false);
  });

  it("fragment가 있으면 등록과 같아도 거부한다", () => {
    expect(planRedirectUri(["https://a.example/cb#x"], "https://a.example/cb#x")).toBe(false);
  });

  describe("loopback IP literal — 포트만 자유", () => {
    it("IPv4 127.0.0.1: 등록 포트와 달라도·포트 없는 등록에도 통과한다", () => {
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://127.0.0.1:53682/callback")).toBe(true);
      expect(planRedirectUri(["http://127.0.0.1:3118/callback"], "http://127.0.0.1:61234/callback")).toBe(true);
      expect(planRedirectUri(["http://127.0.0.1:3118/callback"], "http://127.0.0.1/callback")).toBe(true);
    });

    it("IPv6 [::1]도 같은 예외다", () => {
      expect(planRedirectUri(["http://[::1]/callback"], "http://[::1]:53682/callback")).toBe(true);
    });

    it("IPv4와 IPv6는 서로 대체하지 않는다", () => {
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://[::1]:53682/callback")).toBe(false);
      expect(planRedirectUri(["http://[::1]/callback"], "http://127.0.0.1:53682/callback")).toBe(false);
    });

    it("scheme·path·query는 그대로 대조한다", () => {
      const registered = ["http://127.0.0.1/callback"];
      for (const requested of [
        "https://127.0.0.1:53682/callback",
        "http://127.0.0.1:53682/callback/",
        "http://127.0.0.1:53682/other",
        "http://127.0.0.1:53682/callback?x=1",
        "http://127.0.0.1:53682/callback#x",
      ]) expect(planRedirectUri(registered, requested)).toBe(false);
    });

    it("다른 loopback 주소(127.0.0.2)나 userinfo는 예외가 아니다", () => {
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://127.0.0.2:53682/callback")).toBe(false);
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://user@127.0.0.1:53682/callback")).toBe(false);
    });
  });

  describe("localhost — 표준 예외가 아니다", () => {
    it("등록과 완전 일치만 통과한다", () => {
      expect(planRedirectUri(["http://localhost:3118/callback"], "http://localhost:3118/callback")).toBe(true);
    });

    it("포트가 다르면 거부한다", () => {
      expect(planRedirectUri(["http://localhost/callback"], "http://localhost:53682/callback")).toBe(false);
      expect(planRedirectUri(["http://localhost:3118/callback"], "http://localhost:53682/callback")).toBe(false);
    });

    it("127.0.0.1 등록이 localhost 요청을 열지 않는다", () => {
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://localhost:53682/callback")).toBe(false);
    });
  });

  it("URL로 못 읽는 요청은 거부한다", () => {
    expect(planRedirectUri(["http://127.0.0.1/callback"], "not a url")).toBe(false);
    expect(planRedirectUri(["not a url"], "not a url")).toBe(false);
  });
});
