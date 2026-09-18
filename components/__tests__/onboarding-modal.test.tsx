// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { OnboardingModal } from "@/components/onboarding/modal";
import { Button } from "@/components/ui/button";

import { render, find } from "./helpers/dom";

/**
 * 모달 껍데기 (DESIGN §6.7).
 *
 * ⚠️ **소스 스캔으로 나누지 않는다.** `showBack` prop을 세는 것은 "그려 놓고 안 보이는" 경우를 못
 * 잡는다 — 그래서 실제로 렌더해 쿼리한다.
 */
const noop = () => {};

function shell(over: Partial<Parameters<typeof OnboardingModal>[0]> = {}) {
  return (
    <OnboardingModal
      open
      title="New project"
      step={1}
      onNext={noop}
      onClose={noop}
      {...over}
    >
      <p>body</p>
    </OnboardingModal>
  );
}

/** Radix는 `document.body`에 portal한다 — 컨테이너가 아니라 문서에서 찾는다. */
const dialog = () => find<HTMLElement>(document.body, '[role="dialog"]');
const buttonNamed = (name: string): HTMLButtonElement | undefined =>
  [...document.body.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === name);

describe("OnboardingModal — 바닥의 진행 표시", () => {
  it("`Step n of 4`를 렌더한다 — 진행은 이 한 줄이다", async () => {
    await render(shell({ step: 2 }));

    expect(dialog().textContent).toContain("Step 2 of 4");
  });

  it("스텝퍼를 세우지 않는다 — 네 칸이 누를 수 없는 장식이 된다", async () => {
    await render(shell());

    expect(document.body.querySelectorAll('[role="tablist"], [role="list"], ol, ul')).toHaveLength(0);
  });
});

describe("OnboardingModal — [Back]이 서는 자리", () => {
  it("①에는 없다 — 닫는 길은 X·Esc·backdrop이다", async () => {
    await render(shell({ step: 1 }));

    expect(buttonNamed("Back")).toBeUndefined();
  });

  it("④에도 없다 — 되돌릴 것이 없다", async () => {
    await render(shell({ step: 4, showBack: false }));

    expect(buttonNamed("Back")).toBeUndefined();
  });

  it("②③에는 있다", async () => {
    await render(shell({ step: 2, showBack: true, onBack: noop }));

    expect(buttonNamed("Back")).toBeDefined();
  });

  it("④에도 X는 남는다 — 적재 중에도 닫을 수 있다", async () => {
    await render(shell({ step: 4, showBack: false }));

    expect(find(document.body, '[aria-label="Close"]')).toBeDefined();
  });
});

describe("OnboardingModal — [Next]는 껍데기가 소유한다", () => {
  it("`nextDisabled`를 껍데기가 든다 — 단계마다 비활성 모양을 다시 만들지 않는다", async () => {
    await render(shell({ nextDisabled: true }));

    expect(buttonNamed("Next")?.disabled).toBe(true);
  });

  it("라벨을 바꿀 수 있다 — ③은 `Create project`다", async () => {
    await render(shell({ step: 3, nextLabel: "Create project" }));

    expect(buttonNamed("Create project")).toBeDefined();
    expect(buttonNamed("Next")).toBeUndefined();
  });

  it("`nextPending`이면 눌리지 않는다 — 같은 제출이 두 번 나가지 않는다", async () => {
    const onNext = vi.fn();
    await render(shell({ nextPending: true, onNext }));

    buttonNamed("Next")?.click();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("누르면 `onNext`가 불린다", async () => {
    const onNext = vi.fn();
    await render(shell({ onNext }));

    buttonNamed("Next")?.click();
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingModal — 단계 전환이 스크린리더에 닿는다 (DESIGN §6.7)", () => {
  it("`aria-live` 영역이 하나 있고 단계가 바뀌면 새 제목이 거기 쓰인다", async () => {
    const { rerender } = await render(shell({ step: 1, title: "New project" }));
    const live = find<HTMLElement>(document.body, '[aria-live="polite"]');

    await rerender(shell({ step: 2, title: "Which files hold your strings?" }));

    expect(live.textContent).toContain("Which files hold your strings?");
  });

  it("단계가 바뀌면 포커스가 본문 컨테이너로 간다 — 사용자가 바닥에서 헤매지 않는다", async () => {
    const { rerender } = await render(shell({ step: 1 }));

    await rerender(shell({ step: 2, showBack: true, onBack: noop }));

    const body = find<HTMLElement>(document.body, '[data-onboarding-body]');
    expect(body.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(body);
  });

  it("`announce`를 주면 그것도 live 영역에 닿는다 — 로딩→완료 전이가 말해진다", async () => {
    await render(shell({ announce: "Imported 903 keys." }));

    expect(find(document.body, '[aria-live="polite"]').textContent).toContain("Imported 903 keys.");
  });
});

describe("OnboardingModal — 높이가 뷰포트에 물린다 (DESIGN §6.7)", () => {
  it("본문 열이 `min-h-0 flex-1 overflow-y-auto`를 든다 — 없으면 바닥이 화면 밖으로 나간다", async () => {
    await render(shell());

    const body = find<HTMLElement>(document.body, "[data-onboarding-body]");
    for (const cls of ["min-h-0", "flex-1", "overflow-y-auto"]) expect(body.className).toContain(cls);
  });

  it("`bodyScroll`이 `hidden`이면 본문이 스크롤하지 않는다 — 안쪽 요소가 든다 (②④)", async () => {
    await render(shell({ bodyScroll: "hidden" }));

    const body = find<HTMLElement>(document.body, "[data-onboarding-body]");
    expect(body.className).toContain("overflow-hidden");
    expect(body.className).not.toContain("overflow-y-auto");
  });

  /**
   * ⚠️ **폭 800 · 최대 높이 800이다** (2026-09-13 사용자). 폭은 핸드오프 값으로 돌아왔고 — ②의 값 셀이
   * 덜 보이는 것을 감수한 결정이다 — 높이는 **뷰포트만이 아니라 절대값에도** 물린다: 세로로 긴
   * 화면에서 80svh가 800px을 넘어가면 네 단계 중 어느 것도 그 높이를 채우지 못해 빈 판이 된다.
   *
   * ⚠️ **`min-h`에도 800이 들어간다** — CSS에서 `min-height`가 `max-height`를 이기므로, 상한만
   * 800으로 막고 하한을 80svh로 두면 1,100px 화면에서 하한이 이겨 상한이 없는 것과 같아진다.
   */
  it("폭 800 · 높이 상한 800에 물린다", async () => {
    await render(shell());

    const panel = find<HTMLElement>(document.body, "[data-onboarding-panel]");
    expect(panel.className).toContain("max-w-[800px]");
    expect(panel.className).toContain("max-h-[min(800px,");
    expect(panel.className).toContain("min-h-[min(80svh,800px,");
  });

  it("`vh`가 아니라 `svh`다 — 리포 관용구가 `svh`이고 셸이 `h-svh`다", async () => {
    await render(shell());

    const panel = find<HTMLElement>(document.body, "[data-onboarding-panel]");
    expect(panel.className).toContain("svh");
    expect(panel.className).not.toMatch(/\d+vh|-vh\b|\(100vh/);
  });
});

/**
 * ⚠️ **live 영역이 제목을 **상시** 들고 있으면 안 된다** (bugshot-qa 2026-09-13 실측). 모달 텍스트에
 * 제목이 두 번 나왔고 — 헤더의 `Dialog.Title`과 `sr-only` 영역 — 스크린리더가 그것을 두 번 읽는다.
 * 게다가 단계와 무관한 리렌더에도 같은 문장이 다시 낭독된다. **말해야 할 때만 담는다.**
 */
describe("OnboardingModal — live 영역은 전이만 말한다", () => {
  it("처음 열렸을 때는 비어 있다 — 제목은 헤더가 한 번 말한다", async () => {
    await render(shell({ step: 1, title: "New project" }));

    expect(find(document.body, '[aria-live="polite"]').textContent?.trim()).toBe("");
    expect([...document.body.querySelectorAll("*")].filter((n) => n.textContent?.trim() === "New project" && n.children.length === 0)).toHaveLength(1);
  });

  it("같은 단계에서 다시 렌더돼도 다시 말하지 않는다", async () => {
    const { rerender } = await render(shell({ step: 2, title: "Which files hold your strings?", nextDisabled: false }));
    await rerender(shell({ step: 2, title: "Which files hold your strings?", nextDisabled: true }));

    expect(find(document.body, '[aria-live="polite"]').textContent?.trim()).toBe("");
  });
});

describe("primary button state styles", () => {
  it.each([false, true])("keeps active colors and uses opaque muted disabled colors (disabled=%s)", async (disabled) => {
    const { container } = await render(<Button variant="primary" disabled={disabled}>Save</Button>);
    const button = find<HTMLButtonElement>(container, "button");
    expect(button.disabled).toBe(disabled);
    for (const cls of ["bg-primary", "text-primary-foreground", "hover:bg-foreground",
      "disabled:bg-muted", "disabled:text-muted-foreground", "disabled:cursor-not-allowed"]) {
      expect(button.classList.contains(cls)).toBe(true);
    }
    expect(button.className).not.toMatch(/disabled:opacity-/);
  });
});

it("actions null은 Next를 숨기고 명시 슬롯은 기본 버튼을 대체한다", async () => {
  const view = await render(shell({ actions: null, step: undefined }));
  expect(buttonNamed("Next")).toBeUndefined();
  await view.rerender(shell({ actions: <Button>Custom action</Button> }));
  expect(buttonNamed("Next")).toBeUndefined();
  expect(buttonNamed("Custom action")).toBeDefined();
});
