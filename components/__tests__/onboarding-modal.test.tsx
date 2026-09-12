// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { OnboardingModal } from "@/components/onboarding/modal";

import { render, find } from "./helpers/dom";

/**
 * 모달 껍데기 (new-project-modal spec 완료 조건 4 · design §2.1·§8).
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

describe("OnboardingModal — 단계 전환이 스크린리더에 닿는다 (design §1.2.1)", () => {
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

describe("OnboardingModal — 높이가 뷰포트에 물린다 (design §8)", () => {
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

  it("`vh`가 아니라 `svh`다 — 리포 관용구가 `svh`이고 셸이 `h-svh`다", async () => {
    await render(shell());

    const panel = find<HTMLElement>(document.body, "[data-onboarding-panel]");
    expect(panel.className).toContain("svh");
    expect(panel.className).not.toMatch(/\d+vh|-vh\b|\(100vh/);
  });
});
