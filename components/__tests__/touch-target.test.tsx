// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { Button, ButtonLink } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { InputClearButton } from "@/components/ui/input-clear-button";
import { cn } from "@/lib/utils";

import { find, render } from "./helpers/dom";

/**
 * **터치 히트 영역** (responsive-public design §2 · 2026-10-07 사용자): 보이는 크기는 그대로 두고 `pointer: coarse`일 때 `::after`가
 * 누르는 영역만 44까지 넓힌다. jsdom은 포인터 미디어를 모르므로 클래스와 컴파일된 CSS로 든다.
 * ⚠️ **대상은 44 미만 크기 전부다** (D17 — 2026-10-10 지휘자): `sm` 28 · `icon-xs` 24 · `icon-sm` 28 · `icon-md` 32 · `icon-lg` 36. design §2는 `sm`·`icon-md`
 * 둘만 적었는데 그러면 시트에서 가장 자주 누르는 지우기 X(`icon-xs`)와 닫기(`CloseButton` `icon-lg` → 시트 32)가 빠진다. 글자 버튼 `md` 36 · `lg` 40은
 * 뺀다 — 폭이 넓어 가로 부족분이 없고 세로 부족분(8·4)도 작으며, 세로로 쌓인 버튼끼리 넓힌 영역이 겹친다.
 */
const TOUCH = [
  "relative",
  "pointer-coarse:after:absolute", "pointer-coarse:after:top-1/2", "pointer-coarse:after:left-1/2",
  "pointer-coarse:after:size-full", "pointer-coarse:after:min-h-11", "pointer-coarse:after:min-w-11", "pointer-coarse:after:-translate-1/2",
];
type Size = "sm" | "md" | "lg" | "icon-xs" | "icon-sm" | "icon-md" | "icon-lg";
const VISIBLE: Record<Exclude<Size, "md" | "lg">, string[]> = {
  sm: ["h-7", "rounded-sm", "px-2", "text-xs"],
  "icon-xs": ["size-6", "rounded-sm", "px-0"],
  "icon-sm": ["size-7", "rounded-sm", "px-0", "text-xs"],
  "icon-md": ["size-8", "rounded-md", "px-0"],
  "icon-lg": ["size-9", "rounded-md", "px-0"],
};
const classes = async (size: Size) => [...find<HTMLButtonElement>((await render(<Button size={size}>x</Button>)).container, "button").classList];

describe("터치 히트 영역", () => {
  it.each(["sm", "icon-xs", "icon-sm", "icon-md", "icon-lg"] as const)("%s는 `::after`로 44까지 넓힌다 — 보이는 크기 클래스는 그대로다", async (size) => {
    const list = await classes(size);
    expect(list).toEqual(expect.arrayContaining(TOUCH));
    expect(list).toEqual(expect.arrayContaining(VISIBLE[size]));
  });

  it.each(["md", "lg"] as const)("글자 버튼 %s에는 붙지 않는다", async (size) => {
    const list = await classes(size);
    for (const token of TOUCH) expect(list, token).not.toContain(token);
  });

  /**
   * 시트 머리에서 가장 자주 누르는 둘 — 지우기 X(`InputClearButton` `icon-xs` 24)와 닫기(`CloseButton` `icon-lg`, 시트 32)가 44를 받는다.
   * ⚠️ **검색 시트에서 지우기 X와 Cancel의 넓힌 영역이 겹친다.** X는 입력 래퍼 안, Cancel은 그 래퍼의 뒤 형제이고 둘 다 `z-index` 없는
   * positioned 요소라 **DOM 뒤인 Cancel의 `::after`가 위에 칠해져 겹친 띠에서 이긴다.** Cancel은 글자 버튼이라 폭이 44를 넘어 가로로 넓히지
   * 않으므로, 겹침은 X의 오른쪽 확장(약 10)이 사이 간격 8을 넘는 몇 px뿐이고 보이는 X 위에서는 늘 X다. 실제 겹침 폭은 DS 실측 몫이다.
   */
  it("시트의 지우기 X와 닫기가 44를 받는다", async () => {
    const clear = find<HTMLButtonElement>((await render(<InputClearButton />)).container, "button");
    expect([...clear.classList]).toEqual(expect.arrayContaining([...TOUCH.slice(1), "absolute", "size-6"]));
    // 지우기 X는 입력 안의 `absolute`다 — 호출부 위치가 `relative`를 이겨 자리가 그대로이고, 그 자신이 `::after`의 기준 상자다.
    expect(clear.classList.contains("relative")).toBe(false);
    const close = find<HTMLButtonElement>((await render(<CloseButton label="Close" className="max-lg:size-8" />)).container, "button");
    expect([...close.classList]).toEqual(expect.arrayContaining([...TOUCH, "size-9", "max-lg:size-8"]));
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
