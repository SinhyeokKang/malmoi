import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **발견 문서 둘** (mcp-oauth design §1 · spec 조건 2) — `/.well-known/oauth-protected-resource/api/mcp`(RFC 9728)와
 * `/.well-known/oauth-authorization-server`(RFC 8414). 두 CLI 모두 이 두 경로를 쓴다(T1 실측). 문서는 **요청 origin**의 것이다 —
 * dev·preview·prod가 각자 자기를 광고하고, 허용 밖 호스트에는 문서를 만들지 않는다.
 */
const prm = await import("../.well-known/oauth-protected-resource/api/mcp/route");
const as = await import("../.well-known/oauth-authorization-server/route");

const get = (handler: (request: Request) => Promise<Response> | Response, host: string, proto: string | null = "https") =>
  handler(new Request(`http://${host}/x`, { headers: { host, ...(proto === null ? {} : { "x-forwarded-proto": proto }) } }));

describe("세그먼트", () => {
  it("GET만 내보낸다", () => {
    for (const route of [prm, as]) expect(Object.keys(route).filter(k => /^[A-Z]+$/.test(k))).toEqual(["GET"]);
  });
});

describe("/.well-known/oauth-protected-resource/api/mcp", () => {
  it("resource = 요청 origin의 MCP URL · authorization_servers = 그 origin", async () => {
    const res = await get(prm.GET, "mal-moi.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ resource: "https://mal-moi.com/api/mcp", authorization_servers: ["https://mal-moi.com"] });
  });

  it("dev · 로컬은 각자 자기 origin", async () => {
    expect(await (await get(prm.GET, "dev.mal-moi.com")).json()).toMatchObject({ resource: "https://dev.mal-moi.com/api/mcp" });
    expect(await (await get(prm.GET, "localhost:3000", null)).json()).toMatchObject({ resource: "http://localhost:3000/api/mcp" });
  });

  it("허용 밖 호스트 → 404", async () => {
    expect((await get(prm.GET, "evil.example")).status).toBe(404);
  });
});

describe("/.well-known/oauth-authorization-server", () => {
  it("issuer·엔드포인트가 요청 origin · S256 · public client · CIMD · 등록 엔드포인트 없음", async () => {
    const res = await get(as.GET, "mal-moi.com");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      issuer: "https://mal-moi.com",
      authorization_endpoint: "https://mal-moi.com/oauth/authorize",
      token_endpoint: "https://mal-moi.com/oauth/token",
      revocation_endpoint: "https://mal-moi.com/oauth/revoke",
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    });
    expect(body).not.toHaveProperty("registration_endpoint");
  });

  it("허용 밖 호스트 → 404", async () => {
    expect((await get(as.GET, "evil.example")).status).toBe(404);
  });
});

/**
 * **self-hosted — 발견 문서는 설정 origin만 광고한다** (self-hosting design §2). 문서의 issuer·resource가 곧 MCP 클라이언트가 토큰을
 * 보낼 곳이라, 위조 `Host`·`X-Forwarded-*`가 그것을 바꾸면 토큰이 공격자 호스트로 간다. hosted·로컬 호스트도 받지 않는다.
 */
describe("self-hosted — 위조 헤더", () => {
  const ORIGIN = "https://malmoi.example.com";
  const HOST = "malmoi.example.com";
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("MALMOI_ORIGIN", ORIGIN);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const request = (handler: (request: Request) => Promise<Response> | Response, headers: Record<string, string>) =>
    handler(new Request(`http://${headers.host ?? HOST}/x`, { headers }));

  it("설정 호스트면 x-forwarded-proto·x-forwarded-host와 무관하게 설정 origin이다", async () => {
    const forgeries: Record<string, string>[] = [{}, { "x-forwarded-proto": "http" }, { "x-forwarded-host": "evil.example" }, { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }];
    for (const forged of forgeries) {
      const headers = { host: HOST, ...forged };
      expect(await (await request(prm.GET, headers)).json(), JSON.stringify(forged)).toEqual({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN] });
      expect(await (await request(as.GET, headers)).json(), JSON.stringify(forged)).toMatchObject({
        issuer: ORIGIN,
        authorization_endpoint: `${ORIGIN}/oauth/authorize`,
        token_endpoint: `${ORIGIN}/oauth/token`,
        revocation_endpoint: `${ORIGIN}/oauth/revoke`,
      });
    }
  });

  it.each<Record<string, string>>([
    { host: "evil.example" },
    { host: "evil.example", "x-forwarded-host": HOST, "x-forwarded-proto": "https" },
    { host: "mal-moi.com", "x-forwarded-proto": "https" },
    { host: "dev.mal-moi.com" },
    { host: "localhost:3000" },
    { host: "malmoi.example.com.evil.example" },
    { host: "malmoi.example.com:8443" },
  ])("위조·hosted·로컬 Host %j → 두 문서 다 404", async (headers) => {
    expect((await request(prm.GET, headers)).status).toBe(404);
    expect((await request(as.GET, headers)).status).toBe(404);
  });

  it("어느 응답에도 mal-moi.com이 없다", async () => {
    const bodies = await Promise.all([prm.GET, as.GET].map(async (handler) => (await request(handler, { host: HOST, "x-forwarded-proto": "http" })).text()));
    for (const body of bodies) expect(body).not.toContain("mal-moi.com");
  });
});
