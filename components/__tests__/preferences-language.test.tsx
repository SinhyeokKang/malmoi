// @vitest-environment jsdom
import { act, Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LanguageCard } from "@/components/preferences/language-card";

import { find, key, render } from "./helpers/dom";

/**
 * `/preferences`의 Language 카드 (ui-locales design §5.2 — G2).
 *
 * ⚠️ **고르는 즉시 적용한다** — 그래서 닫힌 트리거의 글자 키 typeahead가 곧 앱 전체 언어 변경이 된다(POSTMORTEM 2026-09-19의 두 번째 경로).
 * ⚠️ 진행 중은 Root `disabled`가 아니라 `RoleSelect` 가드다 — 꺼지면 포커스가 `body`로 빠진다. jsdom엔 그 fixup이 없어 아래 observer가 흉내 낸다.
 */
const mocks = vi.hoisted(() => ({ setUiLocale: vi.fn() }));
vi.mock("@/app/ui-locale/actions", () => ({ setUiLocale: mocks.setUiLocale }));

let fixup: MutationObserver;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setUiLocale.mockResolvedValue("ok");
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches(":disabled")) { active.removeAttribute("disabled"); active.blur(); active.setAttribute("disabled", ""); }
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => fixup.disconnect());

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** transition 안의 예외가 오류 경계로 올라가는지 잰다 — 올라가면 화면 전체가 오류 화면이 된다(audit #24 · R10 🔴1). */
class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error === null ? this.props.children : <p data-caught />; }
}

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

it("트리거 이름은 카드 제목, 설명은 Select 아래 도움말이다 — 라벨 열이 없다", async () => {
  await render(<LanguageCard />);
  const named = document.getElementById(trigger().getAttribute("aria-labelledby") ?? "");
  expect(named?.tagName).toBe("H2");
  expect(named?.textContent).toBe("Language");
  expect(document.getElementById(trigger().getAttribute("aria-describedby") ?? "")?.textContent).toBe("Your projects' languages don't change.");
  expect(find(document.body, "section header").textContent).toContain("The language Malmoi uses on every screen.");
  expect(document.body.querySelector("label")).toBeNull();
});

it("트리거 값이 지금 언어의 국기 + endonym이고, 옵션 셋은 국기 + lang 붙은 endonym이다", async () => {
  await render(<LanguageCard />, { uiLocale: "ko" });
  expect(trigger().textContent).toBe("한국어");
  expect(trigger().querySelector('[lang="ko"]')).not.toBeNull();
  expect((trigger().querySelector("span[aria-hidden]") as HTMLElement | null)?.style.backgroundImage).toBe('url("/flags/kr.svg")');
  await open();
  expect(options().map((node) => node.textContent)).toEqual(["English", "한국어", "Español"]);
  expect(options().map((node) => node.querySelector("[lang]")?.getAttribute("lang"))).toEqual(["en", "ko", "es"]);
  expect(options().map((node) => (node.querySelector("span[aria-hidden]") as HTMLElement | null)?.style.backgroundImage)).toEqual([
    'url("/flags/gb.svg")', 'url("/flags/kr.svg")', 'url("/flags/es.svg")',
  ]);
});

it("다른 언어를 고르면 Action을 부르고, 도는 동안 고른 값을 먼저 보이며 가드가 서고 포커스가 남는다", async () => {
  const pending = deferred<string>();
  mocks.setUiLocale.mockReturnValueOnce(pending.promise);
  await render(<LanguageCard />);
  await choose("Español");
  expect(mocks.setUiLocale).toHaveBeenCalledWith("es");
  expect(trigger().textContent).toBe("Español");
  expect(trigger().getAttribute("aria-busy")).toBe("true");
  expect(trigger().getAttribute("aria-disabled")).toBe("true");
  expect(trigger().disabled).toBe(false);
  expect(document.activeElement).toBe(trigger());
  // 잠긴 동안 다시 열 수 없다.
  await key(trigger(), "ArrowDown");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  await act(async () => pending.resolve("ok"));
  await tick();
  expect(trigger().hasAttribute("aria-busy")).toBe(false);
  expect(document.activeElement).toBe(trigger());
  expect(document.body.querySelector('[data-alert="danger"]')).toBeNull();
});

it("지금 값과 같은 값을 고르면 Action을 부르지 않는다", async () => {
  await render(<LanguageCard />);
  await choose("English");
  expect(mocks.setUiLocale).not.toHaveBeenCalled();
});

it.each(["failed", "invalid"])("Action이 %s면 원래 값으로 돌아가고 카드 notice에 Alert danger inset이 선다", async (result) => {
  mocks.setUiLocale.mockResolvedValueOnce(result);
  await render(<LanguageCard />);
  await choose("한국어");
  expect(trigger().textContent).toBe("English");
  const alert = find<HTMLElement>(document.body, "[data-card-notice] [data-alert]");
  expect(alert.getAttribute("data-alert")).toBe("danger");
  expect(alert.classList).toContain("rounded-none");
  expect(alert.textContent).toBe("We couldn't change the language. Try again.");
  // Dismiss가 없다 — 다시 고를 Select가 바로 아래에 있다.
  expect(alert.querySelector("button")).toBeNull();
});

it("Action이 reject되면(배포 skew·오프라인·5xx) 오류 경계가 아니라 원래 값 + 카드 Alert다", async () => {
  mocks.setUiLocale.mockRejectedValueOnce(new Error("Failed to fetch"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<Boundary><LanguageCard /></Boundary>);
  await choose("Español");
  error.mockRestore();
  expect(document.querySelector("[data-caught]")).toBeNull();
  expect(trigger().textContent).toBe("English");
  expect(trigger().hasAttribute("aria-busy")).toBe(false);
  expect(find(document.body, "[data-card-notice] [data-alert]").textContent).toBe("We couldn't change the language. Try again.");
});

it("실패 뒤 다시 고르면 Alert가 걷힌다", async () => {
  mocks.setUiLocale.mockResolvedValueOnce("failed");
  await render(<LanguageCard />);
  await choose("한국어");
  expect(document.body.querySelector("[data-card-notice]")).not.toBeNull();
  await choose("Español");
  expect(document.body.querySelector("[data-card-notice]")).toBeNull();
});

it("닫힌 트리거에서 글자 키로 값이 바뀌지 않는다 — 즉시 적용이라 Tab으로 지나가다 친 글자가 앱 언어를 바꾸면 안 된다", async () => {
  await render(<LanguageCard />);
  await act(async () => { trigger().focus(); });
  for (const letter of ["e", "E", "k", "한"]) await key(trigger(), letter);
  await tick();
  expect(mocks.setUiLocale).not.toHaveBeenCalled();
  expect(trigger().textContent).toBe("English");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

it("화이트리스트다 — Home·End·PageUp·PageDown·Backspace·좌우 방향키도 닫힌 트리거에서 막힌다", async () => {
  await render(<LanguageCard />);
  await act(async () => { trigger().focus(); });
  for (const name of ["Home", "End", "PageUp", "PageDown", "Backspace", "Delete", "ArrowLeft", "ArrowRight", "Process", "Dead"]) {
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
    await act(async () => { trigger().dispatchEvent(event); });
    expect(event.defaultPrevented, name).toBe(true);
  }
  // 수정자 조합은 브라우저 단축키라 막지 않는다(Cmd+R·Ctrl+L).
  const reload = new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true });
  await act(async () => { trigger().dispatchEvent(reload); });
  expect(reload.defaultPrevented).toBe(false);
  await tick();
  expect(mocks.setUiLocale).not.toHaveBeenCalled();
  expect(trigger().textContent).toBe("English");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

it("닫힌 트리거는 여는 키(Enter·Space·방향키)를 그대로 받는다", async () => {
  for (const opener of ["Enter", " ", "ArrowDown", "ArrowUp"]) {
    const { container } = await render(<LanguageCard />);
    const own = find<HTMLButtonElement>(container, '[role="combobox"]');
    await act(async () => { own.focus(); });
    await key(own, opener);
    expect(own.getAttribute("aria-expanded"), opener).toBe("true");
    await key(document.activeElement ?? own, "Escape");
    container.remove();
  }
});
