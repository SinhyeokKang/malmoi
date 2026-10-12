import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { GitlabIcon } from "@/components/signin/brand-icons";

/**
 * **GitLab 글리프는 `GitlabIcon` 하나다** (gitlab-repositories D10). `github-glyph.test.ts`·`mcp-glyph.test.ts`와 같은 형:
 * tanuki path의 첫 명령(`m23.6004 9.5927`)이 `brand-icons.tsx`에만 있다.
 *
 * ⚠️ **단색 `currentColor`다** — `visual-system.test.ts`가 `brand-icons.tsx`를 파일 단위로 면제하므로 공식 다색(주황 셋)이
 * 섞여도 거기선 green이다. 그래서 여기서 렌더한 마크업의 색 리터럴 0을 센다(다색이면 DESIGN §6.2·§6.8 예외 등재가 따라와야 한다).
 */
const ROOT = process.cwd();
const DIRS = ["app", "components", "lib", "messages"];
const HOME = "components/signin/brand-icons.tsx";
const TANUKI = 'd="m23.6004 9.5927';

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

it("tanuki path는 brand-icons.tsx 하나에만 있다", () => {
  expect(files.filter((f) => f.text.includes(TANUKI)).map((f) => f.path)).toEqual([HOME]);
});

it("단색 currentColor이고 색 리터럴이 없다 — 버튼·링크 색을 따라간다 (D10)", () => {
  const markup = renderToStaticMarkup(createElement(GitlabIcon));
  expect(markup).toContain('fill="currentColor"');
  expect(markup).toContain(TANUKI);
  expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  // 호스트를 글리프만으로 가르지 않는다 — 이름은 텍스트·접근 이름이 든다(design §2 접근성)
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).not.toContain("<title");
});
