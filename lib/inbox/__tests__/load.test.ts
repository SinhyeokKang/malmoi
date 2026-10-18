import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadAttentionInbox } from "../load";
import { planInbox } from "../plan";
const mocks = vi.hoisted(() => ({ actors: vi.fn(), remote: vi.fn() }));
vi.mock("@/lib/keys/query", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/keys/query")>(), loadActors: mocks.actors }));
// 배지 Action이 매 헤더에서 이 로더를 부른다 — 호스트 API(원격 신호)를 부르면 헤더마다 비용이 든다(project-row-redesign 비목표).
vi.mock("@/lib/projects/remote", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/projects/remote")>(), loadRemoteSignals: mocks.remote }));
const at = new Date("2026-10-01T00:00:00Z");
const locale = { code: "ko", name: "Korean", orphaned: false, createdAt: at };
function member(id: string, overrides = {}) {
  return { role: "OWNER", user: { attentionSeenAt: null }, project: {
    id, slug: id, name: id, image: null, repoHost: "github", gitlabConnectionId: null, installationId: "1", repositoryId: "1", archivedAt: null, createdAt: at,
    surfaces: [{ id: `s-${id}`, slug: "web", archivedAt: null, lastCommitSha: "a", lastImportError: null, lastImportFailedAt: null, lastImportStartedAt: null, locales: [locale] }],
    ...overrides,
  } };
}
function database(rows = [member("p1")]) {
  const db = { projectMember: { findMany: vi.fn().mockResolvedValue(rows) },
    locale: { findMany: vi.fn().mockResolvedValue([]) }, stringKey: { groupBy: vi.fn().mockResolvedValue([]) },
    translation: { groupBy: vi.fn().mockResolvedValue([]) }, $queryRaw: vi.fn().mockResolvedValue([]),
    localeChange: { findMany: vi.fn().mockResolvedValue([]) }, deliveryConfirmation: { findMany: vi.fn().mockResolvedValue([]) } };
  return { db, prisma: db as unknown as PrismaClient };
}
beforeEach(() => { vi.clearAllMocks(); mocks.actors.mockResolvedValue(new Map()); });
/** 아직 PR/MR로 나가지 않은 언어 제거 한 행 — 일괄 읽기(`readLocaleStatesByProject`)의 select 모양이다. */
const removal = (projectId: string, localeCode = "ko") => ({ projectId, surfaceId: `s-${projectId}`, localeCode, operation: "REMOVE", requestedAt: at, locale: { orphaned: false } });
const addition = (projectId: string, localeCode = "fr") => ({ ...removal(projectId, localeCode), operation: "ADD" });
it.each([1, 40])("프로젝트 %i개에서도 같은 조회 수와 인가된 id 집합만 쓴다", async n => {
  const rows = Array.from({ length: n }, (_, i) => member(`p${i}`));
  const ids = rows.map(r => r.project.id);
  const { db, prisma } = database(rows);
  await loadAttentionInbox(prisma, "user");
  expect(db.projectMember.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { userId: "user", project: { archivedAt: null } }, select: expect.objectContaining({ user: { select: { attentionSeenAt: true } } }) }));
  for (const fn of [db.locale.findMany, db.stringKey.groupBy, db.translation.groupBy, db.localeChange.findMany, db.deliveryConfirmation.findMany]) {
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
  expect(db.localeChange.findMany).not.toHaveBeenCalled();
  expect(db.deliveryConfirmation.findMany).not.toHaveBeenCalled();
  expect(mocks.actors).not.toHaveBeenCalled();
});
it("표면 실패를 평탄화하지 않고 설정·첫 적재 대기를 같은 판정으로 조립한다", async () => {
  const base = member("p").project.surfaces[0]!;
  const { prisma } = database([
    member("p", { surfaces: [{ ...base, lastImportError: "parse-failed", lastImportFailedAt: at }, { ...base, id: "s2", slug: "mail", lastImportError: "parse-failed", lastImportStartedAt: at }] }),
    member("setup", { repoHost: "github", gitlabConnectionId: null, installationId: null, surfaces: [] }),
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
it("미전달·빈 로케일·언어 변경과 워터마크가 실제 plan으로 이어진다", async () => {
  const row = member("p1");
  const { db, prisma } = database([row]);
  db.stringKey.groupBy.mockResolvedValue([{ projectId: "p1", surfaceId: "s-p1", _count: { _all: 2 } }]);
  db.localeChange.findMany.mockResolvedValue([removal("p1")]);
  db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ projectId: "p1", surfaceId: "s-p1", surfaceSlug: "web", n: 1, at }]).mockResolvedValueOnce([]);
  expect(await loadAttentionInbox(prisma, "user")).toEqual(planInbox({ projects: [{ connectionPinned: true, gitlabTokenExpiresAt: null, slug: "p1", name: "p1", image: null, role: "OWNER", status: "active", createdAt: at,
    attention: [{ kind: "never_filled", at, surfaceSlug: "web", code: "ko", name: "Korean", keys: 2 }], unsent: { count: 1, surfaceSlug: "web", at }, language: { count: 1, surfaceSlug: "web", at, held: true } }], seenAt: null }));
});
it.each(["aggregate", "review", "actors"])("하위 %s 실패는 전체 실패다", async source => {
  const { db, prisma } = database();
  if (source === "aggregate") db.locale.findMany.mockRejectedValue(new Error("broken"));
  if (source === "review") db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("broken"));
  if (source === "actors") mocks.actors.mockRejectedValue(new Error("broken"));
  await expect(loadAttentionInbox(prisma, "user")).rejects.toThrow("broken");
});
it("끊긴 프로젝트가 재연결 항목이 되고 원격 신호는 한 번도 부르지 않는다", async () => {
  const { prisma } = database([member("gone", { repositoryId: null }), member("p1")]);
  const plan = await loadAttentionInbox(prisma, "user");
  expect(plan.groups.map(group => [group.project.slug, group.project.reconnect, group.items.map(item => item.kind)])).toEqual([
    ["gone", "settings", ["needs_reconnect"]],
  ]);
  expect(mocks.remote).not.toHaveBeenCalled();
});

/**
 * **언어 변경 작업이 Inbox 항목까지 닿는다** (language-request-todo T6 · review-A Y3) — 로더가 `language: null`을 넘기면 순수 표(`project-todos.test.ts`)는 green인 채
 * 항목이 사라진다. 일괄 읽기는 같은 라운드이고 `projectId in ids`로 좁힌다.
 */
it("전달 전 언어 제거가 보류 항목으로 서고 목적지 재료(slug)가 실린다", async () => {
  const { db, prisma } = database([member("p1"), member("p2")]);
  db.localeChange.findMany.mockResolvedValue([removal("p1")]);
  const plan = await loadAttentionInbox(prisma, "user");
  expect(plan.groups).toHaveLength(1);
  expect(plan.groups[0]?.project.slug).toBe("p1");
  expect(plan.groups[0]?.items).toEqual([{ kind: "language_unsent", count: 1, surfaceSlug: "web", at, held: true, ownerRetries: false, unread: true }]);
  expect(db.localeChange.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ["p1", "p2"] } }) }));
  expect(db.deliveryConfirmation.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ["p1", "p2"] } }) }));
  expect(mocks.remote).not.toHaveBeenCalled();
});
/**
 * 호출 수는 프로젝트 수가 아니라 ADD 행의 유무로 갈린다(review-B 🟡2) — 1개·N개 둘 다 ADD를 두고 센다. ADD가 있으면 값 수 raw가 하나 늘 뿐이다.
 */
it.each([1, 40])("ADD가 있으면 프로젝트 %i개에서도 Prisma 호출이 같다", async n => {
  const rows = Array.from({ length: n }, (_, i) => member(`p${i}`));
  const ids = rows.map(r => r.project.id);
  const { db, prisma } = database(rows);
  db.localeChange.findMany.mockResolvedValue(ids.map(id => addition(id)));
  await loadAttentionInbox(prisma, "user");
  expect(db.localeChange.findMany).toHaveBeenCalledTimes(1);
  expect(db.deliveryConfirmation.findMany).toHaveBeenCalledTimes(1);
  // 집계 raw 둘 + 검토 raw 하나 + 언어 값 수 raw 하나 — 프로젝트 수와 무관하다.
  expect(db.$queryRaw).toHaveBeenCalledTimes(4);
  for (const call of db.$queryRaw.mock.calls) expect(call).toContainEqual(ids);
});
