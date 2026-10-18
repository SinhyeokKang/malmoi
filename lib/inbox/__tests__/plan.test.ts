import { expect, it } from "vitest";
import { badgeLabel, clampSeenAt, isUnread, planInbox, type InboxProject } from "../plan";
const at = new Date("2026-10-01T00:00:00Z");
const failed = { kind: "import_failed" as const, at, surfaceSlug: "web", reason: "parse-failed" as const };
const project: InboxProject = { connectionPinned: true, gitlabTokenExpiresAt: null, slug: "demo", name: "Demo", image: null, role: "OWNER", status: "active", createdAt: at, attention: [failed], unsent: null, language: null };
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
it("안 읽은 항목이 있는 묶음이 먼저다 — 그 안팎은 최신 시각 순", () => {
  const later = new Date(at.getTime() + 60_000);
  const review = { kind: "review" as const, at: later, surfaceSlug: "a", code: "ko", name: "Korean", count: 1, who: null };
  const result = planInbox({ projects: [
    { ...project, slug: "fresh-review", attention: [review] },
    { ...project, slug: "unread-old", attention: [{ ...failed, at: new Date(at.getTime() + 1) }] },
    { ...project, slug: "unread-new", attention: [{ ...failed, at: new Date(at.getTime() + 2) }] },
    { ...project, slug: "read", attention: [{ ...failed, at }] },
  ], seenAt: at });
  expect(result.groups.map(g => g.project.slug)).toEqual(["unread-new", "unread-old", "fresh-review", "read"]);
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

/**
 * 재연결 항목의 시각 (project-row-redesign design §4) — GitLab 토큰 만료면 만료일, 연결 고정이 빠진 행은 `null`이라 그룹 안 맨 뒤로 가고
 * `seenAt`이 있으면 안 읽음으로 세지 않는다. ⚠️ **만료일이 마지막 열람보다 이르면 처음부터 읽음이다**(RA 🟢4) — 배지 수가 늘지 않는다.
 */
it.each([
  ["만료일이 열람 뒤", new Date(at.getTime() + 1), at, true],
  ["만료일이 열람 전 — 읽음으로 태어난다", new Date(at.getTime() - 1), at, false],
  ["시각 없음 + 열람 기록 있음", null, at, false],
  ["시각 없음 + 열람 기록 없음", null, null, true],
] as const)("재연결 읽음: %s", (_label, expiresAt, seenAt, unread) => {
  const result = planInbox({ projects: [{ ...project, attention: [], status: "needs_reconnect", gitlabTokenExpiresAt: expiresAt, connectionPinned: expiresAt !== null }], seenAt });
  expect(result.groups[0]?.items).toEqual([{ kind: "needs_reconnect", at: expiresAt, ownerRetries: false, unread }]);
  expect(result.unread).toBe(unread ? 1 : 0);
});
it("시각 없는 재연결은 그룹 안 맨 뒤다 — 시각 있는 항목이 앞선다", () => {
  const result = planInbox({ projects: [{ ...project, status: "needs_reconnect", connectionPinned: false, attention: [failed] }], seenAt: null });
  expect(result.groups[0]?.items.map(item => item.kind)).toEqual(["import_failed", "needs_reconnect"]);
});

/** 언어 변경 항목은 미발송과 같은 급(rank 1)이다 — 동시각이면 프로젝트 항목 다음, 표면·로케일 항목 앞이고 미발송과는 넣은 순서다. */
it("동시각 언어 변경 항목은 미발송과 같은 급이다", () => {
  const result = planInbox({ projects: [{ ...project, status: "setup", unsent: { count: 2, surfaceSlug: "z", at },
    language: { count: 1, surfaceSlug: "a", at, held: false }, attention: [failed] }], seenAt: null });
  expect(result.groups[0]?.items.map(i => i.kind)).toEqual(["setup", "unsent", "language_unsent", "import_failed"]);
});
/** 거둘 것만 남은 항목은 시각이 없다(D11) — 워터마크가 있으면 안 읽음으로 세지 않고 그룹 안 맨 뒤다. */
it("시각 없는 언어 변경 항목은 읽음이고 맨 뒤다", () => {
  const result = planInbox({ projects: [{ ...project, language: { count: 1, surfaceSlug: "web", at: null, held: false } }], seenAt: at });
  expect(result.groups[0]?.items.map(i => [i.kind, i.unread])).toEqual([["import_failed", false], ["language_unsent", false]]);
  expect(result.unread).toBe(0);
});
