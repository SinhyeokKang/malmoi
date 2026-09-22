import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadSources, loadSource } from "../query";
const surface = { id: "s", slug: "web", adapterName: "json-catalog", pathTemplate: "{locale}.json", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "sha", lastCommitAt: null, lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportToken: "secret", nestedByPath: { private: true } };
const project = { repoOwner: "owner", repoName: "repo", baseBranch: "main", installationId: "private", surfaces: [surface] };
const mocks = { project: { findFirst: vi.fn() }, translationSurface: { findFirst: vi.fn() }, locale: { findMany: vi.fn() }, translation: { findMany: vi.fn(), groupBy: vi.fn() }, stringKey: { count: vi.fn() }, $queryRaw: vi.fn() };
const db = mocks as unknown as PrismaClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.findFirst.mockResolvedValue(project);
  mocks.translationSurface.findFirst.mockResolvedValue(surface);
  mocks.locale.findMany.mockResolvedValue([{ surfaceId: "s", code: "en", isBase: true, orphaned: false }, { surfaceId: "s", code: "ja", isBase: false, orphaned: true }]);
  mocks.translation.groupBy.mockResolvedValue([{ surfaceId: "s", needsReview: false, _count: { _all: 2 } }]);
  mocks.translation.findMany.mockResolvedValue([{ localeCode: "en", needsReview: false }]);
  mocks.stringKey.count.mockResolvedValue(3);
  mocks.$queryRaw.mockResolvedValue([{ surfaceId: "s", keys: 3, locales: 1 }]);
});
it.each([1, 5])("소스 %i개에서도 목록 호출 수가 같고 셀을 읽지 않는다", async size => {
  mocks.project.findFirst.mockResolvedValue({ ...project, surfaces: Array.from({ length: size }, (_, i) => ({ ...surface, id: `s${i}` })) });
  await loadSources(db, "p", "OWNER");
  expect(mocks.project.findFirst).toHaveBeenCalledTimes(1);
  expect(mocks.locale.findMany).toHaveBeenCalledTimes(1);
  expect(mocks.translation.groupBy).toHaveBeenCalledTimes(1);
  expect(mocks.$queryRaw).toHaveBeenCalledTimes(1);
  expect(mocks.translation.findMany).not.toHaveBeenCalled();
  expect(mocks.project.findFirst.mock.calls[0]?.[0].where).toEqual({ id: "p", archivedAt: null });
});
it("EDITOR에게 연결계와 비밀·번역 원문을 전달하지 않는다", async () => {
  const result = await loadSources(db, "p", "EDITOR");
  expect(result?.sources[0]).toMatchObject({ slug: "web", keys: 3, locales: 1, orphanedLocales: 1 });
  const json = JSON.stringify(result);
  for (const key of ["pathTemplate", "adapterName", "repoOwner", "repoName", "baseBranch", "installationId", "lastImportToken", "nestedByPath"]) expect(json).not.toContain(key);
  const detail = await loadSource(db, "p", "s", "EDITOR");
  for (const key of ["pathTemplate", "adapterName", "repoOwner", "lastImportToken", "nestedByPath"]) expect(JSON.stringify(detail)).not.toContain(key);
});
it("상세는 인가한 프로젝트·표면만 읽고 고아 언어는 남긴다", async () => {
  const detail = await loadSource(db, "p", "s", "OWNER");
  expect(mocks.translationSurface.findFirst.mock.calls[0]?.[0].where).toEqual({ projectId: "p", id: "s", archivedAt: null });
  expect(mocks.locale.findMany.mock.calls[0]?.[0].where).toEqual({ projectId: "p", surfaceId: "s", surface: { archivedAt: null } });
  expect(detail?.languages.some(row => row.code === "ja" && row.orphaned)).toBe(true);
  expect(mocks.translation.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { projectId: "p", surfaceId: "s", stringKey: { orphaned: false } }, select: { localeCode: true, needsReview: true } });
});
it("타 프로젝트·보관 소스는 상세가 없고 조회 실패는 빈 목록이 아니다", async () => {
  mocks.translationSurface.findFirst.mockResolvedValue(null);
  expect(await loadSource(db, "p", "foreign", "OWNER")).toBeNull();
  expect(mocks.translation.findMany).not.toHaveBeenCalled();
  mocks.project.findFirst.mockRejectedValue(new Error("database"));
  await expect(loadSources(db, "p", "OWNER")).rejects.toThrow("database");
});
