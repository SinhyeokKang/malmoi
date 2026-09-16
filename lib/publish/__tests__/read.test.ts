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
const db = { project: { findUniqueOrThrow: vi.fn() }, translation: { findMany: vi.fn(), count: vi.fn() } };
beforeEach(() => { vi.clearAllMocks(); db.project.findUniqueOrThrow.mockResolvedValue(project); db.translation.findMany.mockResolvedValue(rows); db.translation.count.mockResolvedValue(1); mocks.client.getRefSha.mockResolvedValue("head"); mocks.client.getTree.mockResolvedValue([{ path: "en.json", sha: "blob" }]); mocks.client.getBlobText.mockResolvedValue('{"hello":"old"}'); mocks.open.mockResolvedValue("https://github.com/o/r/pull/12"); });
it("쓰기 메서드 없는 클라이언트로 base 이전 값과 DB 값을 함께 읽는다", async () => {
 const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme");
 expect(result.groups[0]?.rows[0]).toMatchObject({ before: "old", after: "new" });
 expect(result.openPr?.number).toBe(12);
 expect(db.project.findUniqueOrThrow.mock.calls[0]?.[0].where).toEqual({ id: "p" });
 expect(db.translation.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { projectId: "p", surface: { archivedAt: null }, updatedBy: { not: null } }, take: 200 });
 expect(mocks.client.getRefSha).toHaveBeenCalledWith("heads/main");
});
it("base 파싱 실패를 빈 이전 값으로 접지 않는다", async () => { mocks.client.getBlobText.mockResolvedValue("invalid"); await expect(readPublishPreview(db as unknown as PrismaClient, "p", "acme")).rejects.toThrow(); });
it("상한 초과와 열린 PR 미확인을 보존한다", async () => { db.translation.count.mockResolvedValue(903); mocks.open.mockResolvedValue(undefined); const result = await readPublishPreview(db as unknown as PrismaClient, "p", "acme"); expect(result.truncated).toBe(902); expect(result.openPr).toBeUndefined(); });
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
