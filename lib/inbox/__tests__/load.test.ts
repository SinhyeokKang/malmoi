import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadAttentionInbox } from "../load";
import { planInbox } from "../plan";
const mocks = vi.hoisted(() => ({ actors: vi.fn() }));
vi.mock("@/lib/keys/query", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/keys/query")>(), loadActors: mocks.actors }));
const at = new Date("2026-10-01T00:00:00Z");
const locale = { code: "ko", name: "Korean", orphaned: false, createdAt: at };
function member(id: string, overrides = {}) {
  return { role: "OWNER", user: { attentionSeenAt: null }, project: {
    id, slug: id, name: id, image: null, installationId: "1", repositoryId: "1", archivedAt: null, createdAt: at,
    surfaces: [{ id: `s-${id}`, slug: "web", archivedAt: null, lastCommitSha: "a", lastImportError: null, lastImportFailedAt: null, lastImportStartedAt: null, locales: [locale] }],
    ...overrides,
  } };
}
function database(rows = [member("p1")]) {
  const db = { projectMember: { findMany: vi.fn().mockResolvedValue(rows) },
    locale: { findMany: vi.fn().mockResolvedValue([]) }, stringKey: { groupBy: vi.fn().mockResolvedValue([]) },
    translation: { groupBy: vi.fn().mockResolvedValue([]) }, $queryRaw: vi.fn().mockResolvedValue([]) };
  return { db, prisma: db as unknown as PrismaClient };
}
beforeEach(() => { vi.clearAllMocks(); mocks.actors.mockResolvedValue(new Map()); });
it.each([1, 40])("프로젝트 %i개에서도 같은 조회 수와 인가된 id 집합만 쓴다", async n => {
  const rows = Array.from({ length: n }, (_, i) => member(`p${i}`));
  const ids = rows.map(r => r.project.id);
  const { db, prisma } = database(rows);
  await loadAttentionInbox(prisma, "user");
  expect(db.projectMember.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { userId: "user", project: { archivedAt: null } }, select: expect.objectContaining({ user: { select: { attentionSeenAt: true } } }) }));
  for (const fn of [db.locale.findMany, db.stringKey.groupBy, db.translation.groupBy]) {
    expect(fn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ids } }) }));
  }
  expect(db.$queryRaw).toHaveBeenCalledTimes(3);
  for (const call of db.$queryRaw.mock.calls) expect(call).toContainEqual(ids);
  expect(mocks.actors).toHaveBeenCalledTimes(1);
});
it("멤버십 0이면 빈 plan이고 집계는 0회다 — 보관 필터는 SQL에 있다", async () => {
  const { db, prisma } = database([]);
  expect(await loadAttentionInbox(prisma, "user")).toEqual({ groups: [], unread: 0 });
  expect(db.$queryRaw).not.toHaveBeenCalled();
  expect(db.locale.findMany).not.toHaveBeenCalled();
  expect(db.stringKey.groupBy).not.toHaveBeenCalled();
  expect(db.translation.groupBy).not.toHaveBeenCalled();
  expect(mocks.actors).not.toHaveBeenCalled();
});
it("표면 실패를 평탄화하지 않고 설정·첫 적재 대기를 같은 판정으로 조립한다", async () => {
  const base = member("p").project.surfaces[0]!;
  const { prisma } = database([
    member("p", { surfaces: [{ ...base, lastImportError: "parse-failed", lastImportFailedAt: at }, { ...base, id: "s2", slug: "mail", lastImportError: "parse-failed", lastImportStartedAt: at }] }),
    member("setup", { installationId: null, surfaces: [] }),
    member("awaiting", { surfaces: [{ ...base, lastCommitSha: null }] }),
  ]);
  const plan = await loadAttentionInbox(prisma, "user");
  expect(plan.groups.map(g => g.project.slug)).toEqual(["p", "setup"]);
  expect(plan.groups[0]?.items).toMatchObject([{ kind: "import_failed", surfaceSlug: "web" }]);
  expect(plan.groups[1]?.items).toMatchObject([{ kind: "setup" }]);
});
it("같은 사람의 두 검토 행을 마스킹하고 내부 id를 직렬화하지 않는다", async () => {
  const { db, prisma } = database();
  db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
    { projectId: "p1", surfaceId: "s-p1", localeCode: "ko", n: 1, at, updatedBy: "u1" },
    { projectId: "p1", surfaceId: "s-p1", localeCode: "en", n: 2, at, updatedBy: "u1" },
  ]);
  mocks.actors.mockResolvedValue(new Map([["u1", { id: "u1", name: null, email: "person@example.com" }]]));
  const plan = await loadAttentionInbox(prisma, "user");
  expect(mocks.actors).toHaveBeenCalledWith(prisma, ["u1"]);
  expect(plan.groups[0]?.items).toHaveLength(2);
  expect(plan.unread).toBe(0);
  expect(JSON.stringify(plan)).not.toContain("person@example.com");
  expect(JSON.stringify(plan)).not.toContain("projectId");
  expect(plan.groups[0]?.items.every(i => i.kind === "review" && i.who?.includes("*"))).toBe(true);
});
it("미전달·빈 로케일과 워터마크가 실제 plan으로 이어진다", async () => {
  const row = member("p1");
  const { db, prisma } = database([row]);
  db.stringKey.groupBy.mockResolvedValue([{ projectId: "p1", surfaceId: "s-p1", _count: { _all: 2 } }]);
  db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ projectId: "p1", surfaceId: "s-p1", surfaceSlug: "web", n: 1, at }]).mockResolvedValueOnce([]);
  expect(await loadAttentionInbox(prisma, "user")).toEqual(planInbox({ projects: [{ slug: "p1", name: "p1", image: null, role: "OWNER", status: "active", createdAt: at,
    attention: [{ kind: "never_filled", at, surfaceSlug: "web", code: "ko", name: "Korean", keys: 2 }], unsent: { count: 1, surfaceSlug: "web", at } }], seenAt: null }));
});
it.each(["aggregate", "review", "actors"])("하위 %s 실패는 전체 실패다", async source => {
  const { db, prisma } = database();
  if (source === "aggregate") db.locale.findMany.mockRejectedValue(new Error("broken"));
  if (source === "review") db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("broken"));
  if (source === "actors") mocks.actors.mockRejectedValue(new Error("broken"));
  await expect(loadAttentionInbox(prisma, "user")).rejects.toThrow("broken");
});
