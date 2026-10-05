import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ session: vi.fn(), prisma: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mock.session }));
vi.mock("@/lib/db", () => ({ getPrisma: mock.prisma }));
import { loadSearchMembershipsAction, searchKeysAction } from "@/app/search/actions";
import { navSearchEntries } from "@/lib/search/nav-index";
import { en } from "@/messages/en";
import { searchGroups } from "@/lib/search/match";
import { keySearchText, searchRows, searchStatuses } from "@/lib/search/rows";
import { searchFixture } from "./search-fixture";

const db = searchFixture();
beforeAll(() => db.start());
afterAll(() => db.stop());
beforeEach(async () => {
  await db.reset();
  mock.session.mockResolvedValue({ status: "ok", userId: "u1" });
  mock.prisma.mockReturnValue(db.prisma);
  await db.project("demo", "u1");
  await db.prisma.projectMember.updateMany({ where: { projectId: "demo", userId: "u1" }, data: { role: "OWNER" } });
  await db.surface("demo", "web");
});
async function index() {
  const response = await loadSearchMembershipsAction();
  if (!response.ok) throw new Error("Search memberships unavailable");
  return { ...navSearchEntries(en, response.memberships, { activeSlug: null, userName: "Fixture" }), docs: [] };
}
it("public reopen model reflects creation, archive and role changes after real Actions", async () => {
  const before = await index();
  expect(searchGroups(before, "settings demo", { activeSlug: null }).flatMap(g => g.items).map(e => e.id)).toEqual(["page:demo:settings"]);
  await db.project("created", "u1");
  await db.prisma.project.update({ where: { id: "demo" }, data: { archivedAt: new Date() } });
  await db.prisma.projectMember.updateMany({ where: { projectId: "demo", userId: "u1" }, data: { role: "EDITOR" } });
  const after = await index();
  expect(after.projects.find(p => p.slug === "demo")).toMatchObject({ archived: true });
  expect(searchRows(en, { index: after, keys: [], q: "", activeSlug: null }).groups[0]!.rows.map(e => e.id)).toEqual(["project:created", "project:demo", "go-to-projects"]);
  expect(searchGroups(after, "settings demo", { activeSlug: null })).toEqual([]);
});
it("whole-string Keys and token-AND pages feed the same rendered search contract", async () => {
  await db.key("demo", "web", "split", "settings key", "demo text");
  await db.key("demo", "web", "literal", "literal-key", "prefix ".repeat(100) + "settings demo");
  const response = await searchKeysAction("settings demo", null);
  if (!response.ok) throw new Error("Keys unavailable");
  expect(response.hits.map(h => h.id)).toEqual(["literal"]);
  const hit = response.hits[0]!;
  // 렌더 계약 = `searchRows`의 행이다(R-B1 Y1) — 그룹 순서·행 id·칠하는 조각·스니펫·착지 주소를 행에서 잰다.
  const rows = searchRows(en, { index: await index(), keys: response.hits, q: "settings demo", activeSlug: null });
  expect(rows.groups.map(g => g.kind)).toEqual(["pages", "keys"]);
  expect(rows.ids).toEqual(["page:demo:settings", "key:literal"]);
  const keyRow = rows.groups[1]!.rows[0]!;
  expect(keyRow.description?.filter(s => s.match).map(s => s.text)).toEqual(["settings demo"]);
  expect(keyRow.description?.map(s => s.text).join("").length).toBeLessThan(200);
  expect(keyRow.context).toEqual([{ text: `${hit.name} · web`, match: false }]);
  const href = new URL(keyRow.href, "http://localhost");
  expect(Object.fromEntries(href.searchParams)).toMatchObject({ key: "literal", keySurface: "web", ns: "_root" });
  expect(href.searchParams.has("q")).toBe(false);
  const pageRow = rows.groups[0]!.rows[0]!;
  expect(pageRow.title.filter(s => s.match).map(s => s.text)).toEqual(["Settings"]);
  expect(pageRow.context?.filter(s => s.match).map(s => s.text)).toEqual([hit.name]);
});

// 세션이 없으면 실제 Action이 `unauthorized`를 돌려주고, 뷰모델은 Docs 전용 + 세션 종료 한 줄이다(C1·C2 — R-B1 Y1).
// 실 네트워크·직렬화·실 세션 만료는 런타임 검증(T13)에 남는다.
it("unauthorized Actions fold to a Docs-only view with one session-ended line", async () => {
  mock.session.mockResolvedValue({ status: "none" });
  const memberships = await loadSearchMembershipsAction();
  expect(memberships).toEqual({ ok: false, error: "unauthorized" });
  const keys = await searchKeysAction("settings demo", null);
  expect(keys).toEqual({ ok: false, error: "unauthorized" });
  const nav = navSearchEntries(en, memberships.ok ? memberships.memberships : null, { activeSlug: null, userName: "Fixture" });
  const docs = [{ id: "docs:start", title: "Settings demo guide", href: "/docs/start" }];
  for (const q of ["", "settings demo"]) {
    expect(keySearchText(q, nav.authenticated)).toBeNull();
    expect(searchRows(en, { index: { ...nav, docs }, keys: [], q, activeSlug: null }).groups.map(g => g.kind)).toEqual(["docs"]);
  }
  const status = searchStatuses(en, { membership: memberships.ok ? "ready" : memberships.error, docs: "ready", keys: keys.ok ? "ready" : keys.error });
  expect(status).toEqual({ pending: false, failed: true, lines: [{ tone: "danger", text: en.search.sessionEnded }] });
});
