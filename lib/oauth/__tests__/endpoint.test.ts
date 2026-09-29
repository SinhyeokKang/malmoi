import { describe, expect, it } from "vitest";

import { oauthEndpoint } from "../endpoint";

/**
 * 현재 요청의 발급 환경 (mcp-oauth design §6). `requestOrigin`이 허용 호스트로 거른 origin 하나에서 issuer와 resource가 함께 나온다 —
 * 둘을 따로 만들면 한쪽만 바뀐다. 허용 밖 호스트면 **만들지 않는다** — 그 요청에는 OAuth 바인딩이 성립하지 않는다.
 */
const headers = (host: string | null, proto: string | null = "https") => {
  const h = new Headers();
  if (host !== null) h.set("host", host);
  if (proto !== null) h.set("x-forwarded-proto", proto);
  return h;
};

describe("oauthEndpoint", () => {
  it("프로덕션 · preview · 로컬이 각자 자기 origin이다", () => {
    expect(oauthEndpoint(headers("mal-moi.com"))).toEqual({ issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" });
    expect(oauthEndpoint(headers("dev.mal-moi.com"))).toEqual({ issuer: "https://dev.mal-moi.com", resource: "https://dev.mal-moi.com/api/mcp" });
    expect(oauthEndpoint(headers("localhost:3000", null))).toEqual({ issuer: "http://localhost:3000", resource: "http://localhost:3000/api/mcp" });
  });

  it("허용 밖 호스트·Host 없음 → null", () => {
    expect(oauthEndpoint(headers("evil.example"))).toBeNull();
    expect(oauthEndpoint(headers(null))).toBeNull();
  });
});
