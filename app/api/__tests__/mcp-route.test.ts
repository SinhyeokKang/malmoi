import { beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/lib/i18n";
import { toolCatalog } from "@/lib/mcp/catalog";
import { hashApiToken } from "@/lib/mcp/token";

/**
 * `POST /api/mcp` (mcp-connector design §1.1 · §1.2). 순서는 Origin → 인증 → 크기 → 파싱 → 디스패치이고 쿠키를 읽지 않는다.
 * 두 개정(2026-07-28 · 2025 handshake)을 같은 도구 정의로 받는다 — Claude Code는 앞, Codex는 뒤다(T1 실측).
 */

const RAW = "mlm_" + "b".repeat(43);
const HASH = hashApiToken(RAW);
const RAW2 = "mlm_" + "c".repeat(43);
const HASH2 = hashApiToken(RAW2);
const now = Date.now();

const hoisted = vi.hoisted(() => ({ apiToken: { findUnique: vi.fn(), updateMany: vi.fn() }, echo: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ apiToken: hoisted.apiToken }) }));
/**
 * 주체 배선을 재는 시험 도구 — `echo` 켠 테스트에서만 등록한다. 서버가 받은 주체를 그대로 돌려주므로, 요청 사이에 서버·주체가
 * 새면(모듈 캐시·클로저 공유) 다른 토큰의 `userId`가 보인다.
 */
vi.mock("@/lib/mcp/server", async importOriginal => {
  const real = await importOriginal<typeof import("@/lib/mcp/server")>();
  return {
    createMcpServer: (subject: Parameters<typeof real.createMcpServer>[0]) => {
      const server = real.createMcpServer(subject);
      if (hoisted.echo) {
        server.registerTool("echo_subject", { annotations: { readOnlyHint: true } }, async () => ({
          content: [{ type: "text", text: "echo" }],
          structuredContent: { userId: subject.userId, tokenId: subject.tokenId },
        }));
      }
      return server;
    },
  };
});

const route = await import("../mcp/route");
const { POST } = route;

const validRow = () => ({
  userId: "u1", tokenHash: HASH, grants: [], allProjects: true, projectIds: [],
  expiresAt: new Date(now + 3_600_000), lastUsedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.echo = false;
  hoisted.apiToken.findUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) => {
    if (where.tokenHash === HASH) return validRow();
    if (where.tokenHash === HASH2) return { ...validRow(), userId: "u2", tokenHash: HASH2 };
    return null;
  });
  hoisted.apiToken.updateMany.mockResolvedValue({ count: 1 });
});

const LEGACY = { "mcp-protocol-version": "2025-11-25" };
const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "0" },
};

function post(body: unknown, over: { token?: string | null; headers?: Record<string, string>; raw?: string } = {}) {
  const token = over.token === undefined ? RAW : over.token;
  return POST(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...over.headers,
    },
    body: over.raw ?? JSON.stringify(body),
  }));
}

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "codex", version: "0" } } };

describe("세그먼트", () => {
  it("POST만 내보낸다 · maxDuration 60", () => {
    expect(route.maxDuration).toBe(60);
    expect(Object.keys(route).filter(k => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });
});

describe("인증 — 네 갈래가 같은 401", () => {
  const cases: [string, () => Promise<Response>][] = [
    ["토큰 없음", () => post(initialize, { token: null })],
    ["무효", () => post(initialize, { token: "mlm_" + "z".repeat(43) })],
    ["만료", () => { hoisted.apiToken.findUnique.mockResolvedValue({ ...validRow(), expiresAt: new Date(now - 1) }); return post(initialize); }],
    ["폐기(행 없음)", () => { hoisted.apiToken.findUnique.mockResolvedValue(null); return post(initialize); }],
    ["쿠키만", () => post(initialize, { token: null, headers: { cookie: "authjs.session-token=abc; __Secure-authjs.session-token=abc" } })],
    ["Basic scheme", () => post(initialize, { token: null, headers: { authorization: `Basic ${RAW}` } })],
  ];

  it.each(cases)("%s → 401 · 고정 본문", async (_label, send) => {
    const res = await send();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("조회 장애는 401이 아니라 500이고 예외 문구를 싣지 않는다", async () => {
    hoisted.apiToken.findUnique.mockRejectedValue(new Error("connect ECONNREFUSED 10.1.2.3:6543"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(initialize);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("ECONNREFUSED");
    expect(JSON.parse(text)).toEqual({ error: "unavailable" });
  });
});

describe("Origin", () => {
  it("Origin: https://evil.example → 403, 인증 조회 전", async () => {
    const res = await post(initialize, { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(hoisted.apiToken.findUnique).not.toHaveBeenCalled();
  });

  it("Origin 없음·허용 호스트는 통과", async () => {
    expect((await post(initialize)).status).toBe(200);
    expect((await post(initialize, { headers: { origin: "https://mal-moi.com" } })).status).toBe(200);
  });
});

describe("크기 — 인증 뒤 읽기 전에 끊는다", () => {
  it("content-length 1048577 → 400", async () => {
    const res = await post(null, { raw: "{}", headers: { "content-length": "1048577" } });
    expect(res.status).toBe(400);
  });

  it("정확히 1048576바이트는 통과", async () => {
    const base = JSON.stringify(initialize);
    const raw = base + " ".repeat(1_048_576 - Buffer.byteLength(base));
    expect(Buffer.byteLength(raw)).toBe(1_048_576);
    const res = await post(null, { raw });
    expect(res.status).toBe(200);
  });

  it("무효 토큰이면 크기 판정 전에 401 — 무효 토큰 하나로 본문을 읽히지 않는다", async () => {
    const res = await post(null, { token: "mlm_" + "z".repeat(43), raw: "{}", headers: { "content-length": "1048577" } });
    expect(res.status).toBe(401);
  });

  it("JSON이 아니면 400 · JSON-RPC parse error", async () => {
    const res = await post(null, { raw: "{not json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32700 } });
  });
});

describe("2025 handshake (Codex)", () => {
  it("initialize → JSON · 세션 id 없음 · listChanged false", async () => {
    const res = await post(initialize);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = await res.json();
    expect(body.result.capabilities.tools.listChanged).toBe(false);
  });

  it("id 없는 notification → 202", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { headers: LEGACY });
    expect(res.status).toBe(202);
  });

  it("tools/list → 카탈로그 순서 그대로", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { headers: LEGACY });
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(toolCatalog().map(t => t.name));
    const publish = body.result.tools.find((t: { name: string }) => t.name === "sync_repository");
    expect(publish.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  /**
   * ⚠️ **도구가 던지면 SDK는 예외 문구를 결과에 싣는다** — 서버 팩토리가 잡아 장애로 접는다(§6.0). 이 테스트의 가짜 DB에는 `user`가 없어
   * `whoami`의 조회가 던진다 — 그 문구(`Cannot read properties…`)가 응답에 없어야 한다.
   */
  it("도구가 던지면 isError · unavailable · retryable이고 예외 문구가 없다", async () => {
    const res = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whoami", arguments: {} } }, { headers: LEGACY });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual({ status: "unavailable", message: m.errors.access.unavailable, retryable: true });
    expect(JSON.stringify(body)).not.toMatch(/Cannot read|undefined|TypeError/);
  });

  it("입력 스키마를 싣는다 — tools/list의 list_keys는 slug·surfaceSlug를 요구한다", async () => {
    const res = await post({ jsonrpc: "2.0", id: 8, method: "tools/list" }, { headers: LEGACY });
    const tool = (await res.json()).result.tools.find((t: { name: string }) => t.name === "list_keys");
    expect(tool.inputSchema).toMatchObject({ type: "object", required: expect.arrayContaining(["slug", "surfaceSlug"]) });
    expect(Object.keys(tool.inputSchema.properties)).not.toContain("userId");
    expect(Object.keys(tool.inputSchema.properties)).not.toContain("projectId");
  });

  it("미지 도구 이름 → JSON-RPC -32602", async () => {
    const res = await post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "drop_database", arguments: {} } }, { headers: LEGACY });
    expect(await res.json()).toMatchObject({ id: 4, error: { code: -32602 } });
  });

  it("미지 메서드 → -32601", async () => {
    const res = await post({ jsonrpc: "2.0", id: 5, method: "foo/bar" }, { headers: LEGACY });
    expect(await res.json()).toMatchObject({ id: 5, error: { code: -32601 } });
  });

  /**
   * ⚠️ **배치를 받지 않는다** (2026-09-28 오케스트레이터 결정) — 2025-06-18 개정(Codex)이 배치를 없앴고, 도구가 서면 100건 배치 하나가
   * 한 요청 안에서 DB 도구를 펼친다. 본문 상한은 바이트만 막는다.
   */
  it("배치 배열 → 400 · -32600, 어느 호출도 실행하지 않는다", async () => {
    hoisted.echo = true;
    const res = await post([{ jsonrpc: "2.0", id: 6, method: "tools/list" }, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "echo_subject", arguments: {} } }], { headers: LEGACY });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(false);
    expect(body).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32600 } });
  });
});

describe("2026-07-28 (Claude Code)", () => {
  const modern = (method: string, extra: Record<string, string> = {}) => ({ "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...extra });

  it("server/discover → JSON · listChanged false", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META } }, { headers: modern("server/discover") });
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = await res.json();
    expect(body.result.capabilities.tools.listChanged).toBe(false);
  });

  it("tools/list → 카탈로그 순서", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: META } }, { headers: modern("tools/list") });
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(toolCatalog().map(t => t.name));
  });

  it("tools/call → 도구 결과(isError 결과로 돌아온다 — JSON-RPC 오류가 아니다)", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whoami", arguments: {}, _meta: META } },
      { headers: modern("tools/call", { "mcp-name": "whoami" }) },
    );
    const body = await res.json();
    expect(body.result).toMatchObject({ isError: true, structuredContent: { status: "unavailable" } });
  });

  /**
   * ⚠️ `listChanged: false`여도 SDK는 `subscriptions/listen`에 SSE를 연다(15초 keepalive — 함수를 maxDuration까지 붙잡고, 버스는
   * 모듈 전역이다). SDK에 넘기기 전에 -32601로 끊는다.
   */
  it("subscriptions/listen → JSON -32601, 스트림을 열지 않는다", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: "listen:0", method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: META } },
      { headers: modern("subscriptions/listen") },
    );
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: "listen:0", error: { code: -32601, message: "Method not found" } });
  });

  it("Mcp-Method 헤더 없음 → 400 -32020 (SDK 사다리)", async () => {
    const res = await post({ jsonrpc: "2.0", id: 9, method: "tools/list", params: { _meta: META } }, { headers: { "mcp-protocol-version": "2026-07-28" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32020 } });
  });
});

/**
 * **주체는 요청마다 따로다** (검수 Y1). 두 토큰을 동시에 보내 각 응답이 자기 토큰의 `userId`·`tokenId`를 받는지 본다 — 서버나 주체를
 * 요청 사이에 캐시하면 한쪽이 다른 사용자로 돈다(POSTMORTEM 2026-09-06의 "사용자로 안 좁혔다"가 진입점에서 나는 형).
 */
describe("주체 배선 — 동시 요청", () => {
  const call = (token: string, protocol: "legacy" | "modern", id: number) => post(
    { jsonrpc: "2.0", id, method: "tools/call", params: { name: "echo_subject", arguments: {}, ...(protocol === "modern" ? { _meta: META } : {}) } },
    { token, headers: protocol === "legacy" ? LEGACY : { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "echo_subject" } },
  ).then(res => res.json());

  it.each(["legacy", "modern"] as const)("%s — 두 토큰이 각자의 주체를 받는다", async protocol => {
    hoisted.echo = true;
    const results = await Promise.all([call(RAW, protocol, 1), call(RAW2, protocol, 2), call(RAW, protocol, 3), call(RAW2, protocol, 4)]);
    expect(results.map(r => r.result?.structuredContent)).toEqual([
      { userId: "u1", tokenId: HASH },
      { userId: "u2", tokenId: HASH2 },
      { userId: "u1", tokenId: HASH },
      { userId: "u2", tokenId: HASH2 },
    ]);
  });
});
