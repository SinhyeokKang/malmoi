// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { find, render } from "./helpers/dom";

/**
 * **터치 히트 영역** (responsive-public design §2 · 2026-10-07 사용자): 보이는 크기는 그대로 두고 `pointer: coarse`일 때 `::after`가
 * 누르는 영역만 44까지 넓힌다. 대상은 `sm`(28)·`icon-md`(32) 둘이다. jsdom은 포인터 미디어를 모르므로 클래스와 컴파일된 CSS로 든다.
 */
const TOUCH = [
  "relative",
  "pointer-coarse:after:absolute", "pointer-coarse:after:top-1/2", "pointer-coarse:after:left-1/2",
  "pointer-coarse:after:size-full", "pointer-coarse:after:min-h-11", "pointer-coarse:after:min-w-11", "pointer-coarse:after:-translate-1/2",
];
type Size = "sm" | "md" | "lg" | "icon-xs" | "icon-sm" | "icon-md" | "icon-lg";
const classes = async (size: Size) => [...find<HTMLButtonElement>((await render(<Button size={size}>x</Button>)).container, "button").classList];

describe("터치 히트 영역", () => {
  it.each(["sm", "icon-md"] as const)("%s는 `::after`로 44까지 넓힌다 — 보이는 크기 클래스는 그대로다", async (size) => {
    const list = await classes(size);
    expect(list).toEqual(expect.arrayContaining(TOUCH));
    expect(list).toEqual(expect.arrayContaining(size === "sm" ? ["h-7", "rounded-sm", "px-2", "text-xs"] : ["size-8", "rounded-md", "px-0"]));
  });

  it.each(["md", "lg", "icon-xs", "icon-sm", "icon-lg"] as const)("%s에는 붙지 않는다", async (size) => {
    const list = await classes(size);
    for (const token of TOUCH) expect(list, token).not.toContain(token);
  });

  it("ButtonLink도 같은 형이다", async () => {
    const link = find<HTMLAnchorElement>((await render(<ButtonLink href="/docs" size="sm">Docs</ButtonLink>)).container, "a");
    expect([...link.classList]).toEqual(expect.arrayContaining(TOUCH));
  });

  it("호출부의 위치 클래스가 `relative`를 이긴다 — 절대 배치 버튼이 흐름으로 돌아오지 않는다", async () => {
    const list = [...find<HTMLButtonElement>((await render(<Button size="icon-md" className="absolute top-2 right-2">x</Button>)).container, "button").classList];
    expect(list).toContain("absolute");
    expect(list).not.toContain("relative");
    expect(cn("relative", "sticky")).toBe("sticky");
  });

  it("넓히는 토큰은 `pointer: coarse` 미디어 안의 `::after`만 낸다", async () => {
    const require = createRequire(join(process.cwd(), "package.json"));
    const globalsPath = join(process.cwd(), "app/globals.css");
    const compiler = await compile(readFileSync(globalsPath, "utf8"), {
      base: dirname(globalsPath),
      loadStylesheet: async (id, base) => {
        const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    for (const token of TOUCH.slice(1)) {
      const utilities = compiler.build([token]).split("@layer utilities {")[1] ?? "";
      expect(utilities, token).toContain("@media (pointer: coarse)");
      expect(utilities, token).toContain("::after {");
    }
    expect(compiler.build(["pointer-coarse:after:min-h-11"])).toContain("min-height: calc(var(--spacing) * 11)");
  });
});
