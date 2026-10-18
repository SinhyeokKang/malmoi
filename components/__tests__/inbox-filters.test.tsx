// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { InboxFilters } from "@/components/inbox/inbox-filters";
import { inboxFilterOptions, inboxQuery, parseInboxFilter, type InboxFilter } from "@/lib/inbox/filter";
import type { InboxPlan } from "@/lib/inbox/plan";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";
import { find, key, render } from "./helpers/dom";

vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
beforeEach(() => { mocks.push.mockReset(); });

const LONG = "A very long project name that must keep its full accessible label";
const PLAN: InboxPlan = { unread: 1, groups: [
  { project: { slug: "web", name: LONG, image: "/project.webp", reconnect: "settings" }, items: [
    { kind: "unsent", at: null, count: 2, surfaceSlug: "main", unread: true, ownerRetries: false },
  ] },
  { project: { slug: "docs", name: "Docs", image: null, reconnect: "home" }, items: [
    { kind: "review", at: new Date("2026-10-18T00:00:00Z"), surfaceSlug: "main", code: "ja", name: "Japanese", count: 3, who: null, unread: false, ownerRetries: false },
  ] },
] };
const options = inboxFilterOptions(PLAN);
const initial = parseInboxFilter({});
const view = (filter = initial) => <InboxFilters filter={filter} options={options} />;
const button = (container: ParentNode, axis: string) => find<HTMLButtonElement>(container, `button[aria-label^="${axis}:"]`);
const item = (text: string) => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(node => node.textContent === text)!;

it("기본 필터 둘은 직속 버튼이고 Clear 없이 검색320과 감김 줄을 보인다", async () => {
  const { container } = await render(view());
  const row = find(container, "[data-inbox-filter-row]");
  expect(row.className).toBe("flex flex-wrap items-center gap-2");
  expect(row.querySelectorAll(":scope > button")).toHaveLength(2);
  expect(button(row, en.logs.filters.axis.kind).textContent).toBe(en.inbox.filters.all);
  expect(button(row, en.inbox.filters.axis.project).textContent).toBe(en.inbox.filters.anyProject);
  const search = find<HTMLInputElement>(row, 'input[type="search"]');
  expect(search.getAttribute("aria-label")).toBe(en.inbox.search.label);
  expect(search.placeholder).toBe(en.inbox.search.placeholder);
  expect(search.classList.contains("w-80")).toBe(true);
  expect(search.parentElement!.parentElement!.classList.contains("ml-auto")).toBe(true);
  expect(container.textContent).not.toContain(en.inbox.filters.clear);
});

it("종류는 원래 계획의 값만 있고 단일 선택·해제는 URL을 보존하며 트리거로 복귀한다", async () => {
  const user = userEvent.setup();
  const filter: InboxFilter = { kind: null, projects: ["web"], q: "main" };
  const { container, rerender } = await render(view(filter));
  const trigger = button(container, en.logs.filters.axis.kind);
  await act(async () => { trigger.focus(); await user.keyboard("{Enter}"); });
  expect([...document.querySelectorAll('[role="menuitemradio"]')].map(node => node.textContent)).toEqual([
    en.inbox.filters.all, en.inbox.filters.kinds.publish, en.inbox.filters.kinds.review,
  ]);
  await act(async () => { await user.keyboard("{ArrowDown}{Enter}"); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery({ ...filter, kind: "publish" })));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await rerender(view({ ...filter, kind: "publish" }));
  await act(async () => { await user.click(trigger); });
  expect(item(en.inbox.filters.kinds.publish).getAttribute("aria-checked")).toBe("true");
  await act(async () => { await user.click(item(en.inbox.filters.all)); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery(filter)));
});

it("프로젝트 체크박스는 썸네일·전체 이름을 갖고 push 후에도 다음 항목과 Esc 복귀를 유지한다", async () => {
  const user = userEvent.setup();
  const filter: InboxFilter = { ...initial, kind: "publish", q: "main" };
  const { container, rerender } = await render(view(filter));
  const trigger = button(container, en.inbox.filters.axis.project);
  await act(async () => { trigger.focus(); await user.keyboard("{Enter}"); });
  const checks = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
  expect(checks.map(node => node.textContent)).toEqual([LONG, "Docs"]);
  expect(checks[0]!.querySelector('img[src="/project.webp"]')).not.toBeNull();
  expect(checks[0]!.querySelector("span.min-w-0.flex-1.truncate")).not.toBeNull();
  await act(async () => { await user.keyboard("{Enter}"); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery({ ...filter, projects: ["web"] })));
  await rerender(view({ ...filter, projects: ["web"] }));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(checks[0]!.getAttribute("aria-checked")).toBe("true");
  expect(trigger.getAttribute("aria-label")).toBe(`Project: ${LONG}`);
  expect(trigger.classList.contains("max-w-60")).toBe(true);
  expect(trigger.querySelector("span.truncate")).not.toBeNull();
  await act(async () => { await user.keyboard("{ArrowDown}"); });
  expect(document.activeElement).toBe(checks[1]);
  await act(async () => { await user.keyboard("{Enter}"); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery({ ...filter, projects: ["web", "docs"] })));
  await rerender(view({ ...filter, projects: ["docs", "web"] }));
  expect(trigger.getAttribute("aria-label")).toBe(`Project: Docs, ${LONG}`);
  await act(async () => { await user.keyboard("{Escape}"); });
  expect(document.activeElement).toBe(trigger);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("프로젝트 제거와 Clear projects는 다른 축을 유지한다", async () => {
  const user = userEvent.setup();
  const filter: InboxFilter = { kind: "review", projects: ["docs", "web"], q: "ja" };
  const { container, rerender } = await render(view(filter));
  const trigger = button(container, en.inbox.filters.axis.project);
  await act(async () => { await user.click(trigger); await user.click(item("Docs")); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery({ ...filter, projects: ["web"] })));
  await rerender(view({ ...filter, projects: ["web"] }));
  await act(async () => { await user.click(item(en.inbox.filters.clearProjects)); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery({ ...filter, projects: [] })));
  expect(document.activeElement).toBe(trigger);
});

it("검색 Enter·IME·Esc와 바깥 URL 변경은 공용 SearchInput을 지나고 포커스를 유지한다", async () => {
  const user = userEvent.setup();
  const filter: InboxFilter = { kind: "review", projects: ["docs"], q: null };
  const { container, rerender } = await render(view(filter));
  const search = find<HTMLInputElement>(container, 'input[type="search"]');
  await act(async () => { await user.type(search, " Japanese "); });
  expect(mocks.push).not.toHaveBeenCalled();
  await key(search, "Enter", { isComposing: true });
  await key(search, "Enter", { keyCode: 229 });
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => { await user.keyboard("{Enter}"); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery({ ...filter, q: "Japanese" })));
  await rerender(view({ ...filter, q: "Japanese" }));
  expect(document.activeElement).toBe(search);
  await act(async () => { await user.keyboard("{Escape}"); });
  expect(mocks.push).toHaveBeenLastCalledWith(routes.inbox(inboxQuery(filter)));
  expect(search.value).toBe("");
  await rerender(view({ ...filter, q: "ja" }));
  expect(search.value).toBe("ja");
  expect(document.activeElement).toBe(search);
});

it("Clear filters는 busy 중 포커스와 중복 클릭 차단을 유지하고 모든 축을 지운다", async () => {
  let finish!: () => void;
  mocks.push.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const user = userEvent.setup();
  const { container } = await render(view({ kind: "review", projects: ["docs"], q: "ja" }));
  const clear = [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === en.inbox.filters.clear)!;
  await act(async () => { await user.click(clear); });
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(routes.inbox());
  expect(clear.getAttribute("aria-busy")).toBe("true");
  expect(clear.getAttribute("aria-disabled")).toBe("true");
  expect(clear.disabled).toBe(false);
  expect(document.activeElement).toBe(clear);
  await act(async () => { await user.click(clear); });
  expect(mocks.push).toHaveBeenCalledOnce();
  await act(async () => { finish(); });
  expect(clear.hasAttribute("aria-busy")).toBe(false);
  expect(document.activeElement).toBe(clear);
});

it("필터는 페이지 전용이며 계획·조회·헤더 Inbox에는 들어가지 않는다", () => {
  for (const file of ["lib/inbox/plan.ts", "lib/inbox/load.ts", "components/shell/attention-inbox.tsx"]) {
    expect(readFileSync(file, "utf8"), file).not.toMatch(/filterInbox|inbox\/filter/);
  }
});


it("빈 계획도 필터 둘을 열 수 있고 프로젝트 메뉴에는 가짜 항목이 없다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<InboxFilters filter={initial} options={{ kinds: [], projects: [] }} />);
  const project = button(container, en.inbox.filters.axis.project);
  expect(project.disabled).toBe(false);
  await act(async () => { project.focus(); await user.keyboard("{Enter}"); });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(document.querySelectorAll('[role^="menuitem"]')).toHaveLength(0);
  await act(async () => { await user.keyboard("{Escape}"); });
  expect(document.activeElement).toBe(project);
  const kind = button(container, en.logs.filters.axis.kind);
  await act(async () => { await user.click(kind); });
  expect([...document.querySelectorAll('[role="menuitemradio"]')].map(node => node.textContent)).toEqual([en.inbox.filters.all]);
  expect(mocks.push).not.toHaveBeenCalled();
});
