import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ client: { getRefSha: vi.fn(), getTree: vi.fn(), getBlobText: vi.fn() }, open: vi.fn(), load: vi.fn(), snapshot: vi.fn() }));
/**
 * **미리보기의 DB 입력은 스냅샷 한 벌이다** (Codex review CR-01 — `loadPreviewSnapshot`). 이 파일의 픽스처는 표시 쪽(`db.project`·`db.translation`)과
 * 렌더 쪽(`mocks.load`)을 따로 주던 모양이라, 목이 그 둘을 **한 스냅샷으로 조립**한다: 표면은 렌더 상태가 주면 그것, 아니면 표시 픽스처의 표면(키 없음).
 * 조립한 스냅샷은 `snapshotOf()`로 다시 꺼낸다 — 지문 단언이 "응답이 쓴 바로 그 상태"를 입력으로 삼게. 한 스냅샷의 실제 보장은 PG가 잰다(delivery-invariants).
 */
let lastSnapshot: { state: unknown } | undefined;
const snapshotOf = () => lastSnapshot!.state as never;
vi.mock("@/lib/pull/load", () => ({ loadPreviewSnapshot: mocks.snapshot }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/github", () => ({ createGitClient: async () => mocks.client }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: mocks.open }));
vi.mock("@/lib/keys/query", () => ({ loadActors: async () => new Map() }));
import { readPublishPreview } from "../read";
import { publishFingerprint } from "../fingerprint";
const surface = { id: "s", slug: "web", adapterName: "json-catalog", pathTemplate: "{locale}.json", baseLocale: "en", nested: false, nestedByPath: {}, locales: [{ code: "en" }] };
const project = { id: "p", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", repositoryId: "2", lastPulledAt: null, archivedAt: null, surfaces: [surface] };
const rows = [{ surfaceId: "s", keyId: "k", localeCode: "en", value: "new", updatedBy: "editor", updatedAt: new Date(), stringKey: { key: "hello" } }];
const db = { project: { findUniqueOrThrow: vi.fn() }, translation: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() } };
beforeEach(() => { vi.clearAllMocks(); db.project.findUniqueOrThrow.mockResolvedValue(project); db.translation.findMany.mockResolvedValue(rows); db.translation.count.mockResolvedValue(1); db.translation.groupBy.mockResolvedValue([{ keyId: "k" }]); mocks.client.getRefSha.mockResolvedValue("head"); mocks.client.getTree.mockResolvedValue([{ path: "en.json", sha: "blob" }]); mocks.client.getBlobText.mockResolvedValue('{"hello":"old"}'); mocks.open.mockResolvedValue("https://github.com/o/r/pull/12"); mocks.load.mockResolvedValue({ project: { ...project, slug: "acme" }, surfaces: [], maxUpdatedAt: null, unpublished: 0, pendingEdits: [] });
  mocks.snapshot.mockImplementation(async (_prisma: unknown, slug: string, limit: number) => {
    const fixture = await db.project.findUniqueOrThrow();
    const loaded = await mocks.load();
    const surfaces = loaded.surfaces.length > 0 ? loaded.surfaces
      : fixture.surfaces.map((s: { locales: { code: string }[] }) => ({ ...s, localeCodes: s.locales.map(l => l.code), keys: [] }));
    const state = { ...loaded, project: { ...fixture, slug }, surfaces };
    lastSnapshot = { state };
    const found = await db.translation.findMany();
    return { state, rows: found.slice(0, limit), total: await db.translation.count(), keys: (await db.translation.groupBy()).length, archivedAt: fixture.archivedAt };
  });
});
it("쓰기 메서드 없는 클라이언트로 base 이전 값과 DB 값을 함께 읽는다", async () => {
 const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
 expect(result.groups[0]?.rows[0]).toMatchObject({ before: "old", after: "new" });
 expect(result.openPr?.number).toBe(12);
 // DB 입력은 스냅샷 한 번이다 — 표시 상한을 함께 넘긴다(CR-01).
 expect(mocks.snapshot).toHaveBeenCalledTimes(1);
 expect(mocks.snapshot).toHaveBeenCalledWith(db, "acme", 200);
 expect(mocks.client.getRefSha).toHaveBeenCalledWith("heads/main");
});
it("base 파싱 실패를 빈 이전 값으로 접지 않는다", async () => { mocks.client.getBlobText.mockResolvedValue("invalid"); await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toThrow(); });
it("상한 초과와 열린 PR 미확인을 보존한다", async () => { db.translation.count.mockResolvedValue(903); mocks.open.mockResolvedValue(undefined); const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme"); expect(result.truncated).toBe(902); expect(result.keys).toBe(1); expect(result.openPr).toBeUndefined(); });
it("여러 로케일 파일에서는 해당 로케일과 키가 있는 파일을 고른다", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "ts-dict", pathTemplate: "*.ts", locales: [{ code: "en" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "ko" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "a.ts", sha: "a" }, { path: "b.ts", sha: "b" }]);
  mocks.client.getBlobText.mockImplementation(async (sha: string) => sha === "a" ? 'const en = { hello: "english" };' : 'const ko = { hello: "korean" };');
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups[0]).toMatchObject({ path: "b.ts", rows: [{ before: "korean", after: "new" }] });
});
it("로케일 경로가 없으면 첫 파일로 위장하지 않고 미리보기를 막는다", async () => {
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "ko" }]);
  await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toThrow("Preview path unavailable");
});
it("per-locale 새 파일은 경로가 확정돼 이전 값 없음으로 표시한다", async () => {
  mocks.client.getTree.mockResolvedValue([]);
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups[0]).toMatchObject({ path: "en.json", rows: [{ before: null, after: "new" }] });
});
it("multi-locale 경로가 둘이면 첫 파일을 임의로 고르지 않는다", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "ts-dict", pathTemplate: "*.ts" }] });
  mocks.client.getTree.mockResolvedValue([{ path: "a.ts", sha: "a" }, { path: "b.ts", sha: "b" }]);
  mocks.client.getBlobText.mockResolvedValue('const en = { hello: "old" };');
  await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toThrow("Preview path unavailable");
});
/**
 * ⚠️ **pull이 안 쓰는 셀을 약속하지 않는다** (launch-readiness L3.7). 수술적 per-locale 어댑터는 원본 파일이 없으면
 * `original-file-missing`으로 그 로케일을 안 낸다(`render.ts`) — 미리보기가 그 셀을 "추가"로 그리면 거짓이다.
 * 빼되 수를 따로 센다: `truncated`(상한 밖)에 섞으면 "더 있다"로 읽힌다. 막지는 않는다 — 다른 셀은 나간다.
 */
it("수술적 per-locale 어댑터의 없는 파일 셀은 빼고 따로 센다", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", locales: [{ code: "en" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([rows[0], { ...rows[0], localeCode: "ko", value: "새" }]);
  db.translation.count.mockResolvedValue(2);
  mocks.client.getTree.mockResolvedValue([{ path: "en.yml", sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue("hello: old\n");
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups.map(g => [g.path, g.rows.map(r => r.localeCode)])).toEqual([["en.yml", ["en"]]]);
  expect(result.withoutFile).toBe(1);
  expect(result.truncated).toBe(0);
});
it("재생성 어댑터의 없는 파일은 새 파일이라 빼지 않는다 (짝)", async () => {
  mocks.client.getTree.mockResolvedValue([]);
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.withoutFile).toBe(0);
  expect(result.groups[0]?.rows).toHaveLength(1);
});
/**
 * **미리보기와 실행이 같은 판정을 쓴다** (delivery-invariants D3 · T4 — POSTMORTEM 2026-09-17 "같은 pending이 화면마다 다르게").
 * base 파일 부재는 실행이 `writer-warnings`로 거부하므로 미리보기도 약속하지 않는다. ⚠️ 두 수가 같은 것은 pending 200행 이하에서만이다.
 */
it("수술적 per-locale의 **base** 파일이 없으면 미리보기를 막는다 — 실행이 거부하는 셀을 약속하지 않는다", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", locales: [{ code: "en" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "ko", value: "새" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "ko.yml", sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue("ko:\n  hello: old\n");
  await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toMatchObject({ name: "PreviewBaseFileMissing", path: "en.yml", branch: "main" });
});
it("ts-dict 로케일 객체에 자리가 없는 키는 빼고 withoutKey로 센다 — 같은 파일의 다른 로케일이 그 키를 가진다", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "ts-dict", pathTemplate: "*.ts", locales: [{ code: "en" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "ko" }, { ...rows[0], keyId: "k2", localeCode: "ko", stringKey: { key: "bye" } }]);
  db.translation.count.mockResolvedValue(2);
  mocks.client.getTree.mockResolvedValue([{ path: "a.ts", sha: "a" }]);
  mocks.client.getBlobText.mockResolvedValue('const en = { hello: "hi", bye: "bye" };\nconst ko = { bye: "잘가" };');
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups.flatMap(g => g.rows.map(r => r.key))).toEqual(["bye"]);
  expect(result).toMatchObject({ withoutFile: 0, withoutKey: 1 });
});
it("같은 픽스처에서 미리보기의 withoutFile과 실행의 withheld가 같다 (yaml · 비-base 파일 부재)", async () => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const EN = "en:\n  hello: old\n";
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", nested: null, locales: [{ code: "en" }, { code: "fr" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([rows[0], { ...rows[0], localeCode: "fr", value: "neuf" }, { ...rows[0], localeCode: "ko", value: "새" }]);
  db.translation.count.mockResolvedValue(3);
  mocks.client.getTree.mockResolvedValue([{ path: "en.yml", sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue(EN);
  const preview = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  const { client } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: [{ path: "en.yml", sha: "blob" }] }, blobs: { blob: EN } });
  const edit = (locale: string) => ({ id: locale, token: locale, cell: { surfaceId: "s", keyId: "k", localeCode: locale, restoreValue: "" } });
  const result = await runPull({
    loadState: async () => ({
      project: { ...project, slug: "acme" },
      surfaces: [{ ...surface, adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", nested: null, localeCodes: ["en", "fr", "ko"],
        keys: [{ id: "k", key: "hello", sourceText: "old", orphaned: false, cells: { en: { value: "new" }, fr: { value: "neuf" }, ko: { value: "새" } } }] }],
      maxUpdatedAt: new Date(), unpublished: 3, pendingEdits: ["en", "fr", "ko"].map(edit),
    }),
    createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
  });
  expect(preview.withoutFile).toBe(2);
  expect(result).toMatchObject({ status: "committed", withheld: { file: preview.withoutFile, key: 0 } });
  // #84 — 미리보기가 말하는 수는 실제로 나가는 수다(결과의 `delivered`와 같다).
  expect(preview.sendable).toEqual({ total: 1, keys: 1 });
  expect(result).toMatchObject({ delivered: preview.sendable.total });
});
/**
 * code-dict의 구조 충돌은 보류가 아니다 (coordinator review r1 — C는 ts-dict만). ⚠️ 이 픽스처가 실제로 내는 코드는 `write-slot-not-string-literal`이다 —
 * code-dict의 `write-slot-missing`은 같은 충돌이 그 앞에서 잡혀 실측 도달 경로가 없고, 분류 자체는 `undeliverable.test.ts`가 고정한다.
 */
it("code-dict 구조 충돌(문자열 자리에 중첩 키)은 보류가 아니다 — 미리보기 withoutKey 0 · 실행은 writer-warnings (같은 픽스처)", async () => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const EN = "export default { a: { b: 'B' } };\n";
  const KO = "export default { a: '가' };\n";
  const cols = { adapterName: "code-dict", pathTemplate: "{locale}.ts", nested: null };
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, ...cols, locales: [{ code: "en" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "ko", value: "비", stringKey: { key: "a.b" } }]);
  mocks.client.getTree.mockResolvedValue([{ path: "en.ts", sha: "en" }, { path: "ko.ts", sha: "ko" }]);
  mocks.client.getBlobText.mockImplementation(async (sha: string) => (sha === "en" ? EN : KO));
  const preview = await readPublishPreview(db as unknown as PrismaClient, "p", "acme").catch(() => null);
  const { client } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: [{ path: "en.ts", sha: "en" }, { path: "ko.ts", sha: "ko" }] }, blobs: { en: EN, ko: KO } });
  const result = await runPull({
    loadState: async () => ({
      project: { ...project, slug: "acme" },
      surfaces: [{ ...surface, ...cols, localeCodes: ["en", "ko"],
        keys: [{ id: "k", key: "a.b", sourceText: "B", orphaned: false, cells: { en: { value: "B" }, ko: { value: "비" } } }] }],
      maxUpdatedAt: new Date(), unpublished: 1, pendingEdits: [{ id: "t", token: "t", cell: { surfaceId: "s", keyId: "k", localeCode: "ko", restoreValue: "" } }],
    }),
    createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
  });
  expect(preview?.withoutKey ?? 0).toBe(0);
  expect(result).toMatchObject({ status: "skipped", reason: "writer-warnings" });
});
/**
 * **편집과 무관한 비리터럴은 미리보기도 막지 않는다** (coordinator review r1 · D4와 같은 판정). 실행은 wanted 키의 비리터럴만 경고하는데
 * 미리보기가 파일의 모든 읽기 오류로 throw하면 `{ hello: "hi", b: someFn }` 파일의 Publish가 화면에서 영영 열리지 않는다(감사 #4의 화면 쪽).
 */
it("ts-dict 파일의 무관한 비리터럴은 미리보기를 막지 않는다 · 편집 대상 키가 비리터럴이면 막는다 (짝)", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "ts-dict", pathTemplate: "*.ts", locales: [{ code: "en" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "ko" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "a.ts", sha: "a" }]);
  mocks.client.getBlobText.mockResolvedValue('const en = { hello: "hi", b: someFn };\nconst ko = { hello: "안녕" };');
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups[0]).toMatchObject({ path: "a.ts", rows: [{ before: "안녕", after: "new" }] });
  mocks.client.getBlobText.mockResolvedValue('const en = { hello: "hi" };\nconst ko = { hello: someFn };');
  await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toThrow();
});
it("#84 — 보류만 있으면 보낼 수 있는 편집·키가 0이다", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", locales: [{ code: "en" }, { code: "de" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "de", value: "neu" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "en.yml", sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue("en:\n  hello: old\n");
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result).toMatchObject({ total: 1, withoutFile: 1, sendable: { total: 0, keys: 0 } });
});
/**
 * B1 r3 — 미리보기의 "전부 base와 같다"와 실행의 no-changes가 같은 판정이다(같은 픽스처). 열린 PR이 있으면 실행이 그 PR을 닫는다.
 * ⚠️ 셀 단위 근사다 — 이 픽스처는 두 판정이 만나는 전형이고, 파일 표현만 다른 경우는 실행의 blob SHA가 정본이다.
 */
it("같은 픽스처에서 미리보기의 same == sendable이면 실행은 no-changes이고 열린 PR을 닫는다", async () => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const EN = "en:\n  hello: old\n";
  const cols = { adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", nested: null };
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, ...cols, locales: [{ code: "en" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], value: "old" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "en.yml", sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue(EN);
  const preview = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(preview.same).toBe(preview.sendable.total);
  const { blobSha } = await import("@/lib/githash");
  // 2층은 실제 blob SHA로 견준다 — 가짜 sha를 두면 늘 "바뀜"이 된다.
  const { client, calls } = createFakeGitClient({ refSha: { "heads/main": "head", "heads/malmoi-i18n/sync-acme": "stale" }, tree: { head: [{ path: "en.yml", sha: blobSha(EN) }] }, blobs: { [blobSha(EN)]: EN },
    openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "t", base: "main" } });
  const result = await runPull({
    loadState: async () => ({
      project: { ...project, slug: "acme" },
      surfaces: [{ ...surface, ...cols, localeCodes: ["en"], keys: [{ id: "k", key: "hello", sourceText: "old", orphaned: false, cells: { en: { value: "old" } } }] }],
      maxUpdatedAt: new Date(), unpublished: 1, pendingEdits: [{ id: "t", token: "t", cell: { surfaceId: "s", keyId: "k", localeCode: "en", restoreValue: "" } }],
    }),
    createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
  });
  expect(result).toMatchObject({ status: "skipped", reason: "no-changes", closedPr: { number: 9 } });
  expect(calls.map(c => c.method)).toContain("closePr");
});
/** 경고(`duplicate-property`)는 미리보기를 막지 않는다 (B7a r1) — 실행이 그 값을 싣고 고치므로 화면이 열려야 한다. 대조: yaml의 duplicate-key는 막는다. */
it("code-dict 중복 프로퍼티는 미리보기를 막지 않고 마지막 값을 이전 값으로 보인다 · yaml duplicate-key는 막는다 (짝)", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "code-dict", pathTemplate: "{locale}.ts" }] });
  mocks.client.getTree.mockResolvedValue([{ path: "en.ts", sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue("export default {\n  hello: 'first',\n  hello: 'old',\n}\n");
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups[0]?.rows[0]).toMatchObject({ before: "old", after: "new" });
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, adapterName: "yaml-catalog", pathTemplate: "{locale}.yml" }] });
  mocks.client.getTree.mockResolvedValue([{ path: "en.yml", sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue("hello: first\nhello: old\n");
  await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toThrow("Preview cannot read all values");
});
/**
 * **키 자리가 표면의 어느 파일에도 없으면 미리보기도 보류로 센다** (audit #1 B · launch-audit B3.1). 전에는 같은 파일의 다른 로케일이 그 키를
 * 가질 때만 `withoutKey`였고 나머지는 "Preview path unavailable"로 화면을 막았는데, 실행은 경고 없이 그 셀을 전달로 셌다 — 둘이 갈렸다.
 */
it("ts-dict 키가 모든 로케일 객체에서 사라지면 미리보기 withoutKey와 실행 withheld가 같다 (같은 픽스처)", async () => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const A = 'const en = { hello: "hi" };\nconst ko = { hello: "안녕" };\n';
  const cols = { adapterName: "ts-dict", pathTemplate: "*.ts", nested: null };
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, ...cols, locales: [{ code: "en" }, { code: "ko" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "ko" }, { ...rows[0], keyId: "k2", localeCode: "ko", value: "잘가", stringKey: { key: "gone" } }]);
  db.translation.count.mockResolvedValue(2);
  db.translation.groupBy.mockResolvedValue([{ keyId: "k" }, { keyId: "k2" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "a.ts", sha: "a" }]);
  mocks.client.getBlobText.mockResolvedValue(A);
  const preview = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  const { client } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: [{ path: "a.ts", sha: "a" }] }, blobs: { a: A } });
  const edit = (id: string, keyId: string) => ({ id, token: id, cell: { surfaceId: "s", keyId, localeCode: "ko", restoreValue: "" } });
  const result = await runPull({
    loadState: async () => ({
      project: { ...project, slug: "acme" },
      surfaces: [{ ...surface, ...cols, localeCodes: ["en", "ko"], keys: [
        { id: "k", key: "hello", sourceText: "hi", orphaned: false, cells: { en: { value: "hi" }, ko: { value: "new" } } },
        { id: "k2", key: "gone", sourceText: "bye", orphaned: false, cells: { en: { value: "bye" }, ko: { value: "잘가" } } },
      ] }],
      maxUpdatedAt: new Date(), unpublished: 2, pendingEdits: [edit("t1", "k"), edit("t2", "k2")],
    }),
    createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
  });
  expect(preview.groups.flatMap(g => g.rows.map(r => r.key))).toEqual(["hello"]);
  expect(preview).toMatchObject({ withoutFile: 0, withoutKey: 1, sendable: { total: 1, keys: 1 } });
  expect(result).toMatchObject({ status: "committed", delivered: preview.sendable.total, withheld: { file: 0, key: preview.withoutKey } });
});
/**
 * **보존되는 비관리 이웃은 미리보기를 막지 않는다** (audit #8 · launch-audit B3.3). writer는 YAML 숫자·불리언과 code-dict shorthand를 파일에
 * 그대로 두고 성공하는데, 미리보기는 `value-not-string-literal`만 면제해 이 파일들의 Publish가 화면에서 열리지 않았다. 판정은
 * `adapterErrorKind === "unmanaged"`이고, 편집 대상 키가 그 자리이면 여전히 막는다(writer도 그 셀을 못 싣는다).
 */
it.each([
  ["yaml 숫자·불리언", { adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", nested: null }, "en.yml", "en:\n  hello: old\n  precision: 3\n  strip: true\n", "en:\n  hello: old\n  precision: 3\n", "precision"],
  ["code-dict shorthand", { adapterName: "code-dict", pathTemplate: "{locale}.ts", nested: null }, "en.ts", "export default { x, hello: 'old' };\n", "export default { x, hello: 'old' };\n", "x"],
])("%s — 편집과 무관하면 미리보기가 열리고, 편집 키가 그 자리면 막는다 (짝)", async (_name, cols, path, source, pairSource, pairKey) => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, ...cols }] });
  mocks.client.getTree.mockResolvedValue([{ path, sha: "blob" }]);
  mocks.client.getBlobText.mockResolvedValue(source);
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups[0]).toMatchObject({ path, rows: [{ key: "hello", before: "old", after: "new" }] });
  // 실행(cron·Publish)도 같은 파일을 싣고 이웃을 그대로 둔다 — 미리보기가 약속한 것이 나간다.
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const { client, calls } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: [{ path, sha: "blob" }] }, blobs: { blob: source } });
  const pulled = await runPull({
    loadState: async () => ({
      project: { ...project, slug: "acme" },
      surfaces: [{ ...surface, ...cols, localeCodes: ["en"], keys: [{ id: "k", key: "hello", sourceText: "old", orphaned: false, cells: { en: { value: "new" } } }] }],
      maxUpdatedAt: new Date(), unpublished: 1, pendingEdits: [{ id: "t", token: "t", cell: { surfaceId: "s", keyId: "k", localeCode: "en", restoreValue: "" } }],
    }),
    createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
  });
  expect(pulled).toMatchObject({ status: "committed", delivered: 1 });
  const written = (calls.find(c => c.method === "createTree")?.args[0] as { tree: { content: string }[] }).tree[0]?.content;
  expect(written).toBe(source.replace("old", "new"));
  db.translation.findMany.mockResolvedValue([{ ...rows[0], stringKey: { key: pairKey } }]);
  mocks.client.getBlobText.mockResolvedValue(pairSource);
  await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toThrow();
});
/**
 * **코드가 base에서 지운 키의 base 편집은 미리보기도 보류로 센다** (launch-audit B3.4). pull 시점 base 파일의 키 집합은 원본이 정하므로 그 편집은
 * 파일에 닿지 않는다 — 실행이 보류하는 셀을 화면이 "나간다"고 약속하지 않는다. 비-base 편집은 그대로다.
 */
it.each([
  ["json-catalog", { adapterName: "json-catalog", pathTemplate: "{locale}.json", nested: false }, "en.json", '{\n  "hello": "old",\n  "added": "New"\n}\n', "fr.json", '{\n  "hello": "Salut"\n}\n'],
  ["yaml-catalog", { adapterName: "yaml-catalog", pathTemplate: "{locale}.yml", nested: null }, "en.yml", "en:\n  hello: old\n  added: New\n", "fr.yml", "fr:\n  hello: Salut\n"],
])("%s — base에서 지운 키의 base 편집: 미리보기 withoutKey와 실행 withheld가 같다 (같은 픽스처)", async (_n, cols, enPath, EN, frPath, FR) => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, ...cols, locales: [{ code: "en" }, { code: "fr" }] }] });
  db.translation.findMany.mockResolvedValue([
    { ...rows[0], keyId: "k2", localeCode: "en", value: "Gone!", stringKey: { key: "deleted" } },
    { ...rows[0], localeCode: "fr", value: "Bonjour" },
  ]);
  db.translation.count.mockResolvedValue(2);
  db.translation.groupBy.mockResolvedValue([{ keyId: "k" }, { keyId: "k2" }]);
  mocks.client.getTree.mockResolvedValue([{ path: enPath, sha: "en" }, { path: frPath, sha: "fr" }]);
  mocks.client.getBlobText.mockImplementation(async (sha: string) => (sha === "en" ? EN : FR));
  const preview = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  const { client } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: [{ path: enPath, sha: "en" }, { path: frPath, sha: "fr" }] }, blobs: { en: EN, fr: FR } });
  const edit = (id: string, keyId: string, localeCode: string) => ({ id, token: id, cell: { surfaceId: "s", keyId, localeCode, restoreValue: "" } });
  const result = await runPull({
    loadState: async () => ({
      project: { ...project, slug: "acme" },
      surfaces: [{ ...surface, ...cols, localeCodes: ["en", "fr"], keys: [
        { id: "k", key: "hello", sourceText: "old", orphaned: false, cells: { en: { value: "old" }, fr: { value: "Bonjour" } } },
        { id: "k2", key: "deleted", sourceText: "Gone", orphaned: false, cells: { en: { value: "Gone!" }, fr: { value: "" } } },
      ] }],
      maxUpdatedAt: new Date(), unpublished: 2, pendingEdits: [edit("t1", "k2", "en"), edit("t2", "k", "fr")],
    }),
    createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
  });
  expect(preview.groups.flatMap(g => g.rows.map(r => `${r.localeCode}:${r.key}`))).toEqual(["fr:hello"]);
  expect(preview).toMatchObject({ withoutFile: 0, withoutKey: 1, sendable: { total: 1, keys: 1 } });
  expect(result).toMatchObject({ status: "committed", delivered: preview.sendable.total, withheld: { file: 0, key: preview.withoutKey } });
});
/**
 * **per-locale 재생성 표면은 비-base 편집만 있어도 base 파일을 읽는다** (B3 r3 Y4). 실행은 base 원본으로 base 키 집합을 정하므로(B3.4) 원본 base를
 * 못 읽으면 `write-parse-failed`로 막는다 — 미리보기가 base 행이 없다고 그 파일을 안 읽으면 N건을 약속하고 실행이 거부한다.
 */
it("재생성 per-locale: 읽을 수 없는 base 원본 + 비-base 편집만 → 미리보기는 이유 있는 거부, 실행은 writer-warnings (같은 픽스처)", async () => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const { PreviewBaseFileUnreadable } = await import("../preview");
  const EN = "{ not json";
  const FR = '{\n  "hello": "Salut"\n}\n';
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, locales: [{ code: "en" }, { code: "fr" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "fr", value: "Bonjour" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "en.json", sha: "en" }, { path: "fr.json", sha: "fr" }]);
  mocks.client.getBlobText.mockImplementation(async (sha: string) => (sha === "en" ? EN : FR));
  const refused = await readPublishPreview(db as unknown as PrismaClient, "p", "acme").catch((e: unknown) => e);
  expect(refused).toBeInstanceOf(PreviewBaseFileUnreadable);
  expect(refused).toMatchObject({ path: "en.json", branch: "main" });
  const { client } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: [{ path: "en.json", sha: "en" }, { path: "fr.json", sha: "fr" }] }, blobs: { en: EN, fr: FR } });
  const result = await runPull({
    loadState: async () => ({
      project: { ...project, slug: "acme" },
      surfaces: [{ ...surface, localeCodes: ["en", "fr"], keys: [{ id: "k", key: "hello", sourceText: "Hi", orphaned: false, cells: { en: { value: "Hi" }, fr: { value: "Bonjour" } } }] }],
      maxUpdatedAt: new Date(), unpublished: 1, pendingEdits: [{ id: "t", token: "t", cell: { surfaceId: "s", keyId: "k", localeCode: "fr", restoreValue: "" } }],
    }),
    createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
  });
  expect(result).toMatchObject({ status: "skipped", reason: "writer-warnings" });
});
it("재생성 per-locale: 읽을 수 있는 base(숫자 값 포함) + 비-base 편집만 → 미리보기가 열린다 (짝 — base 행이 없으면 읽기 오류로 막지 않는다)", async () => {
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, locales: [{ code: "en" }, { code: "fr" }] }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "fr", value: "Bonjour" }]);
  mocks.client.getTree.mockResolvedValue([{ path: "en.json", sha: "en" }, { path: "fr.json", sha: "fr" }]);
  mocks.client.getBlobText.mockImplementation(async (sha: string) => (sha === "en" ? '{"hello":"Hi","n":3}' : '{"hello":"Salut"}'));
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.groups.flatMap(g => g.rows.map(r => `${r.localeCode}:${r.before}`))).toEqual(["fr:Salut"]);
});
/**
 * **미리보기의 파일 목록은 실행이 바꾸는 파일이다** (#128). 편집 셀만 세면 토큰 없이 바뀌는 파일 — 지난 적재가 orphan한 키가 비-base 파일에서 빠지는
 * 경우, 닫힌 PR에 실렸던 DB 값이 다시 나가는 경우 — 가 화면에서 빠지고 결과에서야 "3 files changed"가 나온다. 같은 렌더·blob 비교(`renderProject`)를 쓴다.
 */
it("#128 — 편집 없는 파일이 바뀌면 미리보기의 바뀌는 파일 목록이 실행의 changed와 같다 (같은 픽스처)", async () => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const { blobSha } = await import("@/lib/githash");
  const files: Record<string, string> = {
    "en.json": '{\n  "hello": "Hi"\n}\n',
    "fr.json": '{\n  "hello": "Salut"\n}\n',
    // 지난 적재가 `gone`을 orphan했다(en에서 지워졌다) — ja 파일엔 남아 있고, 재생성이 그 줄을 뺀다.
    "ja.json": '{\n  "gone": "消えた",\n  "hello": "こんにちは"\n}\n',
  };
  const tree = Object.entries(files).map(([path, content]) => ({ path, sha: blobSha(content) }));
  const blobs = Object.fromEntries(Object.values(files).map(c => [blobSha(c), c]));
  const cols = { adapterName: "json-catalog", pathTemplate: "{locale}.json", nested: false, nestedByPath: {} };
  const locales = ["en", "fr", "ja"];
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [{ ...surface, ...cols, locales: locales.map(code => ({ code })) }] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "fr", value: "Bonjour" }]);
  mocks.client.getTree.mockResolvedValue(tree);
  mocks.client.getBlobText.mockImplementation(async (sha: string) => blobs[sha]);
  const state = {
    project: { ...project, slug: "acme" },
    surfaces: [{ ...surface, ...cols, localeCodes: locales, keys: [
      { id: "k", key: "hello", sourceText: "Hi", orphaned: false, cells: { en: { value: "Hi" }, fr: { value: "Bonjour" }, ja: { value: "こんにちは" } } },
      { id: "g", key: "gone", sourceText: "Gone", orphaned: true, cells: { ja: { value: "消えた" } } },
    ] }],
    maxUpdatedAt: new Date(), unpublished: 1, pendingEdits: [{ id: "t", token: "t", cell: { surfaceId: "s", keyId: "k", localeCode: "fr", restoreValue: "" } }],
  };
  mocks.load.mockResolvedValue(state);
  const preview = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  const { client } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: tree }, blobs });
  const result = await runPull({ loadState: async () => state, createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme" });
  expect(result).toMatchObject({ status: "committed", changed: ["fr.json", "ja.json"] });
  expect(preview.changedFiles).toEqual(result.status === "committed" ? result.changed : []);
  expect(preview.groups.map(g => g.path)).toEqual(["fr.json"]);
  expect(mocks.snapshot).toHaveBeenCalledWith(db, "acme", 200);
  // #128 r5 — 한 번 열 때 ref 1 · 트리 1 · 파일당 blob 1이다(실행 한 번과 같은 GitHub 비용). 렌더가 ref·트리를 다시 읽으면 셀과 파일 목록이
  // 서로 다른 head를 볼 수 있다.
  expect(mocks.client.getRefSha).toHaveBeenCalledTimes(1);
  expect(mocks.client.getTree).toHaveBeenCalledTimes(1);
  expect(mocks.client.getBlobText).toHaveBeenCalledTimes(3);
});
/**
 * #128 r5 — 편집이 없는 표면도 실행은 렌더한다. 그 표면의 base 파일을 못 읽거나(재생성) 없으면(수술적) 실행은 `writer-warnings`로 거부하므로 미리보기도
 * 같은 이유 있는 거부다 — 일반 실패(Retry)는 다시 눌러도 같다.
 */
it.each([
  ["재생성 base 읽기 불가", { adapterName: "json-catalog", pathTemplate: "app/{locale}.json", nested: false }, { "app/en.json": "{ not json", "app/fr.json": '{\n  "a": "A"\n}\n' }, "PreviewBaseFileUnreadable", "app/en.json"],
  ["수술적 base 부재", { adapterName: "yaml-catalog", pathTemplate: "app/{locale}.yml", nested: null }, { "app/fr.yml": "fr:\n  a: A\n" }, "PreviewBaseFileMissing", "app/en.yml"],
])("#128 r5 — 편집 없는 표면의 %s: 미리보기는 전용 거부, 실행은 writer-warnings (같은 픽스처)", async (_n, appCols, appFiles, errorName, path) => {
  const { runPull } = await import("@/lib/pull/run");
  const { createFakeGitClient } = await import("@/lib/pull/__tests__/fake-client");
  const { blobSha } = await import("@/lib/githash");
  const files: Record<string, string> = { "en.json": '{\n  "hello": "Hi"\n}\n', "fr.json": '{\n  "hello": "Salut"\n}\n', ...appFiles };
  const tree = Object.entries(files).map(([p, content]) => ({ path: p, sha: blobSha(content) }));
  const blobs = Object.fromEntries(Object.values(files).map(c => [blobSha(c), c]));
  const web = { ...surface, nestedByPath: {}, locales: [{ code: "en" }, { code: "fr" }] };
  const app = { ...surface, id: "s2", slug: "app", nestedByPath: {}, ...appCols, locales: [{ code: "en" }, { code: "fr" }] };
  db.project.findUniqueOrThrow.mockResolvedValue({ ...project, surfaces: [web, app] });
  db.translation.findMany.mockResolvedValue([{ ...rows[0], localeCode: "fr", value: "Bonjour" }]);
  mocks.client.getTree.mockResolvedValue(tree);
  mocks.client.getBlobText.mockImplementation(async (sha: string) => blobs[sha]);
  const key = (id: string, k: string) => ({ id, key: k, sourceText: "Hi", orphaned: false, cells: { en: { value: "Hi" }, fr: { value: "Bonjour" } } });
  const state = {
    project: { ...project, slug: "acme" },
    surfaces: [{ ...web, localeCodes: ["en", "fr"], keys: [key("k", "hello")] }, { ...app, localeCodes: ["en", "fr"], keys: [key("a", "a")] }],
    maxUpdatedAt: new Date(), unpublished: 1, pendingEdits: [{ id: "t", token: "t", cell: { surfaceId: "s", keyId: "k", localeCode: "fr", restoreValue: "" } }],
  };
  mocks.load.mockResolvedValue(state);
  const refused = await readPublishPreview(db as unknown as PrismaClient, "p", "acme").catch((e: unknown) => e);
  expect(refused).toMatchObject({ name: errorName, path, branch: "main" });
  const { client } = createFakeGitClient({ refSha: { "heads/main": "head" }, tree: { head: tree }, blobs });
  const result = await runPull({ loadState: async () => state, createClient: async () => client, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-acme" });
  expect(result).toMatchObject({ status: "skipped", reason: "writer-warnings" });
});
/**
 * **미리보기가 Publish 지문을 낸다** (mcp-connector T6.5 · design §3.1). 입력은 이미 부르는 `loadPullState` 전체 + 이미 읽은 base head다 —
 * 표시 행(200행)과 무관하다. `publish`가 실행권 뒤 같은 입력으로 재계산해 대조한다.
 */
it("fingerprint는 표시에 쓴 바로 그 스냅샷과 읽은 base head의 publishFingerprint다", async () => {
  mocks.load.mockResolvedValue({ project: { ...project, slug: "acme" }, surfaces: [], maxUpdatedAt: null, unpublished: 1, pendingEdits: [{ id: "t", token: "tok" }] });
  const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(result.fingerprint).toBe(publishFingerprint(snapshotOf(), "head"));
  expect(mocks.snapshot).toHaveBeenCalledTimes(1);
  // 같은 스냅샷이라도 head가 다르면 다른 지문이다 — 미리보기가 head를 입력으로 싣는다는 짝.
  mocks.client.getRefSha.mockResolvedValue("head2");
  const again = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
  expect(again.fingerprint).toBe(publishFingerprint(snapshotOf(), "head2"));
  expect(again.fingerprint).not.toBe(result.fingerprint);
});

it("스냅샷이 인가된 프로젝트와 다른 프로젝트를 가리키면 보여 주지 않는다", async () => {
  await expect(readPublishPreview(db as unknown as PrismaClient, "other-project", "acme")).rejects.toThrow("Project changed");
});
