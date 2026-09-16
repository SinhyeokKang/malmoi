// @vitest-environment jsdom
import { Fragment, createElement as h } from "react";
import { describe, expect, it } from "vitest";

import { SHELL_HANDLE_PX, SHELL_SIDEBAR_PX, ShellPanels } from "@/components/shell/shell-panels";

import { ContentPanel } from "@/components/shell/content-panel";

import { find, render } from "./helpers/dom";

/**
 * **LNB ↔ 콘텐츠 사이의 구분선** — 셸의 행이 `flex gap-2`에서 `PanelGroup`이 된다.
 *
 * ⚠️ **`gap`을 핸들 폭으로 흡수한다.** flex `gap` **안에** 핸들을 그냥 끼우면 간격이
 * `gap + 핸들 + gap`이 된다. 그래서 행의 `gap-2`를 떼고 핸들을 그 폭(8px)의 투명 스트립으로 만들어
 * 바를 중앙에 둔다 — 변경 전후로 눈에 보이는 간격이 같다.
 */
async function mount() {
  return render(
    h(ShellPanels, {
      sidebar: h("aside", { "data-test": "sidebar" }, "nav"),
      children: h("main", null, "content"),
    }),
  );
}

describe("ShellPanels — LNB 구분선", () => {
  it("핸들 폭이 옛 `gap-2`와 같다 — 간격이 변하지 않는다", async () => {
    expect(SHELL_HANDLE_PX).toBe(8);
    const { container } = await mount();
    const handle = find<HTMLElement>(container, '[role="separator"]');
    expect(handle.classList.contains("w-2")).toBe(true);
  });

  it("행이 `gap-*`을 들지 않는다 — 들면 간격이 gap+핸들+gap이 된다", async () => {
    const { container } = await mount();
    const handle = find<HTMLElement>(container, '[role="separator"]');
    for (let node = handle.parentElement; node !== null; node = node.parentElement) {
      expect([...node.classList].filter((c) => /^gap-/.test(c)), node.className).toEqual([]);
      if (node.parentElement === document.body) break;
    }
  });

  /** LNB는 시안 `212:944`의 240에서 시작하고 200~320 사이에서만 움직인다. */
  it("치수가 200 / 240 / 320이다", () => {
    expect(SHELL_SIDEBAR_PX).toEqual({ min: 200, default: 240, max: 320 });
  });

  /**
   * ⚠️ **폭을 재기 전에는 %가 거짓이다.** 셸의 그룹 폭은 뷰포트를 따르는데 SSR은 그것을 모른다 —
   * 1264 기준 %를 그대로 그리면 2560 디스플레이에서 LNB가 486px인 채로 하이드레이션을 기다린다
   * (라이브러리 자신도 `defaultSize` 없이 서버 렌더하면 layout shift를 경고한다). 그동안만 px로
   * 못박고, 재고 나면 그 override를 뗀다.
   *
   * jsdom은 `getBoundingClientRect`가 0이고 `vitest.setup.ts`의 `ResizeObserver`가 콜백을 한 번도
   * 부르지 않으므로, 이 테스트가 보는 것은 **재기 전** 상태다.
   */
  it("재기 전에는 LNB가 240px로 못박힌다 — %가 아니다", async () => {
    const { container } = await mount();
    const panel = find<HTMLElement>(container, '[data-test="sidebar"]').parentElement;
    expect(panel).not.toBeNull();
    expect(panel?.style.flexBasis).toBe("240px");
    expect(panel?.style.flexGrow).toBe("0");
    expect(panel?.style.flexShrink).toBe("0");
  });

  it("사이드바와 콘텐츠를 둘 다 렌더한다", async () => {
    const { container } = await mount();
    expect(container.textContent).toContain("nav");
    expect(container.textContent).toContain("content");
  });

  /**
   * jsdom cannot measure layout; assert the placement contract for overlapping route trees.
   *
   * ⚠️ **오른쪽 프로젝트 패널을 지운 뒤에도 grid를 유지한다** (2026-09-16) — 이 검사가 지키는 것은
   * 그 패널이 아니라 **전환 중 콘텐츠 패널 둘이 같은 셀을 쓴다**는 것이다. flex로 되돌리면 두
   * `ContentPanel`이 폭을 나눠 전환 한 프레임 동안 화면이 반으로 갈린다.
   */
  it("전환 중 콘텐츠 패널 둘은 같은 셀을 쓴다", async () => {
    const { container } = await render(h(ShellPanels, {
      sidebar: h("aside", null, "nav"),
      children: h(Fragment, null,
        h(ContentPanel, null, "outgoing"),
        h(ContentPanel, null, "incoming"),
      ),
    }));
    const mains = [...container.querySelectorAll("main")];
    expect(mains).toHaveLength(2);
    const parent = mains[0]?.parentElement;
    expect(parent).toBe(mains[1]?.parentElement);
    expect(parent?.classList.contains("grid")).toBe(true);
    expect(parent?.classList.contains("grid-cols-[minmax(0,1fr)_auto]")).toBe(true);
    expect(parent?.classList.contains("grid-rows-[minmax(0,1fr)]")).toBe(true);
    expect(parent?.classList.contains("gap-2")).toBe(false);
    for (const main of mains) {
      expect(main.classList.contains("isolate")).toBe(true);
      expect(main.classList.contains("col-start-1")).toBe(true);
      expect(main.classList.contains("row-start-1")).toBe(true);
    }
    // 둘째 열은 비어 있다 — 빈 열의 간격이 남지 않도록 grid 자체에 gap을 두지 않는 이유다.
    expect(parent?.querySelector("aside")).toBeNull();
  });
});
