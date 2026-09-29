import { describe, expect, it } from "vitest";

import { planCodeExchange, planRefresh, type CodeRow, type ConnectionRow } from "../exchange";

const ISSUER = "https://mal-moi.com";
const RESOURCE = "https://mal-moi.com/api/mcp";
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const REDIRECT = "http://127.0.0.1:53682/callback";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const NOW = new Date("2026-09-29T00:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

describe("planCodeExchange", () => {
  const code = (over: Partial<CodeRow> = {}): CodeRow => ({
    clientId: CLIENT, redirectUri: REDIRECT, codeChallenge: CHALLENGE, issuer: ISSUER, resource: RESOURCE,
    expiresAt: at(60_000), usedAt: null, ...over,
  });
  const exchange = (over: Partial<Parameters<typeof planCodeExchange>[0]> = {}) => planCodeExchange({
    codeRow: code(), now: NOW, clientId: CLIENT, redirectUri: REDIRECT, resource: RESOURCE, verifier: VERIFIER,
    expectedIssuer: ISSUER, expectedResource: RESOURCE, ...over,
  });

  it("발급 스냅샷과 전부 맞으면 ok", () => {
    expect(exchange()).toEqual({ status: "ok" });
  });

  it("요청 TTL과 무관하다 — code 스냅샷만 본다(요청 행이 만료·삭제돼도 code 만료 전이면 ok)", () => {
    // 입력에 요청 행이 아예 없다 — code의 expiresAt만이 시계다.
    expect(exchange({ now: at(59_999) })).toEqual({ status: "ok" });
  });

  it("없는 code는 invalid_grant", () => {
    expect(exchange({ codeRow: null })).toEqual({ status: "invalid_grant" });
  });

  it("만료 경계는 `<=` — expiresAt === now면 invalid_grant", () => {
    expect(exchange({ now: at(60_000) })).toEqual({ status: "invalid_grant" });
    expect(exchange({ now: at(60_001) })).toEqual({ status: "invalid_grant" });
  });

  it("이미 사용된 code는 invalid_grant", () => {
    expect(exchange({ codeRow: code({ usedAt: at(-1) }) })).toEqual({ status: "invalid_grant" });
  });

  it("틀린 verifier·없는 verifier는 invalid_grant", () => {
    expect(exchange({ verifier: `${VERIFIER.slice(0, -1)}l` })).toEqual({ status: "invalid_grant" });
    expect(exchange({ verifier: undefined })).toEqual({ status: "invalid_grant" });
  });

  it("다른 client_id·없는 client_id는 invalid_grant", () => {
    expect(exchange({ clientId: "https://evil.example/meta" })).toEqual({ status: "invalid_grant" });
    expect(exchange({ clientId: undefined })).toEqual({ status: "invalid_grant" });
  });

  it("다른 redirect_uri는 invalid_grant — loopback 포트도 authorize 때 그 문자열과 같아야 한다", () => {
    expect(exchange({ redirectUri: "http://127.0.0.1:53683/callback" })).toEqual({ status: "invalid_grant" });
  });

  it("redirect_uri 생략은 받는다 — PKCE가 바인딩한다(OAuth 2.1)", () => {
    expect(exchange({ redirectUri: undefined })).toEqual({ status: "ok" });
  });

  it("다른 resource는 invalid_grant, 생략은 스냅샷 값을 쓴다", () => {
    expect(exchange({ resource: "https://dev.mal-moi.com/api/mcp" })).toEqual({ status: "invalid_grant" });
    expect(exchange({ resource: undefined })).toEqual({ status: "ok" });
  });

  it("다른 발급 환경(issuer·resource)의 code는 invalid_grant — DB를 공유하는 origin 사이에도", () => {
    expect(exchange({ expectedIssuer: "https://dev.mal-moi.com" })).toEqual({ status: "invalid_grant" });
    expect(exchange({ expectedResource: "https://dev.mal-moi.com/api/mcp", resource: undefined })).toEqual({ status: "invalid_grant" });
  });
});

describe("planRefresh", () => {
  const connection = (over: Partial<ConnectionRow> = {}): ConnectionRow => ({
    id: "c1", clientId: CLIENT, issuer: ISSUER, resource: RESOURCE, refreshTokenHash: "current", expiresAt: at(86_400_000), ...over,
  });
  const refresh = (over: Partial<Parameters<typeof planRefresh>[0]> = {}) => planRefresh({
    connectionRow: connection(), presentedHash: "current", usedTokenRow: null, now: NOW,
    clientId: CLIENT, resource: undefined, expectedIssuer: ISSUER, expectedResource: RESOURCE, ...over,
  });

  it("현재 해시면 그 연결을 회전한다", () => {
    expect(refresh()).toEqual({ status: "rotate", connectionId: "c1" });
  });

  it("사용 이력의 해시면 그 연결을 폐기한다 — 외부 응답은 호출자가 커밋 뒤 invalid_grant로 낸다", () => {
    expect(refresh({ presentedHash: "old", usedTokenRow: { tokenHash: "old", connectionId: "c1" } }))
      .toEqual({ status: "revoke-replayed-connection", connectionId: "c1" });
  });

  it("여러 번 회전한 옛 해시도 같은 판정이다 — 이력이 그 연결을 가리키면 폐기", () => {
    expect(refresh({ presentedHash: "oldest", usedTokenRow: { tokenHash: "oldest", connectionId: "c1" }, connectionRow: connection({ refreshTokenHash: "newest" }) }))
      .toEqual({ status: "revoke-replayed-connection", connectionId: "c1" });
  });

  it("알 수 없는 해시만으로는 폐기하지 않는다 — 발급 없이 invalid_grant", () => {
    expect(refresh({ presentedHash: "unknown" })).toEqual({ status: "invalid_grant" });
  });

  it("다른 연결을 가리키는 이력은 이 연결을 폐기하지 않는다(재동의로 새 행이 된 뒤의 옛 해시)", () => {
    expect(refresh({ presentedHash: "old", usedTokenRow: { tokenHash: "old", connectionId: "c0" } })).toEqual({ status: "invalid_grant" });
  });

  it("해시가 맞지 않는 이력 행은 무시한다", () => {
    expect(refresh({ presentedHash: "old", usedTokenRow: { tokenHash: "other", connectionId: "c1" } })).toEqual({ status: "invalid_grant" });
  });

  it("없는 연결은 invalid_grant", () => {
    expect(refresh({ connectionRow: null })).toEqual({ status: "invalid_grant" });
    expect(refresh({ connectionRow: null, presentedHash: "old", usedTokenRow: { tokenHash: "old", connectionId: "c1" } })).toEqual({ status: "invalid_grant" });
  });

  it("연결 만료 경계는 `<=` — refresh가 연결 수명을 넘지 못한다", () => {
    expect(refresh({ connectionRow: connection({ expiresAt: NOW }) })).toEqual({ status: "invalid_grant" });
    expect(refresh({ connectionRow: connection({ expiresAt: at(1) }) })).toEqual({ status: "rotate", connectionId: "c1" });
  });

  describe("바인딩은 회전·폐기보다 먼저다", () => {
    it("다른 client_id의 refresh는 회전도 폐기도 없이 invalid_grant", () => {
      expect(refresh({ clientId: "https://evil.example/meta" })).toEqual({ status: "invalid_grant" });
      expect(refresh({ clientId: undefined })).toEqual({ status: "invalid_grant" });
      expect(refresh({ clientId: "https://evil.example/meta", presentedHash: "old", usedTokenRow: { tokenHash: "old", connectionId: "c1" } }))
        .toEqual({ status: "invalid_grant" });
    });

    it("다른 발급 환경(issuer·resource)은 회전·폐기 없이 invalid_grant", () => {
      expect(refresh({ expectedIssuer: "https://dev.mal-moi.com" })).toEqual({ status: "invalid_grant" });
      expect(refresh({ expectedResource: "https://dev.mal-moi.com/api/mcp" })).toEqual({ status: "invalid_grant" });
      expect(refresh({ expectedIssuer: "https://dev.mal-moi.com", presentedHash: "old", usedTokenRow: { tokenHash: "old", connectionId: "c1" } }))
        .toEqual({ status: "invalid_grant" });
    });

    it("resource 생략은 기존 값을 유지하고, 같은 값 명시는 받는다", () => {
      expect(refresh({ resource: undefined })).toEqual({ status: "rotate", connectionId: "c1" });
      expect(refresh({ resource: RESOURCE })).toEqual({ status: "rotate", connectionId: "c1" });
    });

    it("명시된 다른 resource는 회전·폐기 없이 invalid_grant", () => {
      expect(refresh({ resource: "https://mal-moi.com/other" })).toEqual({ status: "invalid_grant" });
      expect(refresh({ resource: "https://mal-moi.com/other", presentedHash: "old", usedTokenRow: { tokenHash: "old", connectionId: "c1" } }))
        .toEqual({ status: "invalid_grant" });
    });
  });
});
