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
  for (const line of [en.mcp.summary.sourceRemovalPreview(3), en.mcp.tools.detach_source, en.mcp.tools.preview_source_detach]) expect(line).not.toMatch(DISCARD);
  expect(en.mcp.tools.detach_source).toContain("only where the repository has a value");
});

/**
 * **소스는 지우지 않고 떼어 낸다 — 낱말이 Detach다** (2026-10-16 사용자). 리포 파일은 그대로이고 다시 더하면 번역이 돌아오므로 "Remove"는
 * 리포에서 지운다는 뜻으로 읽힌다. 언어 제거(`Remove`)는 실제로 리포의 로케일 파일을 지우므로 그쪽 낱말은 그대로다 — 둘이 낱말로 갈린다.
 * ⚠️ 워크플로 step을 지우라는 처방(`workflowLine`·`workflowStep`)은 실제 삭제라 remove가 맞다. en은 `Disconnect`도 쓰지 않는다 —
 * 자격증명 연결 해제와 리포 접근이 끊긴 `Disconnected` 상태의 낱말이다.
 */
it("소스 제거 화면 낱말은 en Detach · ko 연결 해제 · es Desvincular다", () => {
  expect(en.sources.removal.action).toBe("Detach source");
  expect(en.sources.removal.title("web")).toBe("Detach web from this project?");
  expect(en.sources.removal.removed("web")).toBe("Detached web.");
  expect(ko.sources.removal.action).toBe("소스 연결 해제");
  expect(es.sources.removal.action).toBe("Desvincular fuente");
  for (const [m, word] of [[en, /detach/i], [ko, /연결/], [es, /desvincul/i]] as const) {
    const lines = [m.sources.removal.title("web"), m.sources.removal.removed("web"), m.sources.removal.reasons["stale-approval"], m.sources.removal.previewFailed, m.sources.removal.unconfirmed];
    for (const line of lines) expect(line).toMatch(word);
    expect(renderToStaticMarkup(<>{m.logs.sentence.surface.removed("Owner", "web")}</>)).toMatch(word);
    expect(m.logs.refusals["surface-removed"]).toMatch(word);
    expect(m.logs.onGitLab.refusals["surface-removed"]).toMatch(word);
  }
  // 거부·실패 문장에 "remove"가 남지 않는다(en).
  for (const line of [en.sources.removal.reasons["stale-approval"], en.sources.removal.previewFailed, en.sources.removal.unconfirmed]) expect(line).not.toMatch(/remov/i);
  // MCP도 같은 낱말이다 — 도구 이름 `detach_source`·`preview_source_detach`, 요약과 설명.
  expect(en.mcp.summary.sourceRemoved("web")).toMatch(/^Detached web\./);
  expect(en.mcp.summary.gitlab.sourceRemoved("web")).toMatch(/^Detached web\./);
  expect(en.mcp.tools.detach_source).toMatch(/^Detach a source/);
  expect(en.mcp.tools.preview_source_detach).toMatch(/^Preview detaching a source/);
});
