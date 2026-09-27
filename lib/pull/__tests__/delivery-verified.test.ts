import { describe, expect, it } from "vitest";
import { blobSha } from "@/lib/githash";
import { runPull, type PendingEdit, type PullState } from "../run";
import { renderLocaleFiles, type RenderKey } from "../render";
import { adapterFor } from "@/lib/adapters";
import { formatFromProject } from "../plan";
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

async function run(surface: Omit<Surface, "id" | "slug" | "keys" | "localeCodes"> & { localeCodes: readonly string[] }, keys: RenderKey[], files: Record<string, string>, pendingEdits: PendingEdit[]) {
  const tree = Object.entries(files).map(([path, content]) => ({ path, sha: blobSha(content) }));
  const blobs = Object.fromEntries(Object.values(files).map((content) => [blobSha(content), content]));
  const { client, calls } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: tree }, blobs });
  const saved: { delivered: readonly PendingEdit[]; withheld: readonly PendingEdit[] }[] = [];
  const result = await runPull({
    loadState: async () => ({
      project, surfaces: [{ ...surface, localeCodes: [...surface.localeCodes], id: "s", slug: "web", keys }],
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

/**
 * **base 파일은 0개여도 `{}`로 쓰지 않는다** (B3 r1 R1 → B3.4에 흡수). base 파일의 키 집합은 원본이 정하므로, DB 키가 전부 orphaned여도 원본 키가
 * 원본 값으로 남아 파일이 그대로다. 전에는 `{}`가 나가 그 PR 머지가 코드 소유 키를 지웠다. 비-base는 `{}`다(비운 편집이 전달되게 — audit #1).
 */
describe("B3.1 A 짝 — base + 원본 + 활성 DB 키 0개 → 파일 그대로", () => {
  it.each([
    ["json-catalog", "{locale}.json", "en.json", '{\n  "hello": "Hi",\n  "added": "New"\n}\n'],
    ["chrome-locales", "_locales/{locale}/messages.json", "_locales/en/messages.json", '{\n  "hello": { "message": "Hi" }\n}\n'],
  ])("%s", (adapterName, pathTemplate, basePath, original) => {
    const cols = { adapterName, pathTemplate, nested: false, nestedByPath: {}, baseLocale: "en" };
    const format = formatFromProject(cols, ["en", "fr"]);
    const frPath = pathTemplate.replace("{locale}", "fr");
    const keys: RenderKey[] = [{ id: "k", key: "hello", sourceText: "Hi", orphaned: true, cells: { en: { value: "Hi" }, fr: { value: "Salut" } } }];
    const out = renderLocaleFiles(format, adapterFor(format).layout,
      [{ path: basePath, locale: "en" }, { path: frPath, locale: "fr" }], keys, "en", new Map([[basePath, original], [frPath, original]]));
    const baseOut = out.find((f) => f.locale === "en")?.content;
    expect(baseOut === null || baseOut === original).toBe(true);
    expect(out.find((f) => f.locale === "fr")?.content?.replace(/\s/g, "")).toBe("{}");
  });
});

/**
 * **CI 적재 보류 중 코드가 base를 바꿔도 Publish가 되돌리지 않는다** (launch-audit B3.4 — `.scratch` 재현에서 승격). DB에는 `hello`·`deleted`가 있고
 * (편집 있음), 리포 base 파일은 그 뒤 `added`를 더하고 `deleted`를 지웠다. pull 시점 base 파일의 키 집합은 원본이 정한다 — `added`는 원본 값,
 * `deleted`는 쓰지 않는다. 비-base 로케일은 그대로다. `deleted`의 base 편집은 파일에 닿지 않으므로 보류다(`keySlot`과 같은 판정).
 */
describe("B3.4 — base 파일의 키 집합은 원본이 정한다", () => {
  const keys: RenderKey[] = [
    { id: "k1", key: "hello", sourceText: "Hi", orphaned: false, cells: { en: { value: "Hello" }, fr: { value: "Bonjour" } } },
    { id: "k2", key: "deleted", sourceText: "Gone", orphaned: false, cells: { en: { value: "Gone!" }, fr: { value: "Parti" } } },
  ];
  const families = [
    ["json-catalog (재생성)", { nestedByPath: {}, adapterName: "json-catalog", pathTemplate: "{locale}.json", nested: false, baseLocale: "en", localeCodes: ["en", "fr"] },
      "en.json", '{\n  "hello": "Hi",\n  "added": "New"\n}\n', "fr.json", '{\n  "hello": "Salut",\n  "deleted": "Parti"\n}\n', '"added": "New"', '"Hello"'],
    ["yaml-catalog (수술적)", { nestedByPath: {}, adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", nested: null, baseLocale: "en", localeCodes: ["en", "fr"] },
      "en.yml", "en:\n  hello: Hi\n  added: New\n", "fr.yml", "fr:\n  hello: Salut\n  deleted: Parti\n", "added: New", "hello: Hello"],
  ] as const;

  it.each(families)("%s — 더한 키는 남고 지운 키는 돌아오지 않는다 · 그 base 편집은 보류", async (_n, surface, enPath, en, frPath, fr, addedLine, editedLine) => {
    const { result, saved, written } = await run(surface, keys, { [enPath]: en, [frPath]: fr },
      [edit("hello-en", "k1", "en"), edit("deleted-en", "k2", "en"), edit("hello-fr", "k1", "fr")]);
    const base = written.get(enPath)!;
    expect(base).toContain(addedLine);
    expect(base).toContain(editedLine);
    expect(base).not.toContain("Gone");
    // 비-base는 그대로다 — 이 규칙은 base만이다.
    expect(written.get(frPath)).toContain("Bonjour");
    expect(result).toMatchObject({ status: "committed", delivered: 2, withheld: { file: 0, key: 1 } });
    expect(saved[0]?.withheld.map((e) => e.id)).toEqual(["deleted-en"]);
  });

  it("원본 base 파일이 없으면(첫 쓰기) 지금처럼 DB 키로 만든다 (짝)", async () => {
    const surface = families[0][1];
    const { written } = await run(surface, keys, { "fr.json": '{\n  "hello": "Salut"\n}\n' }, [edit("hello-fr", "k1", "fr")]);
    expect(written.get("en.json")).toBe('{\n  "deleted": "Gone!",\n  "hello": "Hello"\n}\n');
  });

  it("읽을 수 없는 원본 base(재생성)는 덮어쓰지 않고 막는다 — 키 집합을 알 수 없다", async () => {
    const surface = families[0][1];
    const { result, written } = await run(surface, keys, { "en.json": "{ not json", "fr.json": '{\n  "hello": "Salut"\n}\n' }, [edit("hello-fr", "k1", "fr")]);
    expect(result).toMatchObject({ status: "skipped", reason: "writer-warnings" });
    expect(written.size).toBe(0);
  });
});
