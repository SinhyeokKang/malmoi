import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { toolCatalog } from "../../catalog";

vi.mock("server-only", () => ({}));
const { TOOLS } = await import("..");

/**
 * **구현 ↔ 카탈로그** (mcp-connector T6). 카탈로그가 이름·순서·annotations·조건의 정본이고 구현은 이름으로 붙는다. 카탈로그는 `/mcp`
 * 페이지(클라이언트)가 읽는 잎이라 도구 구현을 import하면 안 된다 — 방향은 구현 → 카탈로그 하나다.
 */
const DIR = join(__dirname, "..");
const TOOL_FILES = readdirSync(DIR).filter(f => f.endsWith(".ts"));

describe("도구 레지스트리", () => {
  it("구현 이름이 전부 카탈로그에 있고 겹치지 않는다", () => {
    const names = TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    const catalog = new Set(toolCatalog().map(t => t.name));
    expect(names.filter(n => !catalog.has(n))).toEqual([]);
  });

  it.each(TOOL_FILES)("tools/%s는 server-only다", file => {
    expect(readFileSync(join(DIR, file), "utf8")).toMatch(/^import "server-only";/m);
  });

  it("카탈로그가 도구 구현을 import하지 않는다", () => {
    const catalog = readFileSync(join(DIR, "..", "catalog.ts"), "utf8");
    expect(catalog).not.toMatch(/from\s+["'][^"']*tools/);
  });

  it("입력 스키마가 userId·projectId를 모른다 — 주체는 서버가 토큰에서 만든다", () => {
    for (const tool of TOOLS) {
      const keys = Object.keys(tool.inputSchema.shape);
      expect(keys, tool.name).not.toContain("userId");
      expect(keys, tool.name).not.toContain("projectId");
    }
  });
});
