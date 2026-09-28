import { beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/lib/i18n";
import { toolCatalog } from "@/lib/mcp/catalog";
import { hashApiToken } from "@/lib/mcp/token";

/**
 * `POST /api/mcp` (mcp-connector design §1.1 · §1.2). 순서는 Origin → 인증 → 크기 → 파싱 → 디스패치이고 쿠키를 읽지 않는다.
 * 두 개정(2026-07-28 · 2025 handshake)을 같은 도구 정의로 받는다 — Claude Code는 앞, Codex는 뒤다(T1 실측).
 * 도구 구현(T6·T7)이 서기 전까지 `tools/call`은 카탈로그의 모든 이름에 `not-implemented` 거부를 돌려준다.
 */

const RAW = "mlm_" + "b".repeat(43);
const HASH = hashApiToken(RAW);
const now = Date.now();

const hoisted = vi.hoisted(() => ({ apiToken: { findUnique: vi.fn(), updateMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ apiToken: hoisted.apiToken }) }));

const route = await import("../mcp/route");
const { POST } = route;

const validRow = () => ({
  userId: "u1", tokenHash: HASH, grants: [], allProjects: true, projectIds: [],
  expiresAt: new Date(now + 3_600_000), lastUsedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.apiToken.findUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) => (where.tokenHash === HASH ? validRow() : null));
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

  it("카탈로그 도구 호출 → isError · not-implemented (T6·T7 전)", async () => {
    const res = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whoami", arguments: {} } }, { headers: LEGACY });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toMatchObject({ status: "not-implemented", message: m.mcp.errors["not-implemented"] });
  });

  it("미지 도구 이름 → JSON-RPC -32602", async () => {
    const res = await post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "drop_database", arguments: {} } }, { headers: LEGACY });
    expect(await res.json()).toMatchObject({ id: 4, error: { code: -32602 } });
  });

  it("미지 메서드 → -32601", async () => {
    const res = await post({ jsonrpc: "2.0", id: 5, method: "foo/bar" }, { headers: LEGACY });
    expect(await res.json()).toMatchObject({ id: 5, error: { code: -32601 } });
  });

  it("배치 배열 → 응답 배열", async () => {
    const res = await post([{ jsonrpc: "2.0", id: 6, method: "tools/list" }, { jsonrpc: "2.0", id: 7, method: "ping" }], { headers: LEGACY });
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((r: { id: number }) => r.id).sort()).toEqual([6, 7]);
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

  it("tools/call → not-implemented", async () => {
    const res = await post(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_keys", arguments: {}, _meta: META } },
      { headers: modern("tools/call", { "mcp-name": "list_keys" }) },
    );
    const body = await res.json();
    expect(body.result).toMatchObject({ isError: true, structuredContent: { status: "not-implemented" } });
  });

  it("Mcp-Method 헤더 없음 → 400 -32020 (SDK 사다리)", async () => {
    const res = await post({ jsonrpc: "2.0", id: 9, method: "tools/list", params: { _meta: META } }, { headers: { "mcp-protocol-version": "2026-07-28" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32020 } });
  });
});
