import { expect, it, vi } from "vitest";
import { runPull } from "../run";
import { createFakeGitClient } from "./fake-client";

it("publishes both surfaces from one snapshot and rejects overlap before writes", async () => {
  const project = { id: "p", slug: "demo", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", lastPulledAt: null };
  const surface = (id: string, pathTemplate: string) => ({
    id, slug: id, adapterName: "json-catalog", pathTemplate, baseLocale: "en", nested: false, nestedByPath: null,
    localeCodes: ["en"], keys: [{ key: "hello", sourceText: id, orphaned: false, cells: { en: { value: id } } }],
  });
  async function run(reverse: boolean, overlap = false) {
    const { client, calls } = createFakeGitClient({ refSha: { "heads/main": "base" }, tree: { base: [] } });
    const surfaces = [surface("a", "a/{locale}.json"), surface("b", overlap ? "a/{locale}.json" : "b/{locale}.json")];
    const promise = runPull({ loadState: async () => ({ project, surfaces: reverse ? surfaces.reverse() : surfaces, maxUpdatedAt: new Date() }),
      createClient: async () => client, saveLastPulledAt: async () => {}, syncBranch: "malmoi-i18n/sync-demo" });
    if (overlap) {
      await expect(promise).rejects.toThrow(/a\/en.json/);
      expect(calls.filter(c => c.method.startsWith("create"))).toEqual([]);
    } else {
      expect(await promise).toMatchObject({ status: "committed", changed: ["a/en.json", "b/en.json"] });
      expect(calls.filter(c => c.method === "getTree")).toHaveLength(1);
      expect(calls.filter(c => c.method === "createTree")).toHaveLength(1);
      expect(calls.filter(c => c.method === "createCommit")).toHaveLength(1);
      expect(calls.filter(c => c.method === "createPr")).toHaveLength(1);
    }
    return calls.find(c => c.method === "createTree");
  }
  expect(await run(false)).toEqual(await run(true));
  await run(false, true);
});

it("does not publish or advance the watermark when the second surface blob fails", async () => {
  const { client, calls } = createFakeGitClient({ refSha: { "heads/main": "base" }, tree: { base: [
    { path: "a/en.json", sha: "a" },
    { path: "b/en.json", sha: "b" },
  ] }, blobs: { a: '{"hello":"old"}' } });
  const saveLastPulledAt = vi.fn();
  await expect(runPull({ loadState: async () => ({
    project: { id: "p", slug: "demo", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", lastPulledAt: null },
    surfaces: ["a", "b"].map(id => ({ id, slug: id, adapterName: "json-catalog", pathTemplate: `${id}/{locale}.json`, baseLocale: "en", nested: false, nestedByPath: null,
      localeCodes: ["en"], keys: [{ key: "hello", sourceText: id, orphaned: false, cells: { en: { value: id } } }] })), maxUpdatedAt: new Date(),
  }), createClient: async () => client, saveLastPulledAt, syncBranch: "malmoi-i18n/sync-demo" })).rejects.toThrow();
  expect(calls.filter(c => c.method.startsWith("create") || c.method === "updateRefForce")).toEqual([]);
  expect(saveLastPulledAt).not.toHaveBeenCalled();
});
