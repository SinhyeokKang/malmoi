import { en } from "@/messages/en";
import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadSources, loadSource } from "../query";
import { loadLocaleCounts } from "@/lib/keys/query";
const surface = { id: "s", slug: "web", adapterName: "json-catalog", pathTemplate: "{locale}.json", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "sha", lastCommitAt: null, lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportToken: "secret", nestedByPath: { private: true } };
const project = { repoOwner: "owner", repoName: "repo", baseBranch: "main", installationId: "private", surfaces: [surface] };
const mocks = { project: { findFirst: vi.fn() }, translationSurface: { findFirst: vi.fn() }, locale: { findMany: vi.fn() }, translation: { findMany: vi.fn(), groupBy: vi.fn() }, stringKey: { count: vi.fn() }, $queryRaw: vi.fn(),
  localeChange: { findMany: vi.fn() }, deliveryConfirmation: { findMany: vi.fn(), findUnique: vi.fn() } };
const db = mocks as unknown as PrismaClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.findFirst.mockResolvedValue(project);
  mocks.translationSurface.findFirst.mockResolvedValue(surface);
  mocks.locale.findMany.mockResolvedValue([{ surfaceId: "s", code: "en", isBase: true, orphaned: false, change: null }, { surfaceId: "s", code: "ja", isBase: false, orphaned: true, change: null }]);
  mocks.translation.groupBy.mockResolvedValue([{ surfaceId: "s", localeCode: "en", needsReview: false, _count: { _all: 2 } }]);
  mocks.stringKey.count.mockResolvedValue(3);
  mocks.$queryRaw.mockResolvedValue([{ surfaceId: "s", keys: 3, locales: 1 }]);
  mocks.localeChange.findMany.mockResolvedValue([]);
  mocks.deliveryConfirmation.findMany.mockResolvedValue([]);
  mocks.deliveryConfirmation.findUnique.mockResolvedValue(null);
});
it.each([1, 5])("소스 %i개에서도 목록 호출 수가 같고 셀을 읽지 않는다", async size => {
  mocks.project.findFirst.mockResolvedValue({ ...project, surfaces: Array.from({ length: size }, (_, i) => ({ ...surface, id: `s${i}` })) });
  await loadSources(db, en, "p", "OWNER");
  expect(mocks.project.findFirst).toHaveBeenCalledTimes(1);
  expect(mocks.locale.findMany).toHaveBeenCalledTimes(1);
  expect(mocks.translation.groupBy).toHaveBeenCalledTimes(1);
  expect(mocks.$queryRaw).toHaveBeenCalledTimes(1);
  expect(mocks.translation.findMany).not.toHaveBeenCalled();
  expect(mocks.project.findFirst.mock.calls[0]?.[0].where).toEqual({ id: "p", archivedAt: null });
});
it("EDITOR에게 연결계와 비밀·번역 원문을 전달하지 않는다", async () => {
  const result = await loadSources(db, en, "p", "EDITOR");
  expect(result?.sources[0]).toMatchObject({ slug: "web", keys: 3, locales: 1, orphanedLocales: 1 });
  const json = JSON.stringify(result);
  for (const key of ["pathTemplate", "adapterName", "repoOwner", "repoName", "baseBranch", "installationId", "lastImportToken", "nestedByPath"]) expect(json).not.toContain(key);
  const detail = await loadSource(db, en, "p", "s", "EDITOR");
  for (const key of ["pathTemplate", "adapterName", "repoOwner", "lastImportToken", "nestedByPath"]) expect(JSON.stringify(detail)).not.toContain(key);
});
it("상세는 인가한 프로젝트·표면만 읽고 고아 언어는 남긴다", async () => {
  const detail = await loadSource(db, en, "p", "s", "OWNER");
  expect(mocks.translationSurface.findFirst.mock.calls[0]?.[0].where).toEqual({ projectId: "p", id: "s", archivedAt: null });
  expect(mocks.locale.findMany.mock.calls[0]?.[0].where).toEqual({ projectId: "p", surfaceId: "s", surface: { archivedAt: null } });
  expect(detail?.languages.some(row => row.code === "ja" && row.orphaned)).toBe(true);
  expect(mocks.translation.groupBy).toHaveBeenCalledWith({ by: ["localeCode", "needsReview"], where: { projectId: "p", surfaceId: "s", surface: { archivedAt: null }, value: { not: "" }, stringKey: { orphaned: false } }, _count: { _all: true } });
  expect(detail?.languages[0]).toMatchObject({ translated: 2, needsReview: 0, percent: 66 });
});
it("타 프로젝트·보관 소스는 상세가 없고 조회 실패는 빈 목록이 아니다", async () => {
  mocks.translationSurface.findFirst.mockResolvedValue(null);
  expect(await loadSource(db, en, "p", "foreign", "OWNER")).toBeNull();
  expect(mocks.translation.findMany).not.toHaveBeenCalled();
  mocks.project.findFirst.mockRejectedValue(new Error("database"));
  await expect(loadSources(db, en, "p", "OWNER")).rejects.toThrow("database");
});
/**
 * 언어 행의 PR 링크(locale-add 2차 런 E0 — 시안 L "PR 표시는 링크만"). **저장된 마지막 Publish 주소**만 싣는다 — 화면에 들어올 때 호스트를 부르지
 * 않으므로 조회 실패 상태가 없다. 번역 화면(`lastPrUrl`)처럼 역할과 무관하게 싣는다. 번호 추출은 화면 몫이다.
 */
it.each(["OWNER", "EDITOR"] as const)("상세는 저장된 PR 주소를 %s에게 그대로 싣고, 없으면 null이다", async role => {
  mocks.project.findFirst.mockResolvedValue({ ...project, repoHost: "github", lastPrUrl: "https://github.com/owner/repo/pull/128" });
  expect((await loadSource(db, en, "p", "s", role))?.pullRequestUrl).toBe("https://github.com/owner/repo/pull/128");
  expect(mocks.project.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: "p", archivedAt: null }, select: { lastPrUrl: true } });
  mocks.project.findFirst.mockResolvedValue({ ...project, repoHost: "github", lastPrUrl: null });
  expect((await loadSource(db, en, "p", "s", role))?.pullRequestUrl).toBeNull();
});

it("상세 재료는 두 조회를 병렬로 시작하고 집계 개수만 옮긴다", async () => {
  let resolveCount!: (value: number) => void;
  mocks.stringKey.count.mockImplementationOnce(() => new Promise<number>(resolve => { resolveCount = resolve; }));
  const pending = loadLocaleCounts(db, "p", "s");
  expect(mocks.stringKey.count).toHaveBeenCalledTimes(1);
  expect(mocks.translation.groupBy).toHaveBeenCalledTimes(1);
  expect(mocks.translation.findMany).not.toHaveBeenCalled();
  resolveCount(3);
  expect(await pending).toEqual({ total: 3, cells: [{ localeCode: "en", needsReview: false, count: 2 }] });
});

it("목록은 첫 조회가 끝나기 전에 네 조회를 모두 시작한다", async () => {
  let resolveProject!: (value: typeof project) => void;
  mocks.project.findFirst.mockImplementationOnce(() => new Promise<typeof project>(resolve => { resolveProject = resolve; }));
  const pending = loadSources(db, en, "p", "OWNER");
  expect(mocks.project.findFirst).toHaveBeenCalledTimes(1);
  expect(mocks.locale.findMany).toHaveBeenCalledTimes(1);
  expect(mocks.translation.groupBy).toHaveBeenCalledTimes(1);
  expect(mocks.$queryRaw).toHaveBeenCalledTimes(1);
  resolveProject(project);
  await pending;
  expect(mocks.translation.groupBy).toHaveBeenCalledWith({
    by: ["surfaceId", "localeCode", "needsReview"],
    where: { projectId: "p", surface: { archivedAt: null }, stringKey: { orphaned: false }, value: { not: "" } },
    _count: { _all: true },
  });
  expect(mocks.locale.findMany.mock.calls[0]?.[0].select).toMatchObject({ isBase: true, change: { select: { operation: true } } });
});

it("행 막대와 기존 합계는 작업 언어만 세고 검토 분자는 막대에만 더한다", async () => {
  mocks.locale.findMany.mockResolvedValue([
    { surfaceId: "s", code: "fr", isBase: false, orphaned: false, change: { operation: "REMOVE" } },
    { surfaceId: "s", code: "ja", isBase: false, orphaned: true, change: null },
    { surfaceId: "s", code: "de", isBase: false, orphaned: false, change: { operation: "ADD" } },
    { surfaceId: "s", code: "ko", isBase: true, orphaned: false, change: null },
    { surfaceId: "other", code: "en", isBase: true, orphaned: false, change: null },
  ]);
  mocks.$queryRaw.mockResolvedValue([{ surfaceId: "s", keys: 4, locales: 2 }]);
  mocks.translation.groupBy.mockResolvedValue([
    { surfaceId: "s", localeCode: "ko", needsReview: false, _count: { _all: 2 } },
    { surfaceId: "s", localeCode: "ko", needsReview: true, _count: { _all: 1 } },
    { surfaceId: "s", localeCode: "de", needsReview: false, _count: { _all: 1 } },
    { surfaceId: "s", localeCode: "fr", needsReview: false, _count: { _all: 4 } },
    { surfaceId: "s", localeCode: "ja", needsReview: true, _count: { _all: 4 } },
    { surfaceId: "other", localeCode: "en", needsReview: false, _count: { _all: 99 } },
  ]);
  const result = await loadSources(db, en, "p", "OWNER");
  expect(result?.sources[0]).toMatchObject({
    keys: 4, locales: 2, orphanedLocales: 1,
    progress: { total: 8, done: 3, review: 1, percent: 37 },
    meters: { shown: [
      { code: "ko", total: 4, done: 2, review: 1, percent: 75 },
      { code: "de", total: 4, done: 1, review: 0, percent: 25 },
    ], hidden: 0 },
  });
});

for (const role of ["OWNER", "EDITOR"] as const) {
  it.each([
    ["json-catalog", true], ["chrome-locales", true], ["yaml-catalog", true], ["code-dict", true], ["ts-dict", false], [null, false],
  ])(`상세는 ${role}에게 %s 언어 변경 지원을 서버에서 싣는다`, async (adapterName, supported) => {
    mocks.translationSurface.findFirst.mockResolvedValue({ ...surface, adapterName });
    const detail = await loadSource(db, en, "p", "s", role);
    expect(detail?.languageChangesSupported).toBe(supported);
    if (role === "EDITOR") {
      expect(detail).not.toHaveProperty("connection");
      expect(detail).not.toHaveProperty("repository");
    }
    const list = await loadSources(db, en, "p", role);
    expect(list?.sources[0]).not.toHaveProperty("languageChangesSupported");
  });
}
