import { beforeEach, describe, expect, it, vi } from "vitest";

const https = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:https", () => ({ request: https.request }));

const { fetchClientMetadata, pinnedGet } = await import("../client-metadata-fetch");

/**
 * **CIMD 문서 가져오기** (mcp-oauth design §2 · 결정 기록). 순서가 방어다: clientId URL 모양 → DNS 해석 → **해석된 주소 전부** 공개인지 →
 * 그 주소에 **고정해** 가져오기(재해석으로 rebinding되지 않게) → 200 · JSON · 크기 상한 → `planClientMetadata`. 리다이렉트는 따르지 않는다.
 * 네트워크 층(`get`)은 주입한다 — 판정 순서와 갈래를 여기서 센다.
 */
const CLIENT = "https://claude.ai/oauth/claude-code-client-metadata";
const DOC = { client_id: CLIENT, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"] };
const resolve = vi.fn();
const get = vi.fn();
const deps = { resolve, get };

beforeEach(() => {
  vi.clearAllMocks();
  resolve.mockResolvedValue([{ address: "160.79.104.10", family: 4 }]);
  get.mockResolvedValue({ status: 200, contentType: "application/json", body: JSON.stringify(DOC) });
});

describe("fetchClientMetadata", () => {
  it("공개 주소 · 200 JSON · 유효 문서 → client", async () => {
    await expect(fetchClientMetadata(CLIENT, deps)).resolves.toEqual({ ok: true, client: {
      clientId: CLIENT, clientName: "Claude Code", displayName: "Claude Code", redirectUris: DOC.redirect_uris,
    } });
    expect(resolve).toHaveBeenCalledWith("claude.ai");
    expect(get).toHaveBeenCalledWith(new URL(CLIENT), { address: "160.79.104.10", family: 4 }, expect.objectContaining({ maxBytes: expect.any(Number), timeoutMs: expect.any(Number) }));
  });

  it("clientId가 HTTPS 문서 URL이 아니면 해석도 하지 않는다", async () => {
    for (const id of ["http://claude.ai/x", "https://claude.ai/", "https://claude.ai/x?y=1", "not a url", "https://user@claude.ai/x"]) {
      await expect(fetchClientMetadata(id, deps)).resolves.toEqual({ ok: false, reason: "invalid-client-id" });
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("해석된 주소 중 하나라도 사설·루프백·링크 로컬이면 가져오지 않는다", async () => {
    for (const addresses of [[{ address: "127.0.0.1", family: 4 }], [{ address: "160.79.104.10", family: 4 }, { address: "169.254.169.254", family: 4 }], [{ address: "::ffff:10.0.0.1", family: 6 }], []]) {
      resolve.mockResolvedValueOnce(addresses);
      await expect(fetchClientMetadata(CLIENT, deps)).resolves.toEqual({ ok: false, reason: "blocked-address" });
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("IP literal 호스트도 같은 판정을 지난다", async () => {
    resolve.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    await expect(fetchClientMetadata("https://10.0.0.5/meta.json", deps)).resolves.toEqual({ ok: false, reason: "blocked-address" });
  });

  it("해석 실패 · 가져오기 실패(시간 초과 포함) · 200이 아님(리다이렉트 포함) → unreachable", async () => {
    resolve.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(fetchClientMetadata(CLIENT, deps)).resolves.toEqual({ ok: false, reason: "unreachable" });
    get.mockRejectedValueOnce(new Error("timeout"));
    await expect(fetchClientMetadata(CLIENT, deps)).resolves.toEqual({ ok: false, reason: "unreachable" });
    for (const status of [301, 302, 404, 500]) {
      get.mockResolvedValueOnce({ status, contentType: "application/json", body: "{}" });
      await expect(fetchClientMetadata(CLIENT, deps)).resolves.toEqual({ ok: false, reason: "unreachable" });
    }
  });

  it("JSON이 아닌 형식 · 상한 초과 · 깨진 JSON · 문서 검증 실패 → invalid-document", async () => {
    for (const response of [
      { status: 200, contentType: "text/html", body: JSON.stringify(DOC) },
      { status: 200, contentType: null, body: JSON.stringify(DOC) },
      { status: 200, contentType: "application/json", body: null },
      { status: 200, contentType: "application/json", body: "{" },
      { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ ...DOC, client_id: "https://evil.example/x" }) },
    ]) {
      get.mockResolvedValueOnce(response);
      await expect(fetchClientMetadata(CLIENT, deps)).resolves.toEqual({ ok: false, reason: "invalid-document" });
    }
  });
});

/**
 * **실제 네트워크 층의 고정** — keep-alive 에이전트가 있으면 같은 호스트로 열린 소켓을 재사용해 `lookup` 고정을 건너뛴다(리뷰 재현).
 * 요청마다 에이전트 없이(`agent: false`) 새 연결을 열고, 연결 주소는 `lookup`이 준 고정 주소뿐이다.
 */
describe("pinnedGet", () => {
  it("agent: false · lookup은 두 호출 모양 모두 고정 주소만 준다", async () => {
    const { EventEmitter } = await import("node:events");
    https.request.mockImplementation(() => {
      const req = Object.assign(new EventEmitter(), { end: () => queueMicrotask(() => req.emit("error", new Error("stop"))), destroy: () => undefined });
      return req;
    });
    const pinned = { address: "160.79.104.10", family: 4 as const };
    await expect(pinnedGet(new URL(CLIENT), pinned, { timeoutMs: 1_000, maxBytes: 10 })).rejects.toThrow("stop");
    const options = https.request.mock.calls[0]![1] as { agent: unknown; lookup: (h: string, o: object, cb: (...a: unknown[]) => void) => void };
    expect(options.agent).toBe(false);
    const single = vi.fn();
    options.lookup("claude.ai", {}, single);
    expect(single).toHaveBeenCalledWith(null, "160.79.104.10", 4);
    const all = vi.fn();
    options.lookup("claude.ai", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [pinned]);
  });
});

it("DNS 대기도 전체 5초 마감에 포함하고 늦은 응답으로 HTTPS를 시작하지 않는다", async () => {
  vi.useFakeTimers();
  let finish!: (value: { address: string; family: number }[]) => void;
  resolve.mockReturnValue(new Promise(r => { finish = r; }));
  let result: unknown;
  const request = fetchClientMetadata(CLIENT, deps).then(value => { result = value; });
  try {
    await vi.advanceTimersByTimeAsync(5_000);
    expect(result).toEqual({ ok: false, reason: "unreachable" });
  } finally {
    finish([{ address: "160.79.104.10", family: 4 }]);
    await request;
    vi.useRealTimers();
  }
  expect(get).not.toHaveBeenCalled();
});

it("DNS에 쓴 시간만큼 HTTPS 대기 한도가 줄어든다", async () => {
  vi.useFakeTimers();
  resolve.mockImplementation(() => new Promise(r => setTimeout(() => r([{ address: "160.79.104.10", family: 4 }]), 4_000)));
  try {
    const request = fetchClientMetadata(CLIENT, deps);
    await vi.advanceTimersByTimeAsync(4_000);
    await request;
    expect(get.mock.calls[0]![2].timeoutMs).toBeLessThanOrEqual(1_000);
  } finally { vi.useRealTimers(); }
});
