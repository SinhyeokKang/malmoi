// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { PublicFooter } from "@/components/public-shell/footer";
import { en } from "@/messages/en";

import { find, key, render } from "./helpers/dom";

/**
 * 공개 푸터의 언어 스위처 (ui-locales design §5.1 — F2).
 * ⚠️ 진행 중은 `busy`(aria-disabled + aria-busy)이고 포커스가 트리거에 남는다 — 진짜 `disabled`면 Radix가 메뉴를 닫으며 돌려준 포커스가
 * `body`로 빠진다(POSTMORTEM 2026-09-24). jsdom엔 그 fixup이 없어 아래 observer가 브라우저처럼 떨어뜨린다.
 */
const mocks = vi.hoisted(() => ({ setUiLocale: vi.fn(), error: vi.fn() }));
vi.mock("@/app/ui-locale/actions", () => ({ setUiLocale: mocks.setUiLocale }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

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
  // Radix는 메뉴를 닫은 뒤 다음 태스크에서 트리거로 포커스를 돌려준다 — 그 복귀가 끝난 자리를 잰다.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

it("트리거가 지금 언어의 endonym을 보이고 접근 이름이 'Language: English'다 — aria-label이 아니다", async () => {
  await render(<LocaleSwitcher />);
  expect(trigger().hasAttribute("aria-label")).toBe(false);
  expect(trigger().textContent).toBe("Language: English");
  expect(find(trigger(), ".sr-only").textContent).toBe("Language: ");
  expect(find(trigger(), '[lang="en"]').textContent).toBe("English");
});

it("ko 화면에서는 ko 접두와 ko endonym이다", async () => {
  await render(<LocaleSwitcher />, { uiLocale: "ko" });
  expect(trigger().textContent).toBe("언어: 한국어");
  expect(find(trigger(), '[lang="ko"]').textContent).toBe("한국어");
});

it("메뉴 항목이 셋이고 각각 국기 + lang 붙은 endonym이며 지금 언어에 체크가 선다", async () => {
  await render(<LocaleSwitcher />, { uiLocale: "es" });
  await open();
  expect(items().map((node) => node.textContent)).toEqual(["English", "한국어", "Español"]);
  expect(items().map((node) => node.querySelector("[lang]")?.getAttribute("lang"))).toEqual(["en", "ko", "es"]);
  expect(items().map((node) => (node.querySelector("span[aria-hidden]") as HTMLElement | null)?.style.backgroundImage)).toEqual([
    'url("/flags/gb.svg")', 'url("/flags/kr.svg")', 'url("/flags/es.svg")',
  ]);
  expect(items().map((node) => node.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
});

it("지금 언어를 고르면 Action을 부르지 않는다", async () => {
  await render(<LocaleSwitcher />);
  await open();
  await choose("English");
  expect(mocks.setUiLocale).not.toHaveBeenCalled();
});

it("다른 언어를 고르면 Action을 부르고, 도는 동안 트리거가 busy이며 포커스가 트리거에 남는다", async () => {
  const pending = deferred<string>();
  mocks.setUiLocale.mockReturnValueOnce(pending.promise);
  await render(<LocaleSwitcher />);
  await open();
  await choose("한국어");
  expect(mocks.setUiLocale).toHaveBeenCalledWith("ko");
  expect(trigger().getAttribute("aria-busy")).toBe("true");
  expect(trigger().getAttribute("aria-disabled")).toBe("true");
  expect(trigger().disabled).toBe(false);
  expect(document.activeElement).toBe(trigger());
  // busy 동안 다시 열 수 없다.
  await key(trigger(), "Enter");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  await act(async () => pending.resolve("ok"));
  expect(trigger().hasAttribute("aria-busy")).toBe(false);
  expect(document.activeElement).toBe(trigger());
  expect(mocks.error).not.toHaveBeenCalled();
});

it.each(["failed", "invalid"])("Action이 %s면 오류 토스트를 띄운다 — 트리거는 원래 언어로 남는다", async (result) => {
  mocks.setUiLocale.mockResolvedValueOnce(result);
  await render(<LocaleSwitcher />);
  await open();
  await choose("Español");
  expect(mocks.error).toHaveBeenCalledWith("We couldn't change the language. Try again.");
  expect(trigger().textContent).toBe("Language: English");
});

it("푸터의 마지막 항목이다 — 저작권 · 링크 뒤", async () => {
  const { container } = await render(<PublicFooter m={en} />);
  const footer = find(container, "footer");
  expect(footer.lastElementChild).toBe(trigger());
  expect(footer.textContent).toBe("© 2026 MalmoiGitHubPrivacy PolicyLanguage: English");
});
