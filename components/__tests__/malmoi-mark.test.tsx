// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MalmoiMark } from "@/components/ui/malmoi-mark";

import { render } from "./helpers/dom";

/**
 * **Malmoi 로고는 토큰으로 칠하는 인라인 SVG 하나다** (color-scheme design §3.5). 면이 `foreground`, 마크가 `background`라
 * 다크에서 저절로 흰 판 + 검정 마크가 된다 — 두 번째 이미지도 테마 분기도 없다.
 */
describe("MalmoiMark", () => {
  it("면 path는 foreground, 마크 path 둘은 background로 칠한다", async () => {
    const { container } = await render(<MalmoiMark size={32} />);
    const paths = [...container.querySelectorAll("svg path")];
    expect(paths.map((path) => path.getAttribute("class"))).toEqual(["fill-foreground", "fill-background", "fill-background"]);
    // 원본 파일의 리터럴 색이 따라오지 않는다 — 색의 집은 `globals.css` 하나다.
    expect(paths.some((path) => path.hasAttribute("fill"))).toBe(false);
  });

  it("장식이다 — 접근성 트리 밖이고 크기를 받는다", async () => {
    const { container } = await render(<MalmoiMark size={48} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("width")).toBe("48");
    expect(svg?.getAttribute("height")).toBe("48");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 120 120");
  });

  it("원본 `public/brand/malmoi-icon-black.svg`와 path가 같다 — 인라인 사본이 원본에서 갈라지지 않는다", async () => {
    const original = readFileSync(join(process.cwd(), "public/brand/malmoi-icon-black.svg"), "utf8");
    const { container } = await render(<MalmoiMark size={32} />);
    expect([...container.querySelectorAll("svg path")].map((path) => path.getAttribute("d"))).toEqual(
      [...original.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]),
    );
  });
});

/** 7곳 사본(`<Image src={logo}>`)이 이 컴포넌트로 모였다 — 검정 SVG를 이미지로 다시 들이면 다크 캔버스에 묻힌다. */
describe("Malmoi 로고 소비자", () => {
  const CONSUMERS = [
    "app/invite/[token]/page.tsx",
    "app/oauth/authorize/page.tsx",
    "app/signin/link/[challenge]/page.tsx",
    "app/signin/page.tsx",
    "components/landing/mockup/app-frame.tsx",
    "components/public-shell/header.tsx",
    "components/shell/header.tsx",
  ];

  it.each(CONSUMERS)("%s가 MalmoiMark를 쓰고 로고 SVG를 이미지로 import하지 않는다", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toMatch(/<MalmoiMark\b/);
    expect(source).not.toMatch(/public\/brand\/malmoi-icon/);
  });
});
