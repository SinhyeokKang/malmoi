// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

import { Input } from "@/components/ui/input";

/**
 * **읽기 전용 필드는 클릭으로 받은 포커스에 링을 세우지 않는다** (2026-10-12 사용자). Chrome은 readOnly 입력을
 * 클릭해도 `:focus-visible`을 매치한다(ego-browser 실측 — Chrome 152, 클릭·Tab 둘 다 true) — CSS 하나로는 클릭과
 * 키보드를 가를 수 없어 포인터로 받은 포커스를 `data-pointer-focus`로 표시하고, 링은 그 표시가 있을 때만 끈다.
 * 키보드(Tab)로 들어오면 표시가 없어 링이 그대로다.
 *
 * ⚠️ jsdom은 `:focus-visible`·`:read-only`를 그리지 않는다 — 이 테스트는 속성 배선과 클래스만 본다. 링이
 * 실제로 안 서는지는 Chrome에서 잰다(POSTMORTEM 2026-09-24 "jsdom에서만 참").
 */
const field = (container: HTMLElement) => container.querySelector<HTMLInputElement>("input")!;

it("readOnly 필드를 포인터로 누르면 data-pointer-focus가 서고 blur에서 걷힌다", async () => {
  const { container } = await render(<Input aria-label="Address" readOnly value="acme" />);
  const user = userEvent.setup();
  const input = field(container);
  await user.click(input);
  expect(document.activeElement).toBe(input);
  expect(input.hasAttribute("data-pointer-focus")).toBe(true);
  await user.tab();
  expect(input.hasAttribute("data-pointer-focus")).toBe(false);
});

it("Tab으로 들어온 readOnly 필드에는 표시가 없다 — 키보드 링은 그대로 선다", async () => {
  const { container } = await render(<Input aria-label="Address" readOnly value="acme" />);
  const user = userEvent.setup();
  await user.tab();
  const input = field(container);
  expect(document.activeElement).toBe(input);
  expect(input.hasAttribute("data-pointer-focus")).toBe(false);
});

it("readOnly 필드의 링 끄기는 read-only + data-pointer-focus 조합에만 걸린다", async () => {
  const { container } = await render(<Input aria-label="Address" readOnly value="acme" />);
  const classes = field(container).className.split(/\s+/);
  expect(classes).toContain("read-only:data-[pointer-focus]:focus-visible:ring-0");
  expect(classes).toContain("read-only:data-[pointer-focus]:focus-visible:border-input");
  // 키보드 포커스의 링은 그대로 — 기본 링 클래스가 남아 있다.
  expect(classes).toContain("focus-visible:ring-1");
});

it("편집 가능한 필드는 포인터로 눌러도 표시가 서지 않는다 — 링 동작 불변", async () => {
  const { container } = await render(<Input aria-label="Name" defaultValue="x" />);
  await userEvent.setup().click(field(container));
  expect(field(container).hasAttribute("data-pointer-focus")).toBe(false);
});

it("소비자의 onPointerDown·onBlur는 그대로 불린다", async () => {
  const onPointerDown = vi.fn();
  const onBlur = vi.fn();
  const { container } = await render(<Input aria-label="Address" readOnly value="acme" onPointerDown={onPointerDown} onBlur={onBlur} />);
  const user = userEvent.setup();
  await user.click(field(container));
  await user.tab();
  expect(onPointerDown).toHaveBeenCalledTimes(1);
  expect(onBlur).toHaveBeenCalledTimes(1);
});
