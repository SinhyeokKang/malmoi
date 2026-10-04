// @vitest-environment jsdom
import { act, Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ThemeCard } from "@/components/preferences/theme-card";

import { find, key, render } from "./helpers/dom";

/**
 * `/preferences`의 Theme 카드 (color-scheme design §3.7 · tasks P2-5).
 *
 * ⚠️ **화면은 서버 왕복을 기다리지 않는다** — Action을 부르기 전에 `<html data-theme>`을 먼저 바꾸고, 실패(던짐 포함)면 이전 값으로 되돌린다.
 * 즉시 적용·typeahead 차단·진행 중 가드·실패 Alert는 공용 `PreferenceSelectCard`가 들고, 여기서는 Theme 카드의 조립이 그 가드를 지나는지 잰다.
 * ⚠️ 진행 중은 Root `disabled`가 아니라 `RoleSelect` 가드다 — jsdom엔 포커스 fixup이 없어 아래 observer가 흉내 낸다(Language 카드 테스트와 같다).
 */
const mocks = vi.hoisted(() => ({ setColorScheme: vi.fn() }));
vi.mock("@/app/(edit)/preferences/actions", () => ({ setColorScheme: mocks.setColorScheme }));

let fixup: MutationObserver;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setColorScheme.mockResolvedValue("ok");
  document.documentElement.dataset.theme = "light";
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

const theme = () => document.documentElement.dataset.theme;
const trigger = () => find<HTMLButtonElement>(document.body, '[role="combobox"]');
const options = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];
const tick = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function open() {
  await act(async () => { trigger().focus(); });
  await key(trigger(), "ArrowDown");
}
async function choose(name: string) {
  await open();
  const option = options().find((node) => node.textContent === name);
  if (option === undefined) throw new Error(`Missing option ${name}`);
  await key(option, "Enter");
  await tick();
}

it("카드 제목이 트리거 이름이고, 도움말이 System의 뜻을 말한다", async () => {
  await render(<ThemeCard current="light" />);
  expect(document.getElementById(trigger().getAttribute("aria-labelledby") ?? "")?.textContent).toBe("Theme");
  expect(document.getElementById(trigger().getAttribute("aria-describedby") ?? "")?.textContent).toBe("System follows your device's appearance setting.");
  expect(find(document.body, "section header").textContent).toContain("How Malmoi looks on every screen.");
});

it("트리거 값이 서버가 정한 지금 테마이고, 옵션 셋은 System · Light · Dark 순서에 글리프가 하나씩 붙는다", async () => {
  await render(<ThemeCard current="dark" />);
  expect(trigger().textContent).toBe("Dark");
  // 글리프가 `ItemText` 안이라 트리거 값으로 함께 복제된다(Language 카드의 국기와 같은 자리).
  expect(trigger().querySelector("svg.lucide-moon[aria-hidden]")).not.toBeNull();
  await open();
  expect(options().map((node) => node.textContent)).toEqual(["System", "Light", "Dark"]);
  expect(options().map((node) => node.querySelector("svg")?.getAttribute("class")?.match(/lucide-(monitor|sun|moon)\b/)?.[1])).toEqual(["monitor", "sun", "moon"]);
});

it("고르면 Action보다 먼저 `<html data-theme>`이 바뀌고, 도는 동안 고른 값을 보이며 가드가 서고 포커스가 남는다", async () => {
  const pending = deferred<string>();
  let seen: string | undefined;
  mocks.setColorScheme.mockImplementationOnce(() => { seen = theme(); return pending.promise; });
  await render(<ThemeCard current="light" />);
  await choose("Dark");
  expect(mocks.setColorScheme).toHaveBeenCalledWith("dark");
  expect(seen).toBe("dark");
  expect(theme()).toBe("dark");
  expect(trigger().textContent).toBe("Dark");
  expect(trigger().getAttribute("aria-busy")).toBe("true");
  expect(trigger().disabled).toBe(false);
  expect(document.activeElement).toBe(trigger());
  await key(trigger(), "ArrowDown");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  await act(async () => pending.resolve("ok"));
  await tick();
  expect(theme()).toBe("dark");
  expect(trigger().hasAttribute("aria-busy")).toBe(false);
  expect(document.activeElement).toBe(trigger());
  expect(document.body.querySelector("[data-card-notice]")).toBeNull();
});

it("지금 값과 같은 값을 고르면 Action을 부르지 않고 `data-theme`도 그대로다", async () => {
  await render(<ThemeCard current="light" />);
  await choose("Light");
  expect(mocks.setColorScheme).not.toHaveBeenCalled();
  expect(theme()).toBe("light");
});

it.each(["failed", "invalid"])("Action이 %s면 `data-theme`과 Select가 원래 값으로 돌아가고 카드 Alert가 선다", async (result) => {
  mocks.setColorScheme.mockResolvedValueOnce(result);
  await render(<ThemeCard current="light" />);
  await choose("Dark");
  expect(theme()).toBe("light");
  expect(trigger().textContent).toBe("Light");
  const alert = find<HTMLElement>(document.body, "[data-card-notice] [data-alert]");
  expect(alert.getAttribute("data-alert")).toBe("danger");
  expect(alert.textContent).toBe("We couldn't change the theme. Try again.");
});

it("Action이 reject되어도(배포 skew·오프라인) `data-theme`을 되돌리고 오류 경계가 아니라 카드 Alert다", async () => {
  mocks.setColorScheme.mockRejectedValueOnce(new Error("Failed to fetch"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<Boundary><ThemeCard current="system" /></Boundary>);
  document.documentElement.dataset.theme = "system";
  await choose("Light");
  error.mockRestore();
  expect(document.querySelector("[data-caught]")).toBeNull();
  expect(theme()).toBe("system");
  expect(trigger().textContent).toBe("System");
  expect(find(document.body, "[data-card-notice] [data-alert]").textContent).toBe("We couldn't change the theme. Try again.");
});

it("닫힌 트리거에서 글자 키로 테마가 바뀌지 않는다 — 즉시 적용이라 지나가다 친 글자가 화면 전체를 바꾸면 안 된다", async () => {
  await render(<ThemeCard current="light" />);
  await act(async () => { trigger().focus(); });
  for (const letter of ["d", "D", "s", "Home", "End"]) await key(trigger(), letter);
  await tick();
  expect(mocks.setColorScheme).not.toHaveBeenCalled();
  expect(theme()).toBe("light");
  expect(trigger().textContent).toBe("Light");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

it("ko · es 화면이면 옵션이 그 언어 용어다", async () => {
  const { container } = await render(<ThemeCard current="system" />, { uiLocale: "ko" });
  expect(find(container, "section h2").textContent).toBe("테마");
  await open();
  expect(options().map((node) => node.textContent)).toEqual(["시스템", "라이트", "다크"]);
  await key(document.activeElement ?? trigger(), "Escape");
  container.remove();
  const es = await render(<ThemeCard current="dark" />, { uiLocale: "es" });
  expect(find(es.container, '[role="combobox"]').textContent).toBe("Oscuro");
});
