import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ client: { getRefSha: vi.fn(), getTree: vi.fn(), getBlobText: vi.fn() }, open: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/github", () => ({ createGitClient: async () => mocks.client }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: mocks.open }));
vi.mock("@/lib/keys/query", () => ({ loadActors: async () => new Map() }));
import { readPublishPreview } from "../read";
const surface = { id: "s", slug: "web", adapterName: "json-catalog", pathTemplate: "{locale}.json", baseLocale: "en", nested: false, nestedByPath: {}, locales: [{ code: "en" }] };
const project = { id: "p", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", repositoryId: "2", lastPulledAt: null, archivedAt: null, surfaces: [surface] };
const rows = [{ surfaceId: "s", keyId: "k", localeCode: "en", value: "new", updatedBy: "editor", updatedAt: new Date(), stringKey: { key: "hello" } }];
const db = { project: { findUniqueOrThrow: vi.fn() }, translation: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() } };
beforeEach(() => { vi.clearAllMocks(); db.project.findUniqueOrThrow.mockResolvedValue(project); db.translation.findMany.mockResolvedValue(rows); db.translation.count.mockResolvedValue(1); db.translation.groupBy.mockResolvedValue([{ keyId: "k" }]); mocks.client.getRefSha.mockResolvedValue("head"); mocks.client.getTree.mockResolvedValue([{ path: "en.json", sha: "blob" }]); mocks.client.getBlobText.mockResolvedValue('{"hello":"old"}'); mocks.open.mockResolvedValue("https://github.com/o/r/pull/12"); });
it("쓰기 메서드 없는 클라이언트로 base 이전 값과 DB 값을 함께 읽는다", async () => {
 const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
 expect(result.groups[0]?.rows[0]).toMatchObject({ before: "old", after: "new" });
 expect(result.openPr?.number).toBe(12);
 expect(db.project.findUniqueOrThrow.mock.calls[0]?.[0].where).toEqual({ id: "p" });
 expect(db.translation.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { projectId: "p", surface: { archivedAt: null }, pendingEditToken: { not: null } }, take: 200 });
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
    createClient: async () => client, saveLastPulledAt: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
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
    createClient: async () => client, saveLastPulledAt: async () => {}, syncBranch: "malmoi-i18n/sync-acme",
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
