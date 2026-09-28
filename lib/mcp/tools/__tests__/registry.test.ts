import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { m } from "@/lib/i18n";

import { toolCatalog } from "../../catalog";

vi.mock("server-only", () => ({}));
const { TOOLS } = await import("..");

/**
 * **구현 ↔ 카탈로그** (mcp-connector T6). 카탈로그가 이름·순서·annotations·조건의 정본이고 구현은 이름으로 붙는다. 카탈로그는 쓰기 코어의
 * `lib/auth/lock.ts`도 무는 잎이라 도구 구현을 import하면 안 된다(순환) — 방향은 구현 → 카탈로그 하나다.
 */
const DIR = join(__dirname, "..");
const TOOL_FILES = readdirSync(DIR).filter(f => f.endsWith(".ts"));

describe("도구 레지스트리", () => {
  it("카탈로그의 모든 이름에 구현이 있다 — 임시 자리표시 없이 서버가 선다", () => {
    const implemented = new Set(TOOLS.map(t => t.name));
    expect(toolCatalog().map(t => t.name).filter(n => !implemented.has(n))).toEqual([]);
  });

  it("구현 이름이 전부 카탈로그에 있고 겹치지 않는다", () => {
    const names = TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    const catalog = new Set(toolCatalog().map(t => t.name));
    expect(names.filter(n => !catalog.has(n))).toEqual([]);
  });

  it.each(TOOL_FILES)("tools/%s는 server-only다", file => {
    expect(readFileSync(join(DIR, file), "utf8")).toMatch(/^import "server-only";/m);
  });

  it("모든 카탈로그 도구에 설명이 있고 사전에 남는 이름이 없다", () => {
    const names = toolCatalog().map(t => t.name);
    expect(Object.keys(m.mcp.tools).sort()).toEqual([...names].sort());
    for (const name of names) expect((m.mcp.tools as Record<string, string>)[name]?.trim(), name).toBeTruthy();
  });

  it("push 토큰을 주는 도구는 표준입력으로 secret을 넣으라고 말한다 — --body는 쓰지 말라고", () => {
    for (const text of [m.mcp.tools.rotate_push_token, m.mcp.tools.create_project, m.mcp.summary.pushToken, m.mcp.summary.created("acme", 1)]) {
      expect(text).toContain("gh secret set PUSH_TOKEN --repo OWNER/REPO");
      expect(text).toContain("standard input");
      expect(text).toContain("don't use --body");
    }
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
