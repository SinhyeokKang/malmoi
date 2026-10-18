import { expect, it } from "vitest";
import { neverFilledLocales } from "@/lib/home/attention";
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
it("D5: 재연결 할 일은 아직 Inbox에 노출하지 않는다", () => {
  expect(planInbox({ seenAt: null, projects: [{ ...input, status: "needs_reconnect", attention: [], slug: "demo", name: "Demo", image: null }] })).toEqual({ groups: [], unread: 0 });
});
