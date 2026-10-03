// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it("동시 호출과 완료 뒤 호출은 같은 Docs 요청을 공유한다", async () => {
  const docs = [{ id: "docs:first" }];
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs }) });
  vi.stubGlobal("fetch", fetch);
  const { loadSearchIndex } = await import("../load-index");
  expect(await Promise.all([loadSearchIndex(), loadSearchIndex()])).toEqual([docs, docs]);
  expect(await loadSearchIndex()).toEqual(docs);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/search-index");
});

it.each(["network", "http", "json"])("%s 실패는 버리고 다음 호출에서 재시도한다", async kind => {
  const fetch = vi.fn();
  if (kind === "network") fetch.mockRejectedValueOnce(new Error("offline"));
  if (kind === "http") fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ docs: [] }) });
  if (kind === "json") fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("invalid json"); } });
  fetch.mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) });
  vi.stubGlobal("fetch", fetch);
  const { loadSearchIndex } = await import("../load-index");
  await expect(loadSearchIndex()).rejects.toThrow();
  expect(await loadSearchIndex()).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
