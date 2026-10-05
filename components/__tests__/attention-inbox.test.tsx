// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { AttentionBadgeResult, OpenAttentionInboxResult } from "@/app/(edit)/inbox/actions";
import { AttentionInbox } from "@/components/shell/attention-inbox";
import { attentionHref } from "@/lib/home/attention-view";
import type { InboxPlan } from "@/lib/inbox/plan";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";

import { render } from "./helpers/dom";

/**
 * attention-inbox T8b — 헤더 Inbox 트리거·드롭다운의 결정적 동작(시안 H1–H3 · D1–D7). 라이트·다크·실제 폭은 런타임(b) 몫이다.
 * ⚠️ **pending promise는 테스트 끝에서 푼다**(POSTMORTEM 2026-09-18) — 안 끝난 async transition이 다음 테스트를 붙잡는다.
 */
const mocks = vi.hoisted(() => ({ badge: vi.fn(), open: vi.fn() }));
vi.mock("@/app/(edit)/inbox/actions", () => ({ loadAttentionBadgeAction: mocks.badge, openAttentionInboxAction: mocks.open }));

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const pending: Deferred<OpenAttentionInboxResult>[] = [];
function nextOpen(): Deferred<OpenAttentionInboxResult> {
  const d = deferred<OpenAttentionInboxResult>();
  pending.push(d);
  mocks.open.mockImplementationOnce(() => d.promise);
  return d;
}

const loadedAt = new Date("2026-10-05T12:00:00Z");
const ago = (minutes: number) => new Date(loadedAt.getTime() - minutes * 60_000);
const PLAN: InboxPlan = {
  unread: 3,
  groups: [
    { project: { slug: "storefront", name: "Storefront", image: null }, items: [
      { kind: "import_failed", at: ago(12), surfaceSlug: "web", reason: "parse-failed", unread: true, ownerRetries: false },
      { kind: "review", at: ago(180), surfaceSlug: "web", code: "ko", name: "Korean", count: 8, who: "Kim", unread: false, ownerRetries: false },
      { kind: "unsent", at: ago(300), count: 3, surfaceSlug: "web", unread: false, ownerRetries: false },
    ] },
    { project: { slug: "mobile", name: "Mobile app", image: null }, items: [
      { kind: "import_failed", at: ago(20), surfaceSlug: "app", reason: "partial-import", unread: true, ownerRetries: true },
      { kind: "never_filled", at: ago(1440), surfaceSlug: "app", code: "fr", name: "French", keys: 903, unread: true, ownerRetries: false },
    ] },
  ],
};
const ok = (plan: InboxPlan = PLAN, marked = true): OpenAttentionInboxResult => ({ status: "ok", plan, loadedAt, marked });

beforeEach(() => {
  mocks.badge.mockReset().mockResolvedValue({ status: "ok", unread: 0 } satisfies AttentionBadgeResult);
  mocks.open.mockReset();
});
afterEach(async () => {
  for (const d of pending.splice(0)) await act(async () => { d.resolve({ status: "failed" }); });
});

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const items = () => [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
const badgeNode = () => trigger().querySelector<HTMLElement>("[data-inbox-badge]");
async function mount(unread = 0) {
  mocks.badge.mockResolvedValue({ status: "ok", unread });
  const view = await render(<AttentionInbox />);
  await act(async () => {});
  return view;
}
async function openMenu() { await act(async () => { await userEvent.setup().click(trigger()); }); }
async function escape() { await act(async () => { await userEvent.setup().keyboard("{Escape}"); }); }
async function settle(d: Deferred<OpenAttentionInboxResult>, value: OpenAttentionInboxResult) { await act(async () => { d.resolve(value); }); }

it("마운트는 배지 조회 한 번이고 open Action을 부르지 않는다 — 안 읽음 0이면 icon-md 정사각에 배지가 없다", async () => {
  await mount(0);
  expect(mocks.badge).toHaveBeenCalledTimes(1);
  expect(mocks.open).not.toHaveBeenCalled();
  expect(trigger().getAttribute("aria-label")).toBe(en.inbox.label);
  expect(trigger().classList.contains("size-8")).toBe(true);
  expect(trigger().classList.contains("w-auto")).toBe(false);
  expect(badgeNode()).toBeNull();
  // 글리프는 늘 foreground이고 hover·열림 면은 New project 링크와 같은 3%다(ghost 기본을 덮는다).
  for (const token of ["text-foreground", "hover:bg-foreground/[0.03]", "data-[state=open]:bg-foreground/[0.03]"]) expect(trigger().classList, token).toContain(token);
  expect(trigger().classList).not.toContain("text-muted-foreground");
});

it("안 읽음이 있으면 버튼이 넓어지고 배지는 버튼 안의 aria-hidden 자식 하나다 — 이름은 실제 수를 읽는다", async () => {
  await mount(12);
  expect(trigger().getAttribute("aria-label")).toBe(en.inbox.labelUnread(12));
  for (const token of ["w-auto", "px-1.5", "gap-1"]) expect(trigger().classList, token).toContain(token);
  const badge = badgeNode()!;
  expect(badge.textContent).toBe("9+");
  expect(badge.getAttribute("aria-hidden")).toBe("true");
  // 형제 금지(POSTMORTEM 2026-09-09) — 버튼의 자식은 글리프와 배지 둘이고 버튼 밖에 붙은 노드가 없다.
  expect(trigger().children).toHaveLength(2);
  expect(trigger().parentElement?.children).toHaveLength(1);
});

it("열 때마다 open Action이 한 번 — 다시 열면 다시 한 번, 목록 도착 전에 닫아도 한 번이다", async () => {
  await mount(2);
  const first = nextOpen();
  await openMenu();
  expect(mocks.open).toHaveBeenCalledTimes(1);
  await escape();
  expect(menu()).toBeNull();
  expect(mocks.open).toHaveBeenCalledTimes(1);
  // 닫힌 뒤 도착한 marked 응답은 도착 즉시 배지를 지운다.
  expect(badgeNode()).not.toBeNull();
  await settle(first, ok());
  expect(badgeNode()).toBeNull();
  expect(trigger().getAttribute("aria-label")).toBe(en.inbox.label);
  const second = nextOpen();
  await openMenu();
  expect(mocks.open).toHaveBeenCalledTimes(2);
  await settle(second, ok());
});

it("배지는 열린 동안 그대로이고 marked면 닫는 순간 사라진다", async () => {
  await mount(3);
  const d = nextOpen();
  await openMenu();
  await settle(d, ok());
  expect(items().length).toBeGreaterThan(0);
  expect(badgeNode()?.textContent).toBe("3");
  expect(trigger().classList).toContain("w-auto");
  await escape();
  expect(badgeNode()).toBeNull();
  expect(trigger().classList).not.toContain("w-auto");
});

it.each([
  ["marked: false", ok(PLAN, false)],
  ["failed", { status: "failed" } as const],
])("%s면 닫아도 배지가 남는다", async (_label, result) => {
  await mount(3);
  const d = nextOpen();
  await openMenu();
  await settle(d, result);
  await escape();
  expect(badgeNode()?.textContent).toBe("3");
});

it("행 — 프로젝트 묶음 머리, 같은 목적지, 안 읽음 점과 sr 낱말, 검토 대기는 점이 없고 EDITOR 실패에 Owner 줄이 붙는다", async () => {
  await mount(3);
  const d = nextOpen();
  await openMenu();
  await settle(d, ok());
  const groups = [...menu()!.querySelectorAll<HTMLElement>('[role="group"]')];
  expect(groups.map(group => document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Storefront", "Mobile app"]);
  const rows = items();
  expect(rows).toHaveLength(5);
  const all = PLAN.groups.flatMap(group => group.items.map(item => ({ slug: group.project.slug, item })));
  expect(rows.map(row => row.getAttribute("href"))).toEqual(all.map(({ slug, item }) => attentionHref(slug, item)));
  rows.forEach((row, index) => {
    const unread = all[index]!.item.unread;
    expect(row.querySelectorAll("[data-unread-dot]"), `row ${index}`).toHaveLength(unread ? 1 : 0);
    // 접근 이름 맨 앞이 sr `Unread`다 — 점은 장식이다.
    const sr = row.querySelector(".sr-only");
    if (unread) expect(row.textContent!.startsWith(en.inbox.unread)).toBe(true);
    else expect(sr?.textContent ?? "").not.toBe(en.inbox.unread);
  });
  expect(rows[1]!.textContent).toContain(en.home.attention.review.body(8));
  expect(rows[1]!.querySelector("[data-unread-dot]")).toBeNull();
  expect(rows[2]!.textContent).toContain(en.projects.banner.unsent(3));
  const ownerLines = rows.map(row => row.textContent!.includes(en.projects.importFailure.ownerRetries));
  expect(ownerLines).toEqual([false, false, false, true, false]);
  // 프로젝트 단위 항목은 이름을 다시 쓰지 않는다 — 보조줄은 대상 표면 slug다.
  expect(rows[2]!.textContent).not.toContain("Storefront");
});

it("항목 0이면 빈 상태 — Home 제목과 Inbox 보조 문장, 메뉴 항목 없음", async () => {
  await mount(0);
  const d = nextOpen();
  await openMenu();
  await settle(d, ok({ groups: [], unread: 0 }));
  expect(menu()!.textContent).toContain(en.home.attention.empty.title);
  expect(menu()!.textContent).toContain(en.inbox.emptyDescription);
  expect(items()).toHaveLength(0);
});

it("첫 조회 전엔 골격 + aria-busy + sr 상태 문장이고 메뉴 항목이 0이다", async () => {
  await mount(0);
  nextOpen();
  await openMenu();
  const busy = menu()!.querySelector('[aria-busy="true"]');
  expect(busy).not.toBeNull();
  const status = [...menu()!.querySelectorAll('[role="status"]')].find(node => node.textContent === en.inbox.loading);
  expect(status?.classList.contains("sr-only")).toBe(true);
  expect(menu()!.querySelectorAll("[data-skeleton-line]").length).toBeGreaterThan(0);
  expect(items()).toHaveLength(0);
});

it("오류면 CommandStatus danger 줄 + Try again 메뉴 항목 — ↓로 닿고 Enter로 다시 조회하며 시도 중엔 disabled다", async () => {
  await mount(0);
  const first = nextOpen();
  await openMenu();
  await settle(first, { status: "failed" });
  const line = menu()!.querySelector<HTMLElement>('[data-tone="danger"]');
  expect(line?.textContent).toBe(en.inbox.failed);
  expect(line?.closest('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
  expect(items().map(item => item.textContent)).toEqual([en.common.retry]);
  await act(async () => { await userEvent.setup().keyboard("{ArrowDown}"); });
  const retry = items()[0]!;
  expect(document.activeElement).toBe(retry);
  const second = nextOpen();
  await act(async () => { await userEvent.setup().keyboard("{Enter}"); });
  expect(mocks.open).toHaveBeenCalledTimes(2);
  expect(menu()).not.toBeNull();
  expect(items()[0]!.getAttribute("aria-disabled")).toBe("true");
  expect(items()[0]!.querySelector(".animate-spin")).not.toBeNull();
  await settle(second, ok());
  expect(items()).toHaveLength(5);
});

it("두 번째 열기는 골격 없이 받은 목록을 바로 보이고, 응답이 와도 포커스된 항목이 같은 노드다", async () => {
  await mount(3);
  const first = nextOpen();
  await openMenu();
  await settle(first, ok());
  await escape();
  const second = nextOpen();
  await openMenu();
  expect(menu()!.querySelectorAll("[data-skeleton-line]")).toHaveLength(0);
  expect(items()).toHaveLength(5);
  await act(async () => { await userEvent.setup().keyboard("{ArrowDown}"); });
  const focused = document.activeElement;
  expect(items()).toContain(focused);
  await settle(second, ok({ ...PLAN, groups: PLAN.groups.map(group => ({ ...group, items: group.items.map(item => ({ ...item, unread: false })) })) }));
  expect(document.activeElement).toBe(focused);
  expect(focused?.isConnected).toBe(true);
});

it("Esc로 닫으면 포커스가 트리거로 돌아온다", async () => {
  await mount(0);
  const d = nextOpen();
  await openMenu();
  await settle(d, ok());
  await act(async () => { await userEvent.setup().keyboard("{ArrowDown}"); });
  expect(items()).toContain(document.activeElement);
  await escape();
  expect(document.activeElement).toBe(trigger());
});

it("한 번 열고 닫아도 셸이 산다 — 트리거가 그대로 다시 열린다", async () => {
  await mount(0);
  const first = nextOpen();
  await openMenu();
  await settle(first, ok());
  await escape();
  expect(trigger().isConnected).toBe(true);
  const second = nextOpen();
  await openMenu();
  expect(menu()).not.toBeNull();
  await settle(second, ok());
});

it("ko 사전으로 이름이 바뀐다", async () => {
  mocks.badge.mockResolvedValue({ status: "ok", unread: 2 });
  await render(<AttentionInbox />, { uiLocale: "ko" });
  await act(async () => {});
  // ko 사전은 비동기 로더라 조건으로 기다린다(POSTMORTEM 2026-10-05).
  for (let tries = 0; trigger()?.getAttribute("aria-label") !== ko.inbox.labelUnread(2) && tries < 50; tries++) await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  expect(trigger().getAttribute("aria-label")).toBe(ko.inbox.labelUnread(2));
});

it("Inbox 소스는 행 형 클래스를 직접 쓰지 않는다 — 행·그룹은 프리미티브가 든다", () => {
  const source = readFileSync(join(process.cwd(), "components/shell/attention-inbox.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
  for (const token of ["px-4", "py-2.5", "py-row-y", "bg-foreground/[0.07]", "data-[highlighted]", "border-divider"]) expect(source, token).not.toContain(token);
  for (const primitive of ["<ListGroup", "<DropdownMenuRow", "<CommandStatus"]) expect(source, primitive).toContain(primitive);
});
