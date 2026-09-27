// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectSwitcher } from "@/components/shell/project-switcher";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

import { render } from "./helpers/dom";

/**
 * **LNB 프로젝트 스위처** (2026-09-27 사용자). 필터 메뉴와 같은 `DropdownMenu`이고(새 Popover 프리미티브 없음), 머리의 입력이
 * 목록을 좁힌다. ⚠️ **메뉴의 typeahead가 입력의 글자를 뺏지 않는다** — 입력에서 친 글자는 입력에 남고, 항목에 포커스가 있을 때 친
 * 글자는 입력으로 돌아가 이어 붙는다. Arrow는 입력에서 항목으로 내려간다.
 */
const clicked = vi.hoisted(() => ({ hrefs: [] as string[] }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: { href: string; children: ReactNode; onClick?: (e: unknown) => void }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => { onClick?.(event); event.preventDefault(); clicked.hrefs.push(href); }}
    >
      {children}
    </a>
  ),
}));

const projects = [
  { slug: "bugshot-web", name: "bugshot-web", archived: false, image: null },
  { slug: "malmoi", name: "malmoi", archived: false, image: "https://images.example/malmoi.png" },
  { slug: "old", name: "old-site", archived: true, image: null },
  { slug: "course-chatbot", name: "course-chatbot", archived: false, image: null },
];
const OLD = `old-site${m.projects.status.archived}`;

const trigger = () => document.querySelector<HTMLButtonElement>(`button[aria-label="${m.common.nav.projectSwitcher.label}"]`)!;
const input = () => document.querySelector<HTMLInputElement>('[role="menu"] input')!;
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"]')];
const names = () => items().map((node) => node.textContent?.trim());

async function open() {
  clicked.hrefs = [];
  const user = userEvent.setup();
  await render(<ProjectSwitcher projects={projects} current="malmoi" />);
  await act(async () => user.click(trigger()));
  return user;
}

describe("ProjectSwitcher", () => {
  it("트리거는 이름 있는 ghost 버튼이고, 열면 검색 입력에 포커스가 간다", async () => {
    await open();
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute("aria-label")).toBe(m.common.nav.projectSwitcher.search);
    expect(input().placeholder).toBe(m.common.nav.projectSwitcher.search);
    expect(document.querySelector('[role="menu"] kbd')?.textContent).toBe(m.common.nav.projectSwitcher.escHint);
  });

  it("보관까지 전부이고 보관은 맨 뒤(`/projects` 기본 순서), 지금 프로젝트만 체크다", async () => {
    await open();
    expect(names()).toEqual(["bugshot-web", "malmoi", "course-chatbot", OLD, m.common.nav.newProject]);
    const radios = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(radios.map((r) => [r.textContent?.trim(), r.getAttribute("aria-checked")])).toEqual([
      ["bugshot-web", "false"],
      ["malmoi", "true"],
      ["course-chatbot", "false"],
      [OLD, "false"],
    ]);
    // 지금 프로젝트의 행만 뒤 체크를 든다(썸네일 이미지는 있어도 svg가 아니다).
    expect(radios[1]!.querySelectorAll("svg")).toHaveLength(1);
    expect(radios[0]!.querySelectorAll("svg").length).toBe(1); // 썸네일 폴백의 Box 글리프
  });

  it("각 행은 그 프로젝트의 Home으로, 마지막 행은 New project로 간다", async () => {
    await open();
    const links = items().map((node) => node.getAttribute("href"));
    expect(links).toEqual([routes.project("bugshot-web"), routes.project("malmoi"), routes.project("course-chatbot"), routes.project("old"), routes.newProject()]);
    // 구분선이 New project 앞에 선다.
    const last = items().at(-1)!;
    expect(last.previousElementSibling?.getAttribute("role")).toBe("separator");
  });

  it("입력에 친 글자가 목록을 좁히고, 맞는 것이 없으면 빈 행 하나다", async () => {
    const user = await open();
    await act(async () => user.keyboard("CHAT"));
    expect(input().value).toBe("CHAT");
    expect(names()).toEqual(["course-chatbot", m.common.nav.newProject]);
    await act(async () => user.keyboard("zzz"));
    expect(names()).toEqual([m.common.nav.newProject]);
    expect(document.querySelector('[role="menu"]')?.textContent).toContain(m.common.nav.projectSwitcher.empty);
  });

  it("ArrowDown은 첫 항목으로, 항목에서 친 글자는 입력으로 돌아가 이어 붙고, 첫 항목의 ArrowUp은 입력으로 간다", async () => {
    const user = await open();
    await act(async () => user.keyboard("{ArrowDown}"));
    expect(document.activeElement).toBe(items()[0]);
    await act(async () => user.keyboard("m"));
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe("m");
    expect(names()).toEqual(["malmoi", m.common.nav.newProject]);
    await act(async () => user.keyboard("{ArrowDown}"));
    expect(document.activeElement).toBe(items()[0]);
    await act(async () => user.keyboard("{ArrowUp}"));
    expect(document.activeElement).toBe(input());
  });

  it("입력에서 Enter는 첫 맞는 프로젝트의 Home으로 간다", async () => {
    const user = await open();
    await act(async () => user.keyboard("course{Enter}"));
    expect(clicked.hrefs).toEqual([routes.project("course-chatbot")]);
  });

  it("항목에서 Enter는 그 항목으로 간다", async () => {
    const user = await open();
    await act(async () => user.keyboard("{ArrowDown}{ArrowDown}{Enter}"));
    expect(clicked.hrefs).toEqual([routes.project("malmoi")]);
  });

  it("Esc는 닫고 포커스를 트리거로 돌려주며, 다시 열면 질의가 비어 있다", async () => {
    const user = await open();
    await act(async () => user.keyboard("chat"));
    await act(async () => user.keyboard("{Escape}"));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    await act(async () => user.click(trigger()));
    expect(input().value).toBe("");
    expect(names()).toHaveLength(5);
  });

  /** ⚠️ 보관 행의 배지는 `/projects` 행 칩과 같은 형·같은 키다. 지금 프로젝트가 보관이면 배지 다음에 체크다. */
  it("보관 행은 오른쪽에 Archived 배지를 들고, 지금 프로젝트면 배지 다음에 체크가 선다", async () => {
    clicked.hrefs = [];
    const user = userEvent.setup();
    await render(<ProjectSwitcher projects={projects} current="old" />);
    await act(async () => user.click(trigger()));
    const row = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((r) => r.getAttribute("href") === routes.project("old"))!;
    expect(row.getAttribute("aria-checked")).toBe("true");
    const badge = [...row.children].find((node) => node.textContent === m.projects.status.archived) as HTMLElement;
    expect(badge.className).toContain("px-2");
    expect(badge.className).toContain("text-neutral-400");
    // 배지 → 체크 순서, 체크가 마지막 자식이다.
    expect(badge.nextElementSibling?.tagName.toLowerCase()).toBe("svg");
    expect(row.lastElementChild).toBe(badge.nextElementSibling);
    // 보관 아닌 행엔 배지가 없다.
    const active = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((r) => r.getAttribute("href") === routes.project("malmoi"))!;
    expect(active.textContent).not.toContain(m.projects.status.archived);
  });
});
