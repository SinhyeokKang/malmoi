import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, it } from "vitest";

/**
 * **MCP 글리프는 `McpIcon` 하나다** (2026-09-29 사용자 — MCP를 뜻하던 lucide `Plug`를 공식 로고로 바꿨다). `github-glyph.test.ts`와 같은 형:
 * 로고 path의 첫 명령(`M13.85 0a4.16`)이 `brand-icons.tsx`에만 있고, MCP 자리(사이드바 항목 · `/mcp` 빈 상태)가 `Plug`로 돌아가지 않는다.
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

it("스캔 대상이 비어 있지 않고 McpIcon의 집을 포함한다", () => {
  expect(files.length).toBeGreaterThan(100);
  expect(files.some((f) => f.path === HOME)).toBe(true);
});

it("MCP 로고 path는 brand-icons.tsx 하나에만 있다", () => {
  expect(files.filter((f) => f.text.includes('d="M13.85 0a4.16')).map((f) => f.path)).toEqual([HOME]);
});

it("MCP 자리가 lucide `Plug`를 쓰지 않는다 — nav 항목 · /mcp 카드", () => {
  for (const path of ["lib/shell/nav.ts", "components/mcp/token-card.tsx"]) {
    // 주석은 벗긴다 — 옛 글리프를 말하는 "왜" 주석은 사용이 아니다.
    const text = (files.find((f) => f.path === path)?.text ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
    expect(text, path).toContain("McpIcon");
    expect(text, path).not.toMatch(/\bPlug\b/);
  }
});
