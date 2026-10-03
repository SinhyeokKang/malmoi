// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Highlight } from "@/components/ui/highlight";
import { Kbd } from "@/components/ui/kbd";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

describe("기존 손 사본을 잇는 프리미티브", () => {
  /** search-ux-unify D14·C13 — 회색 면(테두리 없음) + `text-foreground/60`, 높이 20 고정, 장식이라 기본 `aria-hidden`. */
  it("Kbd는 회색 면·h-5 키 칩이고 낭독되지 않는다", async () => {
    const { container } = await render(<Kbd>{m.common.keys.esc}</Kbd>);
    const chip = container.querySelector("kbd");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("Esc");
    expect(chip?.getAttribute("aria-hidden")).toBe("true");
    const classes = chip?.className.split(/\s+/) ?? [];
    expect(classes).toEqual(expect.arrayContaining(["bg-foreground/5", "text-foreground/60", "inline-flex", "h-5", "shrink-0", "items-center", "rounded", "px-1.5", "font-sans", "text-xs"]));
    for (const gone of ["border", "border-border", "py-0.5", "text-muted-foreground"]) expect(classes, gone).not.toContain(gone);
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
