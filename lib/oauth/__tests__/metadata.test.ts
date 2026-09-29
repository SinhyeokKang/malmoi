import { describe, expect, it } from "vitest";

import { authorizationServerMetadata, mcpResource, protectedResourceMetadata, wwwAuthenticate } from "../metadata";

const ORIGIN = "https://mal-moi.com";

describe("mcpResource", () => {
  it("발급 환경의 정확한 MCP URL이다", () => {
    expect(mcpResource(ORIGIN)).toBe("https://mal-moi.com/api/mcp");
  });
});

describe("protectedResourceMetadata (RFC 9728)", () => {
  it("resource와 authorization_servers가 같은 origin이다", () => {
    expect(JSON.parse(JSON.stringify(protectedResourceMetadata(ORIGIN)))).toEqual({
      resource: "https://mal-moi.com/api/mcp",
      authorization_servers: ["https://mal-moi.com"],
    });
  });

  it("로컬 개발 origin(http://localhost)도 만든다", () => {
    expect(protectedResourceMetadata("http://localhost:3000")).toMatchObject({ resource: "http://localhost:3000/api/mcp" });
  });

  it("결정적이다 — 두 번 불러도 같은 JSON", () => {
    expect(JSON.stringify(protectedResourceMetadata(ORIGIN))).toBe(JSON.stringify(protectedResourceMetadata(ORIGIN)));
  });
});

describe("authorizationServerMetadata (RFC 8414)", () => {
  it("public client + PKCE S256 + code/refresh만 광고한다", () => {
    expect(authorizationServerMetadata(ORIGIN)).toEqual({
      issuer: "https://mal-moi.com",
      authorization_endpoint: "https://mal-moi.com/oauth/authorize",
      token_endpoint: "https://mal-moi.com/oauth/token",
      revocation_endpoint: "https://mal-moi.com/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("scope 어휘를 광고하지 않는다 — 새 권한 어휘는 비목표다", () => {
    expect(authorizationServerMetadata(ORIGIN)).not.toHaveProperty("scopes_supported");
  });
});

describe("wwwAuthenticate", () => {
  it("401 헤더가 path-aware PRM URL을 가리킨다", () => {
    expect(wwwAuthenticate(ORIGIN)).toBe('Bearer resource_metadata="https://mal-moi.com/.well-known/oauth-protected-resource/api/mcp"');
  });
});
