// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { compile } from "tailwindcss";
import { beforeAll, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterMenu } from "@/components/ui/filter-menu";
import { find, render } from "./helpers/dom";

vi.setConfig({ testTimeout: 20_000 });
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

/** jsdom은 폭을 배치하지 못한다 — 실제 열린 메뉴에서 채취한 유틸이 유효한 CSS를 만드는지 검증한다. */
function declaration(token: string, property: string): { value: string | undefined; css: string } {
  const css = compiler.build([token]);
  const selector = `.${token.replace(/[^\w-]/g, "\\$&")} {`;
  const block = css.split("@layer utilities {")[1]?.split(selector)[1]?.split("}")[0];
  expect(block, token).toBeDefined();
  return { value: new RegExp(`${property}: ([^;]+);`).exec(block ?? "")?.[1], css };
}

it.each(["plain", "filter"] as const)("%s 메뉴는 실제 가용 폭을 최대 폭으로 쓰고 데스크톱 448 상한을 보존한다 (#301)", async kind => {
  const label = "Very long project name ".repeat(12);
  const { container } = await render(kind === "filter"
    ? <FilterMenu axis="Project" label={label} on className="max-w-60"><DropdownMenuItem>{label}</DropdownMenuItem></FilterMenu>
    : <DropdownMenu><DropdownMenuTrigger asChild><Button>Menu</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>{label}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
  const trigger = find<HTMLButtonElement>(container, "button");
  const user = userEvent.setup();
  await act(async () => { await user.click(trigger); });
  const menu = find<HTMLElement>(document.body, '[role="menu"]');
  const maxWidths = [...menu.classList].filter(token => token.startsWith("max-w-"));
  expect(maxWidths).toHaveLength(1);
  const { value, css } = declaration(maxWidths[0]!, "max-width");
  expect(value).toBe("min(var(--container-md), var(--radix-dropdown-menu-content-available-width))");
  expect(css).toMatch(/--container-md:\s*28rem;/);
  // Radix가 충돌 여백을 뺀 값을 내는 경로를 지킨다. 픽셀 실측은 브라우저 재검증에 남긴다.
  expect(menu.style.getPropertyValue("--radix-dropdown-menu-content-available-width")).toBe("var(--radix-popper-available-width)");
  expect(menu.getAttribute("aria-labelledby")).toBe(trigger.id);
  if (kind === "filter") expect(trigger.getAttribute("aria-label")).toBe(`Project: ${label}`);
  await act(async () => { await user.keyboard("{Escape}"); });
  expect(document.activeElement).toBe(trigger);
});

it.each([["w-60", 240], ["w-64", 256], ["w-90", 360]] as const)("기존 명시 폭 %s는 공용 가용 폭 상한과 함께 남는다", async (width, pixels) => {
  const { container } = await render(<DropdownMenu><DropdownMenuTrigger asChild><Button>Menu</Button></DropdownMenuTrigger>
    <DropdownMenuContent className={width}><DropdownMenuItem>Item</DropdownMenuItem></DropdownMenuContent>
  </DropdownMenu>);
  await act(async () => { await userEvent.setup().click(find(container, "button")); });
  const menu = find(document.body, '[role="menu"]');
  expect(menu.classList.contains(width)).toBe(true);
  const { value, css } = declaration(width, "width");
  const scale = /calc\(var\(--spacing\) \* ([\d.]+)\)/.exec(value ?? "")?.[1];
  const spacing = /--spacing:\s*([\d.]+)rem;/.exec(css)?.[1];
  expect(Number(scale) * Number(spacing) * 16).toBe(pixels);
  const cap = [...menu.classList].find(token => token.startsWith("max-w-"))!;
  expect(declaration(cap, "max-width").value).toContain("var(--radix-dropdown-menu-content-available-width)");
});
