// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Highlight } from "@/components/ui/highlight";
import { Kbd } from "@/components/ui/kbd";

import { render } from "./helpers/dom";

describe("기존 손 사본을 잇는 프리미티브", () => {
  it("Kbd가 키 칩 태그와 기존 크기·폰트를 유지한다", async () => {
    const { container } = await render(<Kbd>Esc</Kbd>);
    const chip = container.querySelector("kbd");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("Esc");
    expect(chip?.className.split(/\s+/)).toEqual(expect.arrayContaining([
      "border-border", "text-muted-foreground", "shrink-0", "rounded", "border", "px-1.5", "py-0.5", "font-sans", "text-xs",
    ]));
  });

  it("Highlight가 받은 조각 중 일치만 칠하고 텍스트를 이스케이프한다", async () => {
    const { container } = await render(<Highlight segments={[
      { text: "Before ", match: false }, { text: "<script>", match: true }, { text: " after", match: false },
    ]} />);
    expect(container.textContent).toBe("Before <script> after");
    expect(container.querySelectorAll("mark")).toHaveLength(1);
    expect(container.querySelector("mark")?.textContent).toBe("<script>");
    expect(container.querySelector("mark")?.className).toBe("rounded-[3px] bg-link/[0.14] px-px text-inherit");
    expect(container.querySelector("script")).toBeNull();
  });

  it("빈 조각이나 불일치뿐인 조각에는 mark를 만들지 않는다", async () => {
    for (const segments of [[], [{ text: "Malmoi", match: false }]]) {
      const { container } = await render(<Highlight segments={segments} />);
      expect(container.querySelectorAll("mark")).toHaveLength(0);
      expect(container.textContent).toBe(segments.map(segment => segment.text).join(""));
    }
  });
});
