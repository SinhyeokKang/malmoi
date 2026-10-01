// @vitest-environment jsdom
import { RefreshCw } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

import { render } from "./helpers/dom";

/**
 * **도는 버튼의 스피너는 `Button`의 `loading`·`busy`가 든다** (DESIGN §6.4 `Button loading` · ux-drift-unify T13 · 3-⚪13).
 * 아이콘이 있는 버튼은 스피너를 **더하지 않고 교체한다** — 더하면 버튼이 글리프 하나만큼 넓어졌다 좁아진다. 전엔 그 교체를 호출부
 * 다섯이 삼항으로 손수 들었다. 앞 글리프는 **`aria-hidden`을 든 첫 자식 요소**다 — 라벨 글자·배지는 교체되지 않는다.
 */
describe("Button — 스피너가 앞 글리프를 교체한다", () => {
  it.each(["loading", "busy"] as const)("%s면 앞 글리프가 빠지고 스피너 하나가 선다 — 라벨은 그대로다", async (mode) => {
    const props = mode === "loading" ? { loading: true } : { busy: true };
    const { container } = await render(<Button {...props}><RefreshCw aria-hidden />Refresh</Button>);
    const button = container.querySelector("button")!;
    expect(button.querySelector(".lucide-refresh-cw")).toBeNull();
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    expect(button.textContent).toBe("Refresh");
  });

  it("돌지 않으면 앞 글리프가 그대로다", async () => {
    const { container } = await render(<Button><RefreshCw aria-hidden />Refresh</Button>);
    expect(container.querySelector(".lucide-refresh-cw")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("아이콘 없는 확정 버튼은 스피너를 더한다 — 라벨이 첫 자식이다", async () => {
    const { container } = await render(<Button loading>Save</Button>);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.textContent).toBe("Save");
  });

  it("aria-hidden 없는 첫 요소(라벨 조각)는 교체하지 않는다", async () => {
    const { container } = await render(<Button busy><span>Save</span> now</Button>);
    expect(container.querySelector("span")?.textContent).toBe("Save");
  });
});
