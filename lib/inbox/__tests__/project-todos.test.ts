import { expect, it } from "vitest";
import { neverFilledLocales } from "@/lib/home/attention";
import { planProjectRow, projectStatus, type RowInput } from "@/lib/projects/list";
import { planInbox } from "../plan";
import { projectTodos, type ProjectTodoInput } from "../project-todos";

const at = new Date("2026-10-01T00:00:00Z");
const input: ProjectTodoInput = { status: "active", role: "OWNER", createdAt: at,
  connectionPinned: true, gitlabTokenExpiresAt: null, attention: [], unsent: null };
const failed = { kind: "import_failed" as const, at, surfaceSlug: "web", reason: "parse-failed" as const };

it("DB 할 일을 모두 보존하고 원격 종류를 만들지 않는다", () => {
  const attention = [failed,
    { kind: "review" as const, at, surfaceSlug: "web", code: "ko", name: "Korean", count: 3, who: null },
    { kind: "never_filled" as const, at, surfaceSlug: "web", code: "es", name: "Spanish", keys: 4 }];
  expect(projectTodos({ ...input, status: "setup", attention, unsent: { at, count: 2, surfaceSlug: "web" } })).toEqual([
    ...attention.map(item => ({ ...item, ownerRetries: false })),
    { kind: "setup", at, ownerRetries: false },
    { kind: "unsent", at, count: 2, surfaceSlug: "web", ownerRetries: false },
  ]);
});
it.each(["OWNER", "EDITOR"] as const)("%s 설정 필터와 소유자 안내 플래그", role => {
  const todos = projectTodos({ ...input, role, status: "setup", attention: [failed] });
  expect(todos.some(t => t.kind === "setup")).toBe(role === "OWNER");
  expect(todos.find(t => t.kind === "import_failed")?.ownerRetries).toBe(role === "EDITOR");
  expect(projectTodos({ ...input, role, status: "needs_reconnect" })).toEqual([
    { kind: "needs_reconnect", at: null, ownerRetries: role === "EDITOR" },
  ]);
});
it("GitLab 만료일을 쓰되 연결 고정이 없으면 시각을 알 수 없다", () => {
  expect(projectTodos({ ...input, status: "needs_reconnect", gitlabTokenExpiresAt: at })).toEqual([
    { kind: "needs_reconnect", at, ownerRetries: false },
  ]);
  expect(projectTodos({ ...input, status: "needs_reconnect", gitlabTokenExpiresAt: at, connectionPinned: false })[0]?.at).toBeNull();
});
it("보관과 빈 큐는 할 일이 없다", () => {
  expect(projectTodos(input)).toEqual([]);
  expect(projectTodos({ ...input, unsent: { at, count: 0, surfaceSlug: "web" } })).toEqual([]);
  expect(projectTodos({ ...input, status: "archived", attention: [failed], unsent: { at, count: 2, surfaceSlug: "web" } })).toEqual([]);
});
it("목록이 모르는 검토 시각은 null 그대로다", () => {
  const review = { kind: "review" as const, at: null, surfaceSlug: "web", code: "ko", name: "Korean", count: 2, who: null };
  expect(projectTodos({ ...input, attention: [review] })[0]).toEqual({ ...review, ownerRetries: false });
});
it("REMOVE·orphaned를 제외하고 빈 ADD는 할 일로 낸다", () => {
  const locales = [
    { code: "removed", change: { operation: "REMOVE" as const } },
    { code: "added", change: { operation: "ADD" as const } },
    { code: "orphan", change: null, orphaned: true },
  ].map(locale => ({ name: locale.code, orphaned: false, createdAt: at, ...locale }));
  const neverFilled = neverFilledLocales([{ id: "s", slug: "web", locales }], { keyTotals: new Map([["s", 3]]), cells: [] });
  expect(projectTodos({ ...input, attention: neverFilled.map(item => ({ ...item, kind: "never_filled" as const })) })).toEqual([
    { kind: "never_filled", at, surfaceSlug: "web", code: "added", name: "added", keys: 3, ownerRetries: false },
  ]);
});
it.each([["OWNER", "settings", false], ["EDITOR", "home", true]] as const)("%s에게도 재연결 항목이 서고 목적지·안내가 역할로 갈린다", (role, reconnect, ownerRetries) => {
  const plan = planInbox({ seenAt: null, projects: [{ ...input, role, status: "needs_reconnect", attention: [], slug: "demo", name: "Demo", image: null }] });
  expect(plan.groups).toEqual([{ project: { slug: "demo", name: "Demo", image: null, reconnect },
    items: [{ kind: "needs_reconnect", at: null, ownerRetries, unread: true }] }]);
  expect(plan.unread).toBe(1);
});

/**
 * **행 띠와 Inbox가 같은 DB 할 일 판정에서 나온다** (project-row-redesign spec 완료 조건 6). 같은 프로젝트 입력에서 행 띠가 DB 할 일이면
 * 그 종류가 Inbox 항목에 있다. 역할 예외는 design §4 표 하나다 — `setup`은 Inbox가 OWNER만 받는다(EDITOR가 할 수 있는 일이 없다).
 * 원격 신호 셋(열린 PR · PR 조회 실패 · 리포 앞섬)은 행 전용이라 Inbox 종류에 없다.
 */
it("행 띠의 DB 할 일 종류가 같은 프로젝트의 Inbox 항목에 있다 — 표", () => {
  const DB = new Set(["needs_reconnect", "import_failed", "setup", "unsent", "review", "never_filled"]);
  const REMOTE = new Set(["pr_open", "pr_check_failed", "repo_ahead"]);
  const surface = { archivedAt: null, lastCommitSha: "s", importError: null, importing: false };
  let checked = 0;
  for (const role of ["OWNER", "EDITOR"] as const)
  for (const status of ["active", "setup", "awaiting_first_sync", "needs_reconnect", "archived"] as const)
  for (const failure of [null, "parse-failed", "partial-import"] as const)
  for (const unsent of [0, 2])
  for (const review of [0, 2])
  for (const blank of [false, true])
  for (const openPr of [null, undefined, { number: 1, url: "https://example.com/1" }]) {
    const row: RowInput = { repoHost: "github", gitlabConnectionId: null, gitlabTokenExpiresAt: null,
      installationId: status === "setup" ? null : "i", repositoryId: status === "needs_reconnect" ? null : "r",
      archivedAt: status === "archived" ? at : null,
      surfaces: [{ ...surface, lastCommitSha: status === "awaiting_first_sync" ? null : "s", importError: failure }],
      review, unsent, openPr, repoAheadFiles: 0 };
    expect(projectStatus(row)).toBe(status);
    const attention = [
      ...(failure === null ? [] : [{ ...failed, reason: failure }]),
      ...(review > 0 ? [{ kind: "review" as const, at, surfaceSlug: "web", code: "ko", name: "Korean", count: review, who: null }] : []),
      ...(blank ? [{ kind: "never_filled" as const, at, surfaceSlug: "web", code: "es", name: "Spanish", keys: 4 }] : []),
    ];
    const project = { ...input, role, status, attention, unsent: unsent > 0 ? { at, count: unsent, surfaceSlug: "web" } : null };
    const band = planProjectRow(row, projectTodos(project)).banner?.kind ?? null;
    const inbox = planInbox({ seenAt: null, projects: [{ ...project, slug: "demo", name: "Demo", image: null }] })
      .groups.flatMap(group => group.items.map(item => item.kind));
    for (const kind of inbox) expect(REMOTE.has(kind), kind).toBe(false);
    if (band === null || !DB.has(band)) continue;
    if (band === "setup" && role === "EDITOR") expect(inbox).not.toContain("setup");
    else expect(inbox, `${role} ${status} ${band}`).toContain(band);
    checked++;
  }
  // 띠가 DB 할 일인 조합이 실제로 여럿 돈다 — 공허한 통과가 아니다.
  expect(checked).toBeGreaterThan(100);
});
