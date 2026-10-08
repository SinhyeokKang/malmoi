import { expect, it } from "vitest";
import { badgeLabel, clampSeenAt, isUnread, planInbox, type InboxProject } from "../plan";
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
const serverNow = new Date("2026-10-09T12:00:00.000Z");
it.each([
  ["과거 ISO는 그대로", "2026-10-09T11:59:59.999Z", new Date("2026-10-09T11:59:59.999Z")],
  ["now와 같은 값", "2026-10-09T12:00:00.000Z", serverNow],
  ["미래는 서버 시각으로 자른다", "2026-10-09T12:00:00.001Z", serverNow],
  ["먼 미래도 서버 시각", "9999-12-31T23:59:59.999Z", serverNow],
  ["epoch은 받는다 — 단조 쓰기라 무해", "1970-01-01T00:00:00.000Z", new Date(0)],
])("clampSeenAt: %s", (_, input, expected) => {
  expect(clampSeenAt(input, serverNow)).toEqual(expected);
});
it.each([
  ["Date 객체", new Date("2026-10-09T11:00:00.000Z")],
  ["숫자", serverNow.getTime() - 1000],
  ["NaN", Number.NaN],
  ["null", null],
  ["undefined", undefined],
  ["빈 문자열", ""],
  ["잘못된 문자열", "yesterday"],
  ["Invalid Date 문자열", "2026-13-40T00:00:00.000Z"],
  ["넘치는 날짜", "2026-02-30T00:00:00.000Z"],
  ["ISO가 아닌 날짜 문자열", "Oct 9, 2026 11:00 UTC"],
  ["오프셋 없는 로컬 시각", "2026-10-09T11:00:00"],
])("clampSeenAt: %s → null", (_, input) => {
  expect(clampSeenAt(input, serverNow)).toBeNull();
});
