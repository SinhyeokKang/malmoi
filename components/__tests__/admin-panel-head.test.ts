import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **Members·MCP 머리도 버튼을 든 머리 두 줄 규칙을 쓴다** (responsive-app A5 · orch O4 — B1a의 `PANEL_HEAD_ROW` 소비). 640 미만이면
 * 제목 첫 줄 · 버튼 묶음 둘째 줄 오른쪽이고, 골격도 같은 조각이라 도착할 때 줄 수가 튀지 않는다(A-09). 규칙 자체는
 * `panel-header.test.tsx`가 든다 — 여기는 이 배치가 든 화면이 그 조각만 쓰는지 센다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

describe("관리 화면 머리 — PANEL_HEAD_ROW", () => {
  it.each([
    "app/(edit)/projects/[slug]/members/page.tsx",
    "app/(edit)/projects/[slug]/members/loading.tsx",
    "app/(edit)/mcp/page.tsx",
  ])("%s의 머리 제목 행이 PANEL_HEAD_ROW다", (path) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    const head = /<PanelHeader\b[^>]*>([\s\S]*?)<\/PanelHeader>/.exec(source)?.[1] ?? "";
    expect(head).toMatch(/^\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)*<div className=\{PANEL_HEAD_ROW\}>/);
    expect(head).not.toMatch(/flex-wrap/);
  });
});
