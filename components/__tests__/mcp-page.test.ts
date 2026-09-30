import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "..", "..", "app", "(edit)", "mcp", "page.tsx"), "utf8");

/** `/mcp` 가이드 입구 (2026-09-30 사용자) — 본문 끝 헬퍼 문장을 걷고 머리 우측 버튼 하나로. 글리프는 LNB Docs와 같은 `CircleHelp`다. */
describe("/mcp 가이드 입구", () => {
  it("머리(PanelHeader) 안의 ButtonLink이고 Docs 글리프를 앞에 든다", () => {
    const header = /<PanelHeader>([\s\S]*?)<\/PanelHeader>/.exec(source)?.[1] ?? "";
    expect(header).toMatch(/<ButtonLink href=\{routes\.docs\("ai-agents"\)\}>\s*<CircleHelp aria-hidden \/>\s*\{m\.mcpConnector\.guide\.link\}/);
  });

  it("본문에 헬퍼 문장이 없다", () => {
    const body = /<PanelBody[\s\S]*<\/PanelBody>/.exec(source)?.[0] ?? "";
    expect(body).not.toContain("mcpConnector.guide");
  });
});
