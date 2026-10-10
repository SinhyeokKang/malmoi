import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { WIDE_QUERY } from "@/lib/shell/breakpoint";

/**
 * **셸 경계는 뷰포트 `lg`(64rem) 하나다** (responsive-public design §2). CSS(`lg:`·`max-lg:`)가 배치를 정하고, JS는 열린 서랍·Inbox 시트를
 * 정리할 때만 같은 경계를 `matchMedia`로 묻는다. 둘이 갈리면 1024 근처에서 CSS는 좁은데 JS는 넓다고 읽어 서랍이 남거나 Inbox가 틀린 그릇으로 열린다.
 */
const ROOT = process.cwd();
const tailwindTheme = () => readFileSync(join(dirname(createRequire(join(ROOT, "package.json")).resolve("tailwindcss/package.json")), "theme.css"), "utf8");

describe("`lg` 쿼리", () => {
  it("Tailwind `lg` 경계와 같은 문자열이다", () => {
    const lg = /--breakpoint-lg:\s*([^;]+);/.exec(tailwindTheme())?.[1]?.trim();
    expect(lg).toBe("64rem");
    expect(WIDE_QUERY).toBe(`(min-width: ${lg})`);
  });

  it("앱이 `lg` 경계를 덮지 않는다 — 덮으면 위 대조가 거짓이 된다", () => {
    expect(readFileSync(join(ROOT, "app/globals.css"), "utf8")).not.toMatch(/--breakpoint-lg\s*:/);
  });

  /** rem 경계를 px·`innerWidth`로 판정하면 사용자 글꼴 크기에 따라 CSS 경계와 어긋난다 — 그 판정이 0이고 쿼리 문자열은 상수 하나다. */
  it("셸·오버레이 소스가 `innerWidth`·`1024px`·쿼리 리터럴로 판정하지 않는다", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : walk(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
    const sources = ["components", "app", "lib"].flatMap((dir) => walk(join(ROOT, dir)))
      .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));
    expect(sources.length).toBeGreaterThan(100);
    const offenders = sources.filter(({ path, text }) => path !== "lib/shell/breakpoint.ts" && /innerWidth|matchMedia\(\s*["'`]\(min-width|\(min-width:\s*(?:64rem|1024px)\)/.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
