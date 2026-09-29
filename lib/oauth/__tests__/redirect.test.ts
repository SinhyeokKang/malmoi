import { describe, expect, it } from "vitest";

import { planRedirectUri } from "../redirect";

/**
 * `redirect_uri`는 **완전 일치**이고, 예외는 loopback(`127.0.0.1`·`[::1]`·문자 그대로 `localhost`)의 **포트만**이다
 * (RFC 8252 §7.3 · design §2 "T1 판정" — Claude Code는 `localhost`만, Codex는 `127.0.0.1`만 쓴다). 호스트 교차 일치는 없다.
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

    it("IPv6도 path·query·scheme을 그대로 대조한다", () => {
      const registered = ["http://[::1]/callback"];
      for (const requested of ["http://[::1]:53682/other", "http://[::1]:53682/callback?x=1", "https://[::1]:53682/callback"]) {
        expect(planRedirectUri(registered, requested)).toBe(false);
      }
    });

    it("WHATWG 정규화로만 같아지는 요청은 예외가 아니다 — 포트를 뺀 원문이 등록 원문과 같아야 한다", () => {
      const registered = ["http://127.0.0.1/callback"];
      for (const requested of [
        "http://127.1:5/callback",
        "http://2130706433:5/callback",
        "http://127.0.0.1:5/a/../callback",
        "http://127.0.0.1:5/callback?",
        "HTTP://127.0.0.1:5/callback",
        "http://127.0.0.1:05/callback/.",
      ]) expect(planRedirectUri(registered, requested)).toBe(false);
    });

    it("다른 loopback 주소(127.0.0.2)나 userinfo는 예외가 아니다", () => {
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://127.0.0.2:53682/callback")).toBe(false);
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://user@127.0.0.1:53682/callback")).toBe(false);
    });
  });

  describe("localhost — 문자 그대로의 localhost끼리만 포트 예외", () => {
    it("Claude Code 모양: 포트 없는 등록 + 임의 포트 요청이 통과한다", () => {
      const registered = ["http://localhost/callback", "http://127.0.0.1/callback"];
      expect(planRedirectUri(registered, "http://localhost:53682/callback")).toBe(true);
      expect(planRedirectUri(["http://localhost:3118/callback"], "http://localhost:53682/callback")).toBe(true);
    });

    it("Codex 모양: 127.0.0.1 + 경로 id가 통과하고, 다른 id는 거부한다", () => {
      const registered = ["http://127.0.0.1/callback/abc123", "http://localhost/callback/abc123"];
      expect(planRedirectUri(registered, "http://127.0.0.1:61234/callback/abc123")).toBe(true);
      expect(planRedirectUri(registered, "http://127.0.0.1:61234/callback/other")).toBe(false);
    });

    it("localhost ↔ 127.0.0.1 ↔ [::1] 교차 일치는 없다", () => {
      expect(planRedirectUri(["http://127.0.0.1/callback"], "http://localhost:53682/callback")).toBe(false);
      expect(planRedirectUri(["http://localhost/callback"], "http://127.0.0.1:53682/callback")).toBe(false);
      expect(planRedirectUri(["http://localhost/callback"], "http://[::1]:53682/callback")).toBe(false);
    });

    it("https localhost·대문자·부분 일치 호스트는 예외가 아니다", () => {
      const registered = ["http://localhost/callback"];
      for (const requested of [
        "https://localhost:53682/callback",
        "http://LOCALHOST:53682/callback",
        "http://localhost.evil.example:53682/callback",
        "http://localhost:53682/callback?x=1",
        "http://localhost:53682/callback/",
      ]) expect(planRedirectUri(registered, requested)).toBe(false);
    });

    it("https 등록은 localhost라도 완전 일치만 받는다", () => {
      expect(planRedirectUri(["https://localhost/callback"], "https://localhost:53682/callback")).toBe(false);
      expect(planRedirectUri(["https://localhost:53682/callback"], "https://localhost:53682/callback")).toBe(true);
    });
  });

  it("URL로 못 읽는 요청은 거부한다", () => {
    expect(planRedirectUri(["http://127.0.0.1/callback"], "not a url")).toBe(false);
    expect(planRedirectUri(["not a url"], "not a url")).toBe(false);
  });
});
