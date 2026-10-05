import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * 소스 제거는 편집을 버리지 않는다 (sources-add-remove fix3 — 사용자 결정 2026-10-06). 재추가 첫 적재가 **리포에 값이 있는 칸만** 리포 값으로
 * 덮고 나머지는 미전달로 남는다(ARCHITECTURE §5.9). 그래서 화면·MCP 문장이 "버려진다"를 말하지 않는다 — 세 언어 모두.
 */
const DISCARD = /discard|descart|버려|버리/i;
it.each([["en", en], ["ko", ko], ["es", es]] as const)("%s — 제거 확인 창·MCP 문장이 폐기를 말하지 않는다", (_, m) => {
  const lines = [
    renderToStaticMarkup(<>{m.sources.removal.unsent(3, m.repositorySync.unsentCount(3))}</>),
    m.sources.removal.previewFailed,
  ];
  for (const line of lines) expect(line).not.toMatch(DISCARD);
});
it("MCP 영어 고정 표면도 같은 사실이다", () => {
  for (const line of [en.mcp.summary.sourceRemovalPreview(3), en.mcp.tools.remove_source, en.mcp.tools.preview_source_removal]) expect(line).not.toMatch(DISCARD);
  expect(en.mcp.tools.remove_source).toContain("only where the repository has a value");
});
