// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BaseLanguageForm } from "@/components/sources/base-language-form";
import { render } from "./helpers/dom";
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ updateBaseLocale: mocks.save }));
const props = { slug: "p", surfaceSlug: "web", baseLocale: "en", declaredBaseLocale: "ko", locales: ["en", "ko", "ja"], awaiting: true, onPending: vi.fn(), onError: vi.fn(), onSaved: vi.fn(), onDirty: vi.fn() };
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
  expect(document.querySelector('.text-destructive')).not.toBeNull();
});
it("활성 언어가 없으면 포인터·클릭·키보드 모두 Select를 열지 않는다", async () => {
  await render(<BaseLanguageForm {...props} baseLocale={null} declaredBaseLocale={null} locales={[]} awaiting={false} />);
  const select = document.querySelector<HTMLElement>('[role="combobox"]')!;
  await act(async () => { const user = userEvent.setup(); await user.click(select); select.focus(); await user.keyboard('[Enter][Space][ArrowDown]'); });
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(select.getAttribute('aria-disabled')).toBe('true');
  expect(save().disabled).toBe(true);
});
/** 성공하면 Save가 "저장할 것 없음"으로 꺼진다 — 포커스를 방금 고른 필드로 돌려준다 (audit #32). */
it("저장 성공 뒤 꺼진 Save 대신 언어 셀렉트로 착지한다", async () => {
  let resolve!: (r: unknown) => void;
  mocks.save.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<BaseLanguageForm {...props} />);
  await pick("en");
  await act(async () => { await userEvent.setup().click(save()); });
  await act(async () => { resolve({ ok: true }); });
  expect(save().disabled).toBe(true);
  expect(document.activeElement).toBe(document.querySelector('[role="combobox"]'));
});
/**
 * ⚠️ **잠긴 셀렉트가 Tab을 삼키지 않는다** (audit #18) — 포커스는 받아야 사유가 낭독되고, 막을 것은 이 컨트롤의 동작뿐이다
 * (`member-list.tsx`의 형, POSTMORTEM 2026-09-19). 로케일 없음·잠금(저장 대기)·적재 대기 세 상태 모두 앞뒤로 빠져나간다.
 */
async function tabsThrough(select: HTMLElement) {
  const user = userEvent.setup();
  const before = document.createElement("button"); before.textContent = "before";
  const after = document.createElement("button"); after.textContent = "after";
  select.closest("form")!.before(before); select.closest("form")!.after(after);
  await act(async () => { select.focus(); await user.keyboard("[ArrowDown][Enter]"); });
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => { select.focus(); await user.tab({ shift: true }); });
  expect(document.activeElement).toBe(before);
  await act(async () => { select.focus(); await user.tab(); });
  expect(document.activeElement).not.toBe(select);
  before.remove(); after.remove();
}
it("로케일이 없어 잠긴 셀렉트에서 Tab·Shift+Tab으로 빠져나간다", async () => {
  await render(<BaseLanguageForm {...props} baseLocale={null} declaredBaseLocale={null} locales={[]} awaiting={false} />);
  await tabsThrough(document.querySelector<HTMLElement>('[role="combobox"]')!);
});
it("저장 대기로 잠긴 셀렉트에서 Tab·Shift+Tab으로 빠져나가고 값은 그대로다", async () => {
  let resolve!: (r: unknown) => void;
  mocks.save.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<BaseLanguageForm {...props} />);
  await pick("en");
  await act(async () => { await userEvent.setup().click(save()); });
  const select = document.querySelector<HTMLElement>('[role="combobox"]')!;
  expect(select.getAttribute("aria-disabled")).toBe("true");
  await tabsThrough(select);
  expect(select.textContent).toBe("en");
  await act(async () => { resolve({ ok: true }); });
});
it("적재 대기(잠기지 않음) 셀렉트도 Tab·Shift+Tab으로 빠져나간다", async () => {
  await render(<BaseLanguageForm {...props} />);
  const select = document.querySelector<HTMLElement>('[role="combobox"]')!;
  const user = userEvent.setup();
  const before = document.createElement("button"); select.closest("form")!.before(before);
  await act(async () => { select.focus(); await user.tab({ shift: true }); });
  expect(document.activeElement).toBe(before);
  await act(async () => { select.focus(); await user.tab(); });
  expect(document.activeElement).not.toBe(select);
  before.remove();
});
/**
 * [malmoi#127] **도움말이 실제 트리거를 댄다** — 선언은 리포 GitHub Actions 워크플로의 다음 Sync에서만 현실이 되고, 앱의 [Sync]는
 * 저장된 기준 언어로 읽는다(`lib/import/run.ts`). "the next sync from the repository"는 바로 옆의 [Sync] 버튼으로 읽혀 네 번 눌러도 안 풀렸다.
 */
it("도움말은 GitHub Actions 워크플로를 트리거로 대고 Sync 버튼이 적용하지 않는다고 말한다", async () => {
  await render(<BaseLanguageForm {...props} />);
  const text = document.body.textContent ?? "";
  expect(text).toContain("GitHub Actions workflow");
  expect(text).toContain("not the Sync button");
  expect(text).not.toContain("next sync from the repository");
});
/**
 * r4 — **OWNER에게는 워크플로 줄도 말한다.** 워크플로가 `base-locale:`을 박으므로(`lib/onboarding/workflow.ts`) 옛 값을 보내는 CI push는
 * 선언을 적용하지 않는다. 가이드 `setup/sources.md#base-language` 2단계와 같은 할 일이다. 번역자 배너는 이 줄을 싣지 않는다.
 */
it("도움말은 워크플로의 base-locale: 값도 바꾸라고 말한다", async () => {
  await render(<BaseLanguageForm {...props} />);
  expect(document.body.textContent).toContain("update the workflow's base-locale: value to match");
});
