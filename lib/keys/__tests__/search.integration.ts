import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ session: vi.fn(), prisma: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mock.session }));
vi.mock("@/lib/db", () => ({ getPrisma: mock.prisma }));
import { searchKeysAction, loadSearchMembershipsAction } from "@/app/search/actions";
import { navSearchEntries } from "@/lib/search/nav-index";
import { searchKeys } from "@/lib/keys/search";
import { keyResultHref } from "@/lib/search/key-href";
import { parseTranslationQuery } from "@/lib/translations/query";
import { searchFixture } from "./search-fixture";

const db = searchFixture();
beforeAll(() => db.start());
afterAll(() => db.stop());
beforeEach(async () => {
  await db.reset();
  mock.session.mockResolvedValue({ status: "ok", userId: "u1" });
  mock.prisma.mockReturnValue(db.prisma);
  for (const [p, user] of [["p1", "u1"], ["p2", "u2"]] as const) {
    await db.project(p, user);
    await db.surface(p, `${p}-s`);
    await db.key(p, `${p}-s`, `${p}-key`, "private-key", "private-source", { en: "private-value", ko: "" });
  }
});
const search = (q: string, userId = "u1", activeSlug: string | null = null) => searchKeys(db.prisma, { q, userId, activeSlug });

it("세션 사용자 멤버십만 찾고 activeSlug는 남의 키를 열지 않는다", async () => {
  for (const q of ["private-key", "private-source", "private-value"]) {
    expect((await search(q, "u1", "p2")).map(h => h.id)).toEqual(["p1-key"]);
    expect((await search(q, "u2", "p1")).map(h => h.id)).toEqual(["p2-key"]);
    expect(await search(q, "empty")).toEqual([]);
  }
});

it.each(["project", "surface", "unready", "key", "locale"])("%s 비활성 상태를 검색에서 제외한다", async kind => {
  if (kind === "project") await db.prisma.project.update({ where: { id: "p1" }, data: { archivedAt: new Date() } });
  if (kind === "surface") await db.prisma.translationSurface.update({ where: { id: "p1-s" }, data: { archivedAt: new Date() } });
  if (kind === "unready") await db.prisma.translationSurface.update({ where: { id: "p1-s" }, data: { lastCommitSha: null } });
  if (kind === "key") await db.prisma.stringKey.update({ where: { id: "p1-key" }, data: { orphaned: true } });
  if (kind === "locale") await db.prisma.locale.updateMany({ where: { projectId: "p1", code: "en" }, data: { orphaned: true } });
  expect(await search("private-value")).toEqual([]);
  expect((await search("private-key")).length).toBe(kind === "locale" ? 1 : 0);
});

it("키 이름 > 원문 > 번역값이고 첫 C 로케일만 반환하며 URL이 선택 키를 보존한다", async () => {
  await db.key("p1", "p1-s", "name", "needle", "Source", { en: "needle", ko: "needle" });
  await db.key("p1", "p1-s", "source", "aaa", "needle");
  await db.key("p1", "p1-s", "value", "000", "Source", { en: "needle EN", ko: "needle KO" });
  const response = await searchKeysAction("NEEDLE", "p2");
  expect(response.ok).toBe(true);
  if (!response.ok) throw new Error("Search action failed");
  const hits = response.hits;
  expect(hits.map(h => h.id)).toEqual(["name", "source", "value"]);
  expect(hits[2]).toMatchObject({ localeCode: "en", value: "needle EN", inKey: false });
  expect(hits[0]).toMatchObject({ localeCode: null, value: null, inKey: true });
  const url = new URL(keyResultHref(hits[2]!), "http://localhost");
  expect(url.searchParams.has("q")).toBe(false);
  expect(parseTranslationQuery(Object.fromEntries(url.searchParams))).toMatchObject({ key: "value", keySurface: "p1-s", ns: "_root" });
});

it.each(["name", "value"])("%s 동점 8개는 소스·프로젝트를 넘어서 C id 순서로 다섯 개만 고정한다", async kind => {
  await db.project("p3");
  const ids = ["z", "é", "b", "A", "a", "Z", "c", "d"];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const p = i % 2 ? "p1" : "p3";
    await db.surface(p, `s-${id}`);
    await db.key(p, `s-${id}`, id, kind === "name" ? "tie-needle" : "tie", "Source", { en: "tie-needle" });
  }
  db.captured.length = 0;
  expect((await search("tie-needle")).map(h => h.id)).toEqual(["A", "Z", "a", "b", "c"]);
  expect(db.captured).toHaveLength(kind === "name" ? 1 : 2);
  expect((await search("tie-needle", "u1", "p3")).map(h => h.id)).toEqual(["a", "b", "c", "z", "A"]);
});

it("로케일 0개·빈 번역도 키와 원문으로 찾고 짧은 질의는 SQL을 안 보낸다", async () => {
  await db.surface("p1", "bare", []);
  await db.key("p1", "bare", "bare", "bare-key");
  expect((await search("bare-key")).map(h => h.id)).toEqual(["bare"]);
  expect((await search("private-key"))[0]).toMatchObject({ localeCode: null, value: null });
  db.captured.length = 0;
  expect(await search(" a ")).toEqual([]);
  expect(db.captured).toHaveLength(0);
});

it.each(["50%_off", "a_b", "a%b", "a\\b"])("%s는 LIKE 와일드카드가 아니다", async q => {
  await db.key("p1", "p1-s", "literal", q);
  await db.key("p1", "p1-s", "wild", "aXXb");
  expect((await search(q)).map(h => h.id)).toEqual(["literal"]);
  await db.prisma.stringKey.update({ where: { id: "literal" }, data: { key: "other" } });
  await db.prisma.translation.create({ data: { projectId: "p1", surfaceId: "p1-s", keyId: "literal", localeCode: "en", value: q } });
  expect((await search(q)).map(h => h.id)).toEqual(["literal"]);
});

it("권한 회수 뒤 다음 Action 응답과 화면용 내비에서 프로젝트가 함께 사라진다", async () => {
  expect((await searchKeysAction("private-value", null))).toMatchObject({ ok: true, hits: [{ id: "p1-key" }] });
  const before = await loadSearchMembershipsAction();
  if (!before.ok) throw new Error("Membership action failed");
  expect(navSearchEntries(before.memberships, { activeSlug: null, userName: "Fixture" }).projects.map(p => p.slug)).toEqual(["p1"]);
  await db.prisma.projectMember.deleteMany({ where: { projectId: "p1", userId: "u1" } });
  expect(await searchKeysAction("private-value", null)).toEqual({ ok: true, hits: [] });
  const after = await loadSearchMembershipsAction();
  if (!after.ok) throw new Error("Membership action failed");
  expect(navSearchEntries(after.memberships, { activeSlug: null, userName: "Fixture" }).projects).toEqual([]);
});

it("일치 로케일은 DB 기본 정렬 대신 C 정렬의 첫 코드다", async () => {
  await db.surface("p1", "locale-order", ["a", "Z", "é"]);
  await db.key("p1", "locale-order", "locale-order", "locale-key", "Source", { a: "locale-needle a", Z: "locale-needle Z", é: "locale-needle accent" });
  expect(await search("locale-needle")).toMatchObject([{ id: "locale-order", localeCode: "Z", value: "locale-needle Z" }]);
});
