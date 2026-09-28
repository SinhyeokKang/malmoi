import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, it } from "vitest";

/**
 * **GitHub 글리프는 `GithubIcon` 하나다** (2026-09-28 사용자 — "전체 모두 다"). 전에는 채운 로고(`components/signin/brand-icons.tsx`)와
 * lucide 0.462의 외곽선(`components/sources/github-mark.tsx`)이 둘 다 "유일한 브랜드 마크"를 자처하며 화면마다 갈려 섰다.
 *
 * 소스에서 **GitHub 로고 path**를 센다 — 채운 로고의 첫 명령(`M12 .5C`)과 옛 외곽선의 몸통(`M15 22v-4a4.8`)·꼬리(`M9 18c-4.51`).
 * 앞의 것은 `brand-icons.tsx`에만, 뒤의 둘은 어디에도 없어야 한다.
 */
const ROOT = process.cwd();
const DIRS = ["app", "components", "lib", "messages"];
const HOME = "components/signin/brand-icons.tsx";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.(tsx?|svg|html)$/.test(name) ? [path] : [];
  });
}

const files = DIRS.flatMap((dir) => sources(join(ROOT, dir))).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

it("스캔 대상이 비어 있지 않고 GithubIcon의 집을 포함한다", () => {
  expect(files.length).toBeGreaterThan(100);
  expect(files.some((f) => f.path === HOME)).toBe(true);
});

it("채운 GitHub 로고 path는 brand-icons.tsx 하나에만 있다", () => {
  expect(files.filter((f) => f.text.includes('d="M12 .5C')).map((f) => f.path)).toEqual([HOME]);
});

it("옛 외곽선 GitHub 글리프가 어디에도 없다", () => {
  expect(files.filter((f) => f.text.includes("M15 22v-4a4.8") || f.text.includes("M9 18c-4.51")).map((f) => f.path)).toEqual([]);
});

it("github-mark 모듈이 없고 아무도 import하지 않는다", () => {
  expect(existsSync(join(ROOT, "components/sources/github-mark.tsx"))).toBe(false);
  expect(files.filter((f) => /github-mark|GithubMark/.test(f.text)).map((f) => f.path)).toEqual([]);
});
