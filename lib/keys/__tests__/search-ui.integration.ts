import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ session: vi.fn(), prisma: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mock.session }));
vi.mock("@/lib/db", () => ({ getPrisma: mock.prisma }));
import { loadSearchMembershipsAction, searchKeysAction } from "@/app/search/actions";
import { navSearchEntries } from "@/lib/search/nav-index";
import { previewGroups, searchGroups } from "@/lib/search/match";
import { highlightSegments, snippet } from "@/lib/search/highlight";
import { keyResultHref } from "@/lib/search/key-href";
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
  return { ...navSearchEntries(response.memberships, { activeSlug: null, userName: "Fixture" }), docs: [] };
}
it("public reopen model reflects creation, archive and role changes after real Actions", async () => {
  const before = await index();
  expect(searchGroups(before, "settings demo", { activeSlug: null }).flatMap(g => g.items).map(e => e.id)).toEqual(["menu:demo:settings"]);
  await db.project("created", "u1");
  await db.prisma.project.update({ where: { id: "demo" }, data: { archivedAt: new Date() } });
  await db.prisma.projectMember.updateMany({ where: { projectId: "demo", userId: "u1" }, data: { role: "EDITOR" } });
  const after = await index();
  expect(after.projects.find(p => p.slug === "demo")).toMatchObject({ archived: true });
  expect(previewGroups(after, { activeSlug: null })[0]!.items.map(e => e.id)).toEqual(["project:created", "project:demo", "view-all-projects"]);
  expect(searchGroups(after, "settings demo", { activeSlug: null })).toEqual([]);
});
it("whole-string Keys and token-AND menus feed the same rendered search contract", async () => {
  await db.key("demo", "web", "split", "settings key", "demo text");
  await db.key("demo", "web", "literal", "literal-key", "prefix ".repeat(100) + "settings demo");
  const response = await searchKeysAction("settings demo", null);
  if (!response.ok) throw new Error("Keys unavailable");
  expect(response.hits.map(h => h.id)).toEqual(["literal"]);
  const hit = response.hits[0]!;
  const description = snippet(hit.sourceText, ["settings demo"], 160)!;
  expect(highlightSegments(description, ["settings demo"]).filter(s => s.match).map(s => s.text)).toEqual(["settings demo"]);
  const href = new URL(keyResultHref(hit), "http://localhost");
  expect(Object.fromEntries(href.searchParams)).toMatchObject({ key: "literal", keySurface: "web", ns: "_root" });
  expect(href.searchParams.has("q")).toBe(false);
  expect(searchGroups(await index(), "settings demo", { activeSlug: null }).flatMap(g => g.items).map(e => e.id)).toContain("menu:demo:settings");
});
