import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { GitlabBrandIcon, GitlabIcon } from "@/components/signin/brand-icons";

/**
 * **GitLab 글리프는 둘이고 둘 다 `brand-icons.tsx`에만 산다** — 인라인 자리의 단색 `GitlabIcon`(gitlab-repositories D10)과 로그인 버튼·카드 칸의
 * 공식 3색 `GitlabBrandIcon`(gitlab-oauth D6). `github-glyph.test.ts`·`mcp-glyph.test.ts`와 같은 형: 각 tanuki path의 첫 명령이 그 파일에만 있다.
 *
 * ⚠️ **`visual-system.test.ts`가 `brand-icons.tsx`를 파일 단위로 면제한다** — 그래서 색은 여기서 렌더한 마크업으로 센다. 단색은 색 리터럴 0,
 * 3색은 공식 hex 셋과 **정확히** 같은 집합이다(하나가 빠지거나 `currentColor`가 섞이면 칸의 상태 색을 받아 로고가 아니게 된다).
 */
const ROOT = process.cwd();
const DIRS = ["app", "components", "lib", "messages"];
const HOME = "components/signin/brand-icons.tsx";
const TANUKI = 'd="m23.6004 9.5927';
const BRAND_TANUKI = 'd="M265.26416,174.37243';
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/gi;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.(tsx?|svg|html)$/.test(name) ? [path] : [];
  });
}

const files = DIRS.flatMap((dir) => sources(join(ROOT, dir))).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

it("스캔 대상이 비어 있지 않고 GitlabIcon의 집을 포함한다", () => {
  expect(files.length).toBeGreaterThan(100);
  expect(files.some((f) => f.path === HOME)).toBe(true);
});

it("tanuki path는 둘 다 brand-icons.tsx 하나에만 있다", () => {
  expect(files.filter((f) => f.text.includes(TANUKI)).map((f) => f.path)).toEqual([HOME]);
  expect(files.filter((f) => f.text.includes(BRAND_TANUKI)).map((f) => f.path)).toEqual([HOME]);
});

it("단색 currentColor이고 색 리터럴이 없다 — 버튼·링크 색을 따라간다 (D10)", () => {
  const markup = renderToStaticMarkup(createElement(GitlabIcon));
  expect(markup).toContain('fill="currentColor"');
  expect(markup).toContain(TANUKI);
  expect(markup.match(COLOR)).toBeNull();
  // 호스트를 글리프만으로 가르지 않는다 — 이름은 텍스트·접근 이름이 든다(design §2 접근성)
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).not.toContain("<title");
});

it("GitlabBrandIcon은 공식 3색이고 currentColor가 없다 — 칸의 상태 색을 받지 않는다 (D6)", () => {
  const markup = renderToStaticMarkup(createElement(GitlabBrandIcon));
  expect(markup).toContain(BRAND_TANUKI);
  expect(markup).not.toContain("currentColor");
  expect(new Set(markup.match(COLOR)?.map((c) => c.toUpperCase()))).toEqual(new Set(["#E24329", "#FC6D26", "#FCA326"]));
  // path마다 fill이 있다 — fill 없는 path는 부모(`currentColor` 상속)로 칠해진다.
  expect(markup.match(/<path /g)?.length).toBe(markup.match(/<path [^>]*fill="#/g)?.length);
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).not.toContain("<title");
});
