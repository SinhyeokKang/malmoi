import { describe, expect, it } from "vitest";
import { blobSha } from "@/lib/githash";
import { runPull, type PendingEdit, type PullState } from "../run";
import type { RenderKey } from "../render";
import { createFakeGitClient } from "./fake-client";

/**
 * **파일 바이트에 반영된 셀만 전달 처리한다** (audit #1 · launch-audit B3.1). render → 전달 집합 → 토큰 해제(`saveLastPulledAt`)
 * 사슬을 한 번에 본다 — 어댑터 계약만 보면 "파일은 그대로인데 토큰이 풀린다"는 연결이 안 보인다.
 *
 * - A: 재생성 어댑터에서 기존 비-base 파일의 유일한 번역을 비우면 `{}`를 쓴다(사용자 결정). 전에는 writer가 `null`을 내
 *   파일이 그대로 남았는데 토큰은 풀렸고, 다음 CI가 옛 값을 DB로 되돌렸다.
 * - B: ts-dict에서 편집 키의 자리가 표면의 어느 파일에도 없으면 그 셀을 보류한다. 전에는 경고 없이 전달로 셌다.
 */

type Surface = PullState["surfaces"][number];

const project = {
  id: "p", slug: "acme", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", repositoryId: "2", lastPulledAt: null,
};

const edit = (id: string, keyId: string, localeCode: string): PendingEdit => ({
  id, token: `tok-${id}`, cell: { surfaceId: "s", keyId, localeCode, restoreValue: "" },
});

async function run(surface: Omit<Surface, "id" | "slug" | "keys">, keys: RenderKey[], files: Record<string, string>, pendingEdits: PendingEdit[]) {
  const tree = Object.entries(files).map(([path, content]) => ({ path, sha: blobSha(content) }));
  const blobs = Object.fromEntries(Object.values(files).map((content) => [blobSha(content), content]));
  const { client, calls } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: tree }, blobs });
  const saved: { delivered: readonly PendingEdit[]; withheld: readonly PendingEdit[] }[] = [];
  const result = await runPull({
    loadState: async () => ({
      project, surfaces: [{ ...surface, id: "s", slug: "web", keys }],
      maxUpdatedAt: new Date(), unpublished: pendingEdits.length, pendingEdits,
    }),
    createClient: async () => client,
    saveLastPulledAt: async (_id, _at, _pub, delivered, _ctx, withheld) => { saved.push({ delivered, withheld }); },
    invalidateDelivery: async () => {},
    syncBranch: "malmoi-i18n/sync-acme",
  });
  const created = calls.find((c) => c.method === "createTree")?.args[0] as { tree: { path: string; content: string }[] } | undefined;
  return { result, saved, written: new Map((created?.tree ?? []).map((t) => [t.path, t.content])) };
}

describe("B3.1 A — 재생성 어댑터: 기존 비-base 파일의 마지막 번역을 비우면 `{}`를 쓴다", () => {
  const key = (fr: string): RenderKey => ({ id: "k", key: "hello", sourceText: "Hi", orphaned: false, cells: { en: { value: "Hi" }, fr: { value: fr } } });

  it("json-catalog — fr.json이 `{}`가 되고 그 편집만 전달된다", async () => {
    const surface = { nestedByPath: {}, adapterName: "json-catalog", pathTemplate: "{locale}.json", nested: false, baseLocale: "en", localeCodes: ["en", "fr"] };
    const files = { "en.json": '{\n  "hello": "Hi"\n}\n', "fr.json": '{\n  "hello": "Salut"\n}\n' };
    const { result, saved, written } = await run(surface, [key("")], files, [edit("fr", "k", "fr")]);
    expect(result).toMatchObject({ status: "committed", delivered: 1, changed: ["fr.json"] });
    expect(written.get("fr.json")).toBe("{}\n");
    expect(saved[0]?.delivered.map((e) => e.id)).toEqual(["fr"]);
  });

  it("chrome-locales — messages.json이 `{}`가 된다 · 원본 들여쓰기·BOM 관측을 그대로 쓴다", async () => {
    const surface = { nestedByPath: {}, adapterName: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", nested: null, baseLocale: "en", localeCodes: ["en", "fr"] };
    const files = {
      "_locales/en/messages.json": '{\n    "hello": {\n        "message": "Hi"\n    }\n}\n',
      "_locales/fr/messages.json": '﻿{\r\n    "hello": {\r\n        "message": "Salut"\r\n    }\r\n}\r\n',
    };
    const { result, written } = await run(surface, [key("")], files, [edit("fr", "k", "fr")]);
    expect(result).toMatchObject({ status: "committed", delivered: 1, changed: ["_locales/fr/messages.json"] });
    expect(written.get("_locales/fr/messages.json")).toBe("﻿{}\r\n");
  });

  it("원본 파일이 없는 로케일은 여전히 파일을 만들지 않는다 (짝 — 빈 새 파일은 '이 로케일 지원함'으로 읽힌다)", async () => {
    const surface = { nestedByPath: {}, adapterName: "json-catalog", pathTemplate: "{locale}.json", nested: false, baseLocale: "en", localeCodes: ["en", "fr"] };
    const files = { "en.json": '{\n  "hello": "Hi"\n}\n' };
    const keys: RenderKey[] = [
      { id: "k", key: "hello", sourceText: "Hi", orphaned: false, cells: { en: { value: "Hello" }, fr: { value: "" } } },
    ];
    const { result, written } = await run(surface, keys, files, [edit("en", "k", "en"), edit("fr", "k", "fr")]);
    expect(result).toMatchObject({ status: "committed", changed: ["en.json"] });
    expect(written.has("fr.json")).toBe(false);
  });
});

describe("B3.1 B — ts-dict: 편집 키의 자리가 표면의 어느 파일에도 없으면 보류한다", () => {
  const surface = { nestedByPath: {}, adapterName: "ts-dict", pathTemplate: "*.ts", nested: null, baseLocale: "en", localeCodes: ["en", "fr"] };
  const files = { "a.ts": 'const en = { hello: "Hi" };\nconst fr = { hello: "Salut" };\n' };
  const keys: RenderKey[] = [
    { id: "k1", key: "hello", sourceText: "Hi", orphaned: false, cells: { en: { value: "Hi" }, fr: { value: "Bonjour" } } },
    { id: "k2", key: "gone", sourceText: "Gone", orphaned: false, cells: { en: { value: "Gone" }, fr: { value: "Parti" } } },
  ];

  it("다른 편집은 나가고 자리 없는 편집만 토큰이 남는다", async () => {
    const { result, saved, written } = await run(surface, keys, files, [edit("hello", "k1", "fr"), edit("gone", "k2", "fr")]);
    expect(result).toMatchObject({ status: "committed", delivered: 1, withheld: { file: 0, key: 1 } });
    expect(written.get("a.ts")).toContain('"Bonjour"');
    expect(saved[0]?.delivered.map((e) => e.id)).toEqual(["hello"]);
    expect(saved[0]?.withheld.map((e) => e.id)).toEqual(["gone"]);
  });

  it("자리 없는 편집뿐이면 쓰지도 해제하지도 않는다", async () => {
    const settled = keys.map((k) => (k.id === "k1" ? { ...k, cells: { en: { value: "Hi" }, fr: { value: "Salut" } } } : k));
    const { result, saved } = await run(surface, settled, files, [edit("gone", "k2", "fr")]);
    expect(result).toEqual({ status: "skipped", reason: "withheld", withheld: { file: 0, key: 1 } });
    expect(saved).toEqual([]);
  });

  it("다른 네임스페이스 파일에 자리가 있으면 보류하지 않는다 (짝)", async () => {
    const two = { ...files, "b.ts": 'const en = { gone: "Gone" };\nconst fr = { gone: "Adieu" };\n' };
    const { result, written } = await run(surface, keys, two, [edit("gone", "k2", "fr")]);
    expect(result).toMatchObject({ status: "committed", delivered: 1 });
    expect(result).not.toHaveProperty("withheld");
    expect(written.get("b.ts")).toContain('"Parti"');
  });
});
