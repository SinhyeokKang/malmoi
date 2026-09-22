// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BaseLanguageForm } from "@/components/sources/base-language-form";
import { render } from "./helpers/dom";
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ updateBaseLocale: mocks.save }));
const props = { slug: "p", surfaceSlug: "web", baseLocale: "en", declaredBaseLocale: "ko", locales: ["en", "ko", "ja"], onPending: vi.fn(), onError: vi.fn(), onSaved: vi.fn() };
const save = () => [...document.querySelectorAll('button')].find(b => b.textContent === "Save")!;
let fixup: MutationObserver;
beforeEach(() => { vi.clearAllMocks(); fixup = new MutationObserver(() => { const active = document.activeElement; if (active instanceof HTMLElement && active.matches(':disabled')) { active.removeAttribute('disabled'); active.blur(); active.setAttribute('disabled', ''); } }); fixup.observe(document.body, { attributes: true, attributeFilter: ['disabled'], subtree: true }); });
afterEach(() => { fixup.disconnect(); });
async function pick(code: string) { await act(async () => { const user = userEvent.setup(); await user.click(document.querySelector('[role="combobox"]')!); await user.click([...document.querySelectorAll('[role="option"]')].find(n => n.textContent === code)!); }); }
it("선언값에서 시작하고 적용값 재선택으로 대기를 취소한다", async () => {
  mocks.save.mockResolvedValue({ ok: true });
  await render(<BaseLanguageForm {...props} />);
  expect(document.querySelector('[role="combobox"]')?.textContent).toBe("ko");
  expect(save().disabled).toBe(true);
  await pick("en");
  await act(async () => { await userEvent.setup().click(save()); });
  expect(mocks.save).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", baseLocale: "en" });
  expect(props.onSaved).toHaveBeenCalledTimes(1);
});
it("저장 중 새 서버값 뒤 거부하면 입력 유지·최신 기준·Save 포커스를 보존한다", async () => {
  let resolve!: (r: unknown) => void;
  mocks.save.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = await render(<BaseLanguageForm {...props} />);
  await pick("en");
  await act(async () => { await userEvent.setup().click(save()); });
  expect(save().disabled).toBe(true);
  expect(document.activeElement).not.toBe(save());
  await view.rerender(<BaseLanguageForm {...props} declaredBaseLocale="ja" />);
  await act(async () => { resolve({ ok: false, error: "orphaned-locale" }); });
  expect(document.querySelector('[role="combobox"]')?.textContent).toBe("en");
  expect(document.activeElement).toBe(save());
  await pick("ja");
  expect(save().disabled).toBe(true);
});
it("성공 후 낡은 props와 통신 실패가 저장된 입력을 되돌리지 않는다", async () => {
  mocks.save.mockResolvedValue({ ok: true });
  const view = await render(<BaseLanguageForm {...props} />);
  await pick("en");
  await act(async () => { await userEvent.setup().click(save()); });
  await view.rerender(<BaseLanguageForm {...props} />);
  expect(document.querySelector('[role="combobox"]')?.textContent).toBe("en");
  mocks.save.mockRejectedValue(new Error("network"));
  await pick("ja");
  await act(async () => { await userEvent.setup().click(save()); });
  expect(document.querySelector('[role="combobox"]')?.textContent).toBe("ja");
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
});
it("활성 언어가 없으면 포인터·클릭·키보드 모두 Select를 열지 않는다", async () => {
  await render(<BaseLanguageForm {...props} baseLocale={null} declaredBaseLocale={null} locales={[]} />);
  const select = document.querySelector<HTMLElement>('[role="combobox"]')!;
  await act(async () => { const user = userEvent.setup(); await user.click(select); select.focus(); await user.keyboard('[Enter][Space][ArrowDown]'); });
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(select.getAttribute('aria-disabled')).toBe('true');
  expect(save().disabled).toBe(true);
});
