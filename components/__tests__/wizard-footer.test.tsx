// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";
import { WizardFooter } from "@/components/ui/wizard-footer";
import { en } from "@/messages/en";

/**
 * **`nextBlocked`를 주면 [Next]가 `aria-disabled` 갈래다** (sources-add-remove fix1). Add sources ①·②가 꺼진 사유를 describedby로
 * 읽혀야 해서(DESIGN §6.65) 진짜 `disabled`·`loading`을 걸지 않는다 — 걸면 포커스를 못 받아 사유가 닿을 길이 없다.
 * 안 주면 신규 프로젝트의 기존 갈래(진짜 `disabled` + `loading`) 그대로다.
 */
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
const next = () => buttons().find(b => b.textContent?.trim() === en.newProject.modal.next || b.textContent?.trim() === "Add")!;
const back = () => buttons().find(b => b.textContent?.trim() === en.newProject.modal.back)!;
async function click(node: Element) { await act(async () => { await userEvent.setup().click(node); }); }

it("꺼진 aria 갈래 — 포커스를 받고 사유를 가리키며 누르지 않는다", async () => {
  const onNext = vi.fn();
  await render(<><WizardFooter onNext={onNext} nextBlocked nextDescribedBy="reason" /><span id="reason">Why</span></>);
  expect(next().disabled).toBe(false);
  expect(next().getAttribute("aria-disabled")).toBe("true");
  expect(next().getAttribute("aria-describedby")).toBe("reason");
  await click(next());
  expect(onNext).not.toHaveBeenCalled();
});

it("aria 갈래의 진행 중은 busy다 — 스피너·aria-busy이고 진짜 disabled가 아니다, [Back]은 backDisabled를 따른다", async () => {
  const onNext = vi.fn();
  await render(<WizardFooter onNext={onNext} nextBlocked={false} busy showBack onBack={() => {}} backDisabled nextLabel="Add" nextArrow={false} />);
  expect(next().disabled).toBe(false);
  expect(next().getAttribute("aria-busy")).toBe("true");
  expect(next().querySelector(".animate-spin")).not.toBeNull();
  expect(next().querySelector(".lucide-arrow-right")).toBeNull();
  expect(back().disabled).toBe(true);
  await click(next());
  expect(onNext).not.toHaveBeenCalled();
});

it("켜진 aria 갈래는 describedby 없이 누를 수 있다", async () => {
  const onNext = vi.fn();
  await render(<WizardFooter onNext={onNext} nextBlocked={false} />);
  expect(next().getAttribute("aria-disabled")).toBeNull();
  expect(next().hasAttribute("aria-describedby")).toBe(false);
  await click(next());
  expect(onNext).toHaveBeenCalledOnce();
});

it("nextBlocked가 없으면 기존 갈래 그대로 — 꺼짐은 진짜 disabled, 진행 중은 loading, [Back]은 busy로 잠긴다", async () => {
  const view = await render(<WizardFooter onNext={() => {}} nextDisabled showBack onBack={() => {}} />);
  expect(next().disabled).toBe(true);
  expect(next().hasAttribute("aria-disabled")).toBe(false);
  await view.rerender(<WizardFooter onNext={() => {}} busy showBack onBack={() => {}} />);
  expect(next().disabled).toBe(true);
  expect(back().disabled).toBe(true);
});
