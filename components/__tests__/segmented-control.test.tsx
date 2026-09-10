import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl, nextRovingIndex } from "@/components/ui/segmented-control";

/**
 * `role="radiogroup"`을 선언했으면 **라디오의 키보드 계약도 들어야 한다** (Codex 리뷰 2026-09-11 실측:
 * `/projects/order-check`의 General에 포커스를 두고 ArrowRight를 눌러도 포커스도 `aria-checked`도
 * 안 움직였고, 두 버튼이 **둘 다 `tabIndex=0`**이었다).
 *
 * ⚠️ **역할만 바꿔서 도망가지 않는다.** `role`을 빼면 스크린리더가 "하나만 고른다"를 못 읽고,
 * `tablist`로 옮기면 `aria-controls`와 화살표 이동이 **더 큰** 계약이 된다. 실제 동작이 라디오이므로
 * 라디오의 계약을 든다.
 *
 * ⚠️ **네이티브 `<input type="radio">`로 바꾸지 않았다** — 그 형은 시각적으로 숨긴 input에 링을
 * 얹게 되는데, `focus-ring.test.ts`는 여는 `<input>` 태그에서 링 셋을 찾으므로 **보이지 않는 링으로
 * green이 되는** 모양이 된다. 방어선을 화장품으로 만들지 않으려고 roving tabindex를 직접 든다.
 *
 * 근거: https://www.w3.org/WAI/ARIA/apg/patterns/radio/
 */
describe("nextRovingIndex — 순수 판정", () => {
  it("오른쪽·아래는 다음, 왼쪽·위는 이전", () => {
    expect(nextRovingIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextRovingIndex("ArrowDown", 0, 3)).toBe(1);
    expect(nextRovingIndex("ArrowLeft", 1, 3)).toBe(0);
    expect(nextRovingIndex("ArrowUp", 1, 3)).toBe(0);
  });

  /** ⚠️ **라디오 그룹은 순환한다** — 끝에서 멈추면 두 칸짜리 컨트롤에서 한 방향이 죽은 키가 된다. */
  it("끝에서 순환한다", () => {
    expect(nextRovingIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextRovingIndex("ArrowLeft", 0, 3)).toBe(2);
  });

  it("Home·End가 양 끝으로 간다", () => {
    expect(nextRovingIndex("Home", 2, 3)).toBe(0);
    expect(nextRovingIndex("End", 0, 3)).toBe(2);
  });

  /** ⚠️ **모르는 키는 `null`이다** — 0을 돌려주면 Tab·문자 입력이 첫 칸을 고른다. */
  it("그 밖의 키는 판정하지 않는다", () => {
    expect(nextRovingIndex("Tab", 1, 3)).toBeNull();
    expect(nextRovingIndex("a", 1, 3)).toBeNull();
  });

  /** 칸이 없으면 갈 곳도 없다 — 인덱스 계산이 NaN·-1로 새면 `focus()`가 던진다. */
  it("칸이 0개면 판정하지 않는다", () => {
    expect(nextRovingIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

type ButtonProps = {
  role?: string;
  tabIndex?: number;
  "aria-checked"?: boolean;
  onKeyDown?: (event: unknown) => void;
  onClick?: () => void;
};

function buttons(node: ReactNode): ReactElement<ButtonProps>[] {
  const found: ReactElement<ButtonProps>[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<ButtonProps & { children?: ReactNode }>(child)) return;
    if (child.type === "button") found.push(child);
    else found.push(...buttons(child.props.children));
  });
  return found;
}

const OPTIONS = [
  { value: "general", label: "General" },
  { value: "changes", label: "Changes" },
] as const;

function render(value: "general" | "changes", onChange = vi.fn()) {
  const tree = SegmentedControl({ label: "View", value, options: OPTIONS, onChange });
  return { items: buttons(tree), onChange };
}

describe("SegmentedControl — 라디오 그룹의 키보드 계약", () => {
  /**
   * ⚠️ **선택된 칸만 `tabIndex=0`이다.** 전부 0이면 Tab이 그룹 안에서 칸 수만큼 멈춘다 — 라디오
   * 그룹은 Tab 한 번에 들어가고 한 번에 나가는 것이 계약이다.
   */
  it("선택된 칸만 탭 순서에 있다", () => {
    const { items } = render("changes");
    expect(items.map((b) => b.props.tabIndex)).toEqual([-1, 0]);
    expect(items.map((b) => b.props["aria-checked"])).toEqual([false, true]);
  });

  it("방향키가 선택을 옮긴다", () => {
    const { items, onChange } = render("general");
    const focus = vi.fn();
    const preventDefault = vi.fn();
    items[0]?.props.onKeyDown?.({
      key: "ArrowRight",
      preventDefault,
      currentTarget: { parentElement: { children: [{ focus: vi.fn() }, { focus }] } },
    });
    expect(onChange).toHaveBeenCalledWith("changes");
    // ⚠️ **포커스도 따라가야 한다** — 선택만 옮기면 포커스가 `tabIndex=-1`이 된 칸에 남는다.
    expect(focus).toHaveBeenCalled();
    // ⚠️ 방향키의 기본 동작(스크롤)을 막지 않으면 컨트롤이 화면 밖으로 밀린다.
    expect(preventDefault).toHaveBeenCalled();
  });

  it("모르는 키는 아무것도 하지 않는다", () => {
    const { items, onChange } = render("general");
    const preventDefault = vi.fn();
    items[0]?.props.onKeyDown?.({
      key: "Tab",
      preventDefault,
      currentTarget: { parentElement: { children: [] } },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
