// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createRef, type ComponentProps } from "react";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";

import { SearchInput } from "@/components/ui/search-input";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

import { find, render } from "./helpers/dom";

const widths = [132, 160, 168, 192, 220, 240, 256, 320, "full"] as const;
const classes = ["w-[132px]", "w-40", "w-[168px]", "w-48", "w-[220px]", "w-60", "w-64", "w-80", "w-full"];
let compiler: Awaited<ReturnType<typeof compile>>;
beforeAll(async () => {
  const globals = join(process.cwd(), "app/globals.css");
  const require = createRequire(join(process.cwd(), "package.json"));
  compiler = await compile(readFileSync(globals, "utf8"), {
    base: dirname(globals),
    loadStylesheet: async (id, base) => {
      const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
});

describe("field width API preserves actual dimensions", () => {
  it.each(["Input", "SelectTrigger", "SearchInput"] as const)("%s types exactly the measured widths", kind => {
    type Width = (typeof widths)[number] | undefined;
    if (kind === "Input") expectTypeOf<ComponentProps<typeof Input>["width"]>().toEqualTypeOf<Width>();
    if (kind === "SelectTrigger") expectTypeOf<ComponentProps<typeof SelectTrigger>["width"]>().toEqualTypeOf<Width>();
    if (kind === "SearchInput") expectTypeOf<ComponentProps<typeof SearchInput>["width"]>().toEqualTypeOf<Width>();
  });

  for (const kind of ["Input", "SelectTrigger", "SearchInput"] as const) {
    it.each(widths)(`${kind} width %s is consumed, keeps 36px height, and compiles to the original width`, async width => {
      const ui = kind === "Input" ? <Input width={width} aria-label="Field" />
        : kind === "SelectTrigger" ? <Select><SelectTrigger width={width} aria-label="Field"><SelectValue placeholder="Choose" /></SelectTrigger></Select>
        : <SearchInput width={width} label="Field" value={undefined} onSearch={vi.fn()} />;
      const { container } = await render(ui);
      const field = find<HTMLElement>(container, kind === "SelectTrigger" ? '[role="combobox"]' : "input");
      expect(field.hasAttribute("width")).toBe(false);
      expect(field.classList.contains("h-9")).toBe(true);
      const token = classes[widths.indexOf(width)]!;
      expect([...field.classList].filter(value => /^w-/.test(value))).toEqual([token]);
      const css = compiler.build([token]);
      const utility = css.split("@layer utilities {")[1]!;
      const selector = `.${token.replace(/[^\w-]/g, "\\$&")} {`;
      expect(utility).toContain(selector);
      // The compiler accumulates candidates; read this selector's block, not the first width in the sheet.
      const block = utility.split(selector)[1]!.split("}")[0]!;
      const declaration = /width: ([^;]+);/.exec(block)?.[1];
      if (width === "full") expect(declaration).toBe("100%");
      else if (token.includes("[")) expect(declaration).toBe(`${width}px`);
      else {
        const scale = /calc\(var\(--spacing\) \* ([\d.]+)\)/.exec(declaration ?? "")?.[1];
        const spacing = /--spacing:\s*([\d.]+)rem;/.exec(css)?.[1];
        expect(scale).toBeDefined();
        expect(spacing).toBeDefined();
        expect(Number(scale) * Number(spacing) * 16).toBe(width);
      }
    });
  }

  it("omitted Input/Select widths stay intrinsic, while SearchInput stays 256px", async () => {
    const { container } = await render(<><Input aria-label="Input" /><Select><SelectTrigger aria-label="Select"><SelectValue /></SelectTrigger></Select><SearchInput value={undefined} label="Search" onSearch={vi.fn()} /></>);
    for (const selector of ['input[aria-label="Input"]', '[role="combobox"]']) {
      expect([...find(container, selector).classList].filter(token => /^w-/.test(token))).toEqual([]);
    }
    const search = find(container, 'input[type="search"]');
    expect(search.classList.contains("w-64")).toBe(true);
    expect(search.parentElement?.classList.contains("w-64")).toBe(false);
  });

  it("Select asChild consumes width on its one real button and keeps ref, value truncation and chevron", async () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = await render(<Select><SelectTrigger asChild ref={ref} width={220}><button aria-label="Branch"><SelectValue placeholder="Very long branch" /></button></SelectTrigger></Select>);
    const field = find<HTMLButtonElement>(container, '[role="combobox"]');
    expect(ref.current).toBe(field);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(field.hasAttribute("width")).toBe(false);
    for (const token of ["w-[220px]", "[&>span]:min-w-0", "[&>span]:truncate"]) expect(field.classList.contains(token)).toBe(true);
    const glyph = find(field, "svg");
    expect(glyph.classList.contains("shrink-0")).toBe(true);
    expect(glyph.getAttribute("aria-hidden")).toBe("true");
  });

  it("SearchInput width changes only the input, while className still positions its outer flex item", async () => {
    const { container, rerender } = await render(<SearchInput width={320} className="ml-auto" label="Search" value="hello" disabled onSearch={vi.fn()} />);
    const field = find<HTMLInputElement>(container, "input");
    const outer = container.firstElementChild!;
    expect(outer.classList.contains("relative")).toBe(true);
    expect(outer.classList.contains("ml-auto")).toBe(true);
    expect(outer.classList.contains("w-80")).toBe(false);
    expect(field.classList.contains("ml-auto")).toBe(false);
    for (const token of ["w-80", "pl-8", "h-9"]) expect(field.classList.contains(token)).toBe(true);
    expect(field.disabled).toBe(true);
    expect(field.value).toBe("hello");
    for (const token of ["absolute", "top-1/2", "left-2.5", "-translate-y-1/2"]) expect(find(outer, "svg").parentElement?.classList.contains(token)).toBe(true);
    expect(find(outer, "svg").parentElement?.getAttribute("aria-hidden")).toBe("true");
    await rerender(<SearchInput width="full" className="ml-auto" label="Search" value="hello" onSearch={vi.fn()} />);
    expect(field.classList.contains("w-full")).toBe(true);
    expect(field.classList.contains("w-80")).toBe(false);
    expect(field.disabled).toBe(false);
  });
});
