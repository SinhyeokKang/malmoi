// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { describe, expect, it } from "vitest";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { find, render } from "./helpers/dom";

/**
 * **패널 구분선** (DESIGN §6.56) — 원본은 bugshot-2 로그 뷰어의 메인 리사이저다.
 *
 * ⚠️ **핸들 자신은 안 보인다.** 보이는 것은 `::after` 하나뿐이고, 핸들 엘리먼트는 옛 `gap`을
 * 대신하는 **투명 스트립**이다(그래서 폭이 호출부마다 다르다). 그 바가 **hover·drag에만** 뜨는
 * 것이 원본의 요지라, `data-resize-handle-state`를 CSS가 직접 읽는다 — React state가 없다.
 */
/**
 * ⚠️ **주석을 벗긴다** (`focus-ring.test.ts`와 같은 벗기기). 이 프리미티브는 자기가 **쓰지 않는**
 * 것들을 주석으로 설명한다 — 왜 `cursor-*`를 안 쓰는지, 왜 `hitAreaMargins`를 안 덮는지, 왜
 * `via-blue-300`이 아닌지. 안 벗기면 그 설명이 코드로 잡혀 영원히 red이고, 통과시키려고 **지우면
 * 안 되는 쪽의 주석**을 지우게 된다.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const source = stripComments(readFileSync(join(process.cwd(), "components/ui/resizable.tsx"), "utf8"));

describe("Resizable 프리미티브", () => {
  it("그룹·패널·핸들을 렌더하고 핸들이 separator다", async () => {
    const { container } = await render(
      h(
        ResizablePanelGroup,
        { direction: "horizontal" },
        h(ResizablePanel, { defaultSize: 30 }, "left"),
        h(ResizableHandle, { "aria-label": "Resize sidebar", className: "w-2" }),
        h(ResizablePanel, { defaultSize: 70 }, "right"),
      ),
    );
    const handle = find<HTMLElement>(container, '[role="separator"]');
    expect(handle.getAttribute("aria-label")).toBe("Resize sidebar");
    // 호출부가 준 폭이 살아 있다 — 이 폭이 옛 `gap-*`을 대신한다.
    expect(handle.classList.contains("w-2")).toBe(true);
    expect(container.textContent).toContain("left");
    expect(container.textContent).toContain("right");
  });

  /**
   * ⚠️ **shadcn 기본은 `bg-border`라 핸들이 상시로 보인다.** 그것을 `bg-transparent`로 덮는 것이
   * 이 프리미티브가 하는 일의 절반이고, 덮지 않으면 캔버스 위에 1px 선이 늘 떠 있다.
   */
  it("핸들 자신은 투명하고, 보이는 것은 `::after` 4px 바다", async () => {
    const { container } = await render(
      h(
        ResizablePanelGroup,
        { direction: "horizontal" },
        h(ResizablePanel, { defaultSize: 50 }),
        h(ResizableHandle, { "aria-label": "Resize", className: "w-2" }),
        h(ResizablePanel, { defaultSize: 50 }),
      ),
    );
    const cls = find<HTMLElement>(container, '[role="separator"]').className;
    expect(cls).toContain("bg-transparent");
    expect(cls).not.toMatch(/\bbg-border\b/);
    // 4px 바를 스트립 한가운데에 둔다 — 스트립 폭이 호출부마다 달라 `left-1/2`가 짝이다.
    expect(cls).toContain("after:w-1");
    expect(cls).toContain("after:left-1/2");
    expect(cls).toContain("after:-translate-x-1/2");
    expect(cls).toContain("after:inset-y-0");
  });

  /**
   * ⚠️ **색이 `via-ring`이다 — 원본의 `via-blue-300`이 아니다** (DESIGN §6.56). blue-300은 이 리포에
   * 0건인 미등재 raw 색이고, `globals.css`가 그것을 **흰 배경 1.80:1로 목측 뒤 버린** 색으로 기록하고
   * 있다. `--ring`(blue-400)을 쓰면 §6.2에 새 색을 등재할 일도 없다.
   */
  it("바가 `--ring`으로 양끝이 페이드된다", () => {
    expect(source).toContain("after:via-ring");
    expect(source).toContain("after:bg-gradient-to-b");
    expect(source).toContain("after:from-transparent");
    expect(source).toContain("after:to-transparent");
    expect(source).not.toContain("blue-300");
  });

  /** 표시 트리거가 라이브러리가 DOM에 쓰는 속성이다 — 그래서 이 프리미티브에 state가 없다. */
  it("hover·drag에만 바가 뜬다", async () => {
    const { container } = await render(
      h(
        ResizablePanelGroup,
        { direction: "horizontal" },
        h(ResizablePanel, { defaultSize: 50 }),
        h(ResizableHandle, { "aria-label": "Resize", className: "w-2" }),
        h(ResizablePanel, { defaultSize: 50 }),
      ),
    );
    const handle = find<HTMLElement>(container, '[role="separator"]');
    expect(handle.getAttribute("data-resize-handle-state")).toBe("inactive");
    expect(handle.className).toContain("after:opacity-0");
    expect(handle.className).toContain("data-[resize-handle-state=hover]:after:opacity-100");
    expect(handle.className).toContain("data-[resize-handle-state=drag]:after:opacity-100");
  });

  /**
   * ⚠️ **커서를 CSS로 걸지 않는다.** 라이브러리가 드래그 중 `document.head`에 `<style>`을 꽂아
   * `*{cursor: ew-resize !important}`를 건다 — 그래서 포인터가 핸들을 벗어나도 커서가 유지된다.
   * 핸들에 `cursor-*`를 쓰면 먹지도 않으면서 "여기가 커서의 출처"라는 거짓 단서만 남는다.
   */
  it("핸들에 `cursor-*` 클래스가 없다", () => {
    expect(source).not.toMatch(/\bcursor-/);
  });

  /** ⚠️ **히트 영역은 CSS가 아니다** — 라이브러리가 document pointermove에서 rect에 마진을 얹어 판정한다(기본 fine 5 / coarse 15). 기본값을 덮지 않는다. */
  it("`hitAreaMargins`를 덮지 않는다 — 시각 4px이어도 기본 마진이 잡아준다", () => {
    expect(source).not.toContain("hitAreaMargins");
  });

  it("라이트 단일이다 — `dark:` 변형이 없다 (DESIGN §3.1)", () => {
    expect(source).not.toMatch(/\bdark:/);
  });

  /** 핸들은 `tabIndex=0`인 separator라 포커스를 받는다 — 링 셋이 DESIGN §7 그대로여야 한다. */
  it("포커스 링 셋을 든다", async () => {
    const { container } = await render(
      h(
        ResizablePanelGroup,
        { direction: "horizontal" },
        h(ResizablePanel, { defaultSize: 50 }),
        h(ResizableHandle, { "aria-label": "Resize", className: "w-2" }),
        h(ResizablePanel, { defaultSize: 50 }),
      ),
    );
    const handle = find<HTMLElement>(container, '[role="separator"]');
    expect(handle.tabIndex).toBe(0);
    for (const cls of ["focus-visible:ring-ring", "focus-visible:ring-2", "focus-visible:outline-none"]) {
      expect(handle.classList.contains(cls), cls).toBe(true);
    }
  });
});

describe("주석 벗기기 (메타)", () => {
  it("주석 안의 이름을 코드로 세지 않는다 — 이 프리미티브는 안 쓰는 것을 설명한다", () => {
    expect(stripComments("// cursor-ew-resize는 안 쓴다\nconst a = 1;")).not.toMatch(/\bcursor-/);
    expect(stripComments("/** `hitAreaMargins` 기본값 */\nconst a = 1;")).not.toContain("hitAreaMargins");
    // 벗기기가 넓어져 진짜 코드까지 지우면 방어선이 빈다.
    expect(stripComments('className="cursor-pointer"')).toContain("cursor-pointer");
  });
});
