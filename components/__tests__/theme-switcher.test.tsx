// @vitest-environment jsdom
import { act, Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ThemeSwitcher } from "@/components/color-scheme/theme-switcher";

import { find, key, render } from "./helpers/dom";

/**
 * 공개 푸터의 테마 스위처 — 언어 스위처(`locale-switcher.test.tsx`)와 같은 프리미티브·같은 진행 형이다.
 * ⚠️ 테마는 Action보다 먼저 `<html data-theme>`에 쓰고 `ok`가 아니면(던짐 포함) 되돌린다 — Theme 카드와 같은 함수를 쓴다.
 * ⚠️ **지금 테마를 prop으로 받지 않는다** — 화면의 유일한 입구가 `<html data-theme>`이다(color-scheme design §3.4). 트리거 라벨은 CSS가 그 속성으로
 * 셋 중 하나만 보이고, 메뉴 체크는 열 때 그 속성을 읽는다. jsdom은 CSS를 계산하지 않으므로 라벨은 클래스로 잰다(실제 보이는 것은 런타임 확인).
 * ⚠️ 진행 중은 `busy`이고 포커스가 트리거에 남는다 — jsdom엔 Radix의 disabled fixup이 없어 아래 observer가 브라우저처럼 떨어뜨린다.
 */
const mocks = vi.hoisted(() => ({ setColorScheme: vi.fn(), error: vi.fn() }));
vi.mock("@/app/color-scheme/actions", () => ({ setColorScheme: mocks.setColorScheme }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

let fixup: MutationObserver;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setColorScheme.mockResolvedValue("ok");
  document.documentElement.dataset.theme = "system";
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches(":disabled")) { active.removeAttribute("disabled"); active.blur(); active.setAttribute("disabled", ""); }
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => {
  fixup.disconnect();
  delete document.documentElement.dataset.theme;
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error === null ? this.props.children : <p data-caught />; }
}

const trigger = () => find<HTMLButtonElement>(document.body, "button[aria-haspopup]");
const items = () => [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
async function open() {
  await act(async () => { trigger().focus(); });
  await key(trigger(), "Enter");
}
async function choose(name: string) {
  const item = items().find((node) => node.textContent === name);
  if (item === undefined) throw new Error(`Missing item ${name}`);
  await key(item, "Enter");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const names = () => [...trigger().querySelectorAll<HTMLElement>(":scope > span:not(.sr-only):not([aria-hidden])")];

it("트리거의 접근 이름은 sr-only 'Theme: ' + 보이는 테마 이름이다 — aria-label이 아니다", async () => {
  await render(<ThemeSwitcher />);
  expect(trigger().hasAttribute("aria-label")).toBe(false);
  expect(find(trigger(), ".sr-only").textContent).toBe("Theme: ");
});

it("이름 셋이 각자 자기 data-theme에서만 보인다 — 서버가 단 `<html data-theme>`과 첫 HTML이 어긋나지 않는다", async () => {
  await render(<ThemeSwitcher />);
  expect(names().map((node) => node.textContent)).toEqual(["System", "Light", "Dark"]);
  expect(names().map((node) => node.className.split(/\s+/))).toEqual([
    expect.arrayContaining(["hidden", "[[data-theme=system]_&]:inline"]),
    expect.arrayContaining(["hidden", "[[data-theme=light]_&]:inline"]),
    expect.arrayContaining(["hidden", "[[data-theme=dark]_&]:inline"]),
  ]);
  // 앞 글리프 묶음은 첫 자식이고 aria-hidden이다 — 진행 중 스피너로 교체되는 자리(`TextTrigger`).
  const glyphs = trigger().firstElementChild as HTMLElement;
  expect(glyphs.getAttribute("aria-hidden")).toBe("true");
  expect([...glyphs.querySelectorAll("svg")].map((svg) => svg.getAttribute("class")?.match(/\[\[data-theme=(\w+)\]_&\]/)?.[1])).toEqual(["system", "light", "dark"]);
});

it("ko 화면에서는 ko 접두와 ko 이름이다", async () => {
  await render(<ThemeSwitcher />, { uiLocale: "ko" });
  expect(find(trigger(), ".sr-only").textContent).toBe("테마: ");
  expect(names().map((node) => node.textContent)).toEqual(["시스템", "라이트", "다크"]);
});

it("메뉴 항목이 System · Light · Dark 셋이고 각각 글리프가 있으며 열 때의 data-theme에 체크가 선다", async () => {
  document.documentElement.dataset.theme = "light";
  await render(<ThemeSwitcher />);
  await open();
  expect(items().map((node) => node.textContent)).toEqual(["System", "Light", "Dark"]);
  expect(items().map((node) => node.querySelectorAll("svg[aria-hidden]").length)).toEqual([1, 1, 1]);
  expect(items().map((node) => node.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
});

it("지금 테마를 고르면 Action을 부르지 않고 화면도 건드리지 않는다", async () => {
  await render(<ThemeSwitcher />);
  await open();
  await choose("System");
  expect(mocks.setColorScheme).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.theme).toBe("system");
});

it("다른 테마를 고르면 화면이 먼저 바뀌고 Action을 부른다 — 도는 동안 busy이고 포커스가 트리거에 남는다", async () => {
  const pending = deferred<string>();
  mocks.setColorScheme.mockReturnValueOnce(pending.promise);
  await render(<ThemeSwitcher />);
  await open();
  await choose("Dark");
  expect(mocks.setColorScheme).toHaveBeenCalledWith("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(trigger().getAttribute("aria-busy")).toBe("true");
  expect(trigger().getAttribute("aria-disabled")).toBe("true");
  expect(trigger().disabled).toBe(false);
  expect(document.activeElement).toBe(trigger());
  await key(trigger(), "Enter");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  await act(async () => pending.resolve("ok"));
  expect(trigger().hasAttribute("aria-busy")).toBe(false);
  expect(document.activeElement).toBe(trigger());
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(mocks.error).not.toHaveBeenCalled();
});

it.each(["failed", "invalid"])("Action이 %s면 화면을 원래 테마로 되돌리고 오류 토스트를 띄운다", async (result) => {
  mocks.setColorScheme.mockResolvedValueOnce(result);
  await render(<ThemeSwitcher />);
  await open();
  await choose("Light");
  expect(document.documentElement.dataset.theme).toBe("system");
  expect(mocks.error).toHaveBeenCalledWith("We couldn't change the theme. Try again.");
});

it("Action이 reject되면 오류 경계가 아니라 토스트이고 화면이 되돌아간다", async () => {
  mocks.setColorScheme.mockRejectedValueOnce(new Error("Failed to fetch"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<Boundary><ThemeSwitcher /></Boundary>);
  await open();
  await choose("Dark");
  error.mockRestore();
  expect(document.querySelector("[data-caught]")).toBeNull();
  expect(document.documentElement.dataset.theme).toBe("system");
  expect(mocks.error).toHaveBeenCalledWith("We couldn't change the theme. Try again.");
  expect(trigger().hasAttribute("aria-busy")).toBe(false);
});

it("메뉴가 위로 열리고 끝 정렬이다 — 푸터가 화면 바닥이고 줄의 마지막 항목이다", async () => {
  await render(<ThemeSwitcher />);
  await open();
  const content = find<HTMLElement>(document.body, '[role="menu"]');
  expect(content.getAttribute("data-side")).toBe("top");
  expect(content.getAttribute("data-align")).toBe("end");
});
