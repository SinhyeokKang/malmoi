import { expect, it } from "vitest";
import { badgeLabel, isUnread, planInbox, type InboxProject } from "../plan";
const at = new Date("2026-10-01T00:00:00Z");
const failed = { kind: "import_failed" as const, at, surfaceSlug: "web", reason: "parse-failed" as const };
const project: InboxProject = { slug: "demo", name: "Demo", image: null, role: "OWNER", status: "active", createdAt: at, attention: [failed], unsent: null };
it.each([null, new Date(at.getTime() - 1), at, new Date(at.getTime() + 1)])("읽음 경계와 검토 제외: %s", seenAt => {
  expect(isUnread("import_failed", at, seenAt)).toBe(seenAt === null || at > seenAt);
  expect(isUnread("import_failed", null, seenAt)).toBe(seenAt === null);
  expect(isUnread("review", at, seenAt)).toBe(false);
});
it.each([[0, null], [1, "1"], [9, "9"], [10, "9+"], [50, "9+"]])("배지 %i", (n, result) => expect(badgeLabel(n as number)).toBe(result));
it("상한·내부 id 없이 결정적으로 모두 돌려준다", () => {
  const input = { projects: [{ ...project, attention: Array.from({ length: 7 }, (_, i) => ({ ...failed, surfaceSlug: `s${i}` })) }], seenAt: null };
  const result = planInbox(input);
  expect(result.groups[0]?.items).toHaveLength(7);
  expect(result.unread).toBe(7);
  expect(planInbox(input)).toEqual(result);
  expect(JSON.stringify(result)).not.toContain("projectId");
});
it("EDITOR에게 설정은 없고 실패 안내는 있다", () => {
  const result = planInbox({ projects: [{ ...project, role: "EDITOR", status: "setup" }], seenAt: null });
  expect(result.groups[0]?.items).toEqual([{ ...failed, unread: true, ownerRetries: true }]);
});
it("동시각은 설정·미전달·표면 slug 순이고 검토는 읽음이다", () => {
  const result = planInbox({ projects: [{ ...project, status: "setup", unsent: { count: 2, surfaceSlug: "z", at }, attention: [
    { ...failed, surfaceSlug: "z" }, failed,
    { kind: "review", at, surfaceSlug: "a", code: "ko", name: "Korean", count: 1, who: null },
  ] }], seenAt: null });
  expect(result.groups[0]?.items.map(i => i.kind)).toEqual(["setup", "unsent", "review", "import_failed", "import_failed"]);
  expect(result.groups[0]?.items[2]?.unread).toBe(false);
  expect(result.unread).toBe(4);
});
it("묶음은 최신 시각·slug 순, 빈 프로젝트는 빠진다", () => {
  const result = planInbox({ projects: [
    { ...project, slug: "z" }, { ...project, slug: "a" },
    { ...project, slug: "new", attention: [{ ...failed, at: new Date(at.getTime()+1) }] },
    { ...project, slug: "empty", attention: [] },
    { ...project, slug: "old", attention: [{ ...failed, at: null }] },
  ], seenAt: at });
  expect(result.groups.map(g => g.project.slug)).toEqual(["new", "a", "z", "old"]);
  expect(result.unread).toBe(1);
});
