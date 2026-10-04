// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it("동시 호출과 완료 뒤 호출은 같은 Docs 요청을 공유한다", async () => {
  const docs = [{ id: "docs:first" }];
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs }) });
  vi.stubGlobal("fetch", fetch);
  const { loadSearchIndex } = await import("../load-index");
  expect(await Promise.all([loadSearchIndex("en"), loadSearchIndex("en")])).toEqual([docs, docs]);
  expect(await loadSearchIndex("en")).toEqual(docs);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/search-index/en");
});

it("캐시는 화면 언어별 키다 — 언어를 바꾸면 그 언어의 색인을 따로 받고, 돌아오면 다시 받지 않는다", async () => {
  const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () => ({ docs: [{ id: url }] }) }));
  vi.stubGlobal("fetch", fetch);
  const { loadSearchIndex } = await import("../load-index");
  expect(await loadSearchIndex("en")).toEqual([{ id: "/api/search-index/en" }]);
  expect(await loadSearchIndex("ko")).toEqual([{ id: "/api/search-index/ko" }]);
  expect(await loadSearchIndex("en")).toEqual([{ id: "/api/search-index/en" }]);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/search-index/en", "/api/search-index/ko"]);
});

it.each(["network", "http", "json"])("%s 실패는 버리고 다음 호출에서 재시도한다", async kind => {
  const fetch = vi.fn();
  if (kind === "network") fetch.mockRejectedValueOnce(new Error("offline"));
  if (kind === "http") fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ docs: [] }) });
  if (kind === "json") fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("invalid json"); } });
  fetch.mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) });
  vi.stubGlobal("fetch", fetch);
  const { loadSearchIndex } = await import("../load-index");
  await expect(loadSearchIndex("ko")).rejects.toThrow();
  expect(await loadSearchIndex("ko")).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
