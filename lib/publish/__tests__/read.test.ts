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
