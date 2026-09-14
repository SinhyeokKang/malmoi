import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 설정 화면의 배선을 **소스에서** 센다 — async 서버 컴포넌트라 렌더 테스트가 없는 층이다
 * (`home-screen.test.ts`와 같은 결).
 *
 * ⚠️ **워크플로 YAML은 표면 전부를 들어야 한다** (multi-surface). Add surface 결과 화면은 한 번
 * 지나가고 새로고침하면 draft가 초기화되므로, 두 번째 표면의 step을 다시 볼 자리가 여기뿐이다.
 * 기본 표면 하나만 렌더하면 대상 리포 workflow를 전환하는 사람이 나머지 step을 손으로 조립한다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** ⚠️ **주석을 벗기고 센다** — docstring이 자기가 피하는 것을 이름으로 적는다. */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const SETTINGS = "app/(edit)/projects/[slug]/settings/page.tsx";

describe("설정 — 워크플로 YAML이 활성 표면 전부를 든다", () => {
  const src = read(SETTINGS);

  it("활성 표면만 읽는다 — 보관된 표면의 step을 붙이면 CI가 없는 표면으로 push한다", () => {
    expect(src).toMatch(/surfaces:\s*\{\s*where:\s*\{\s*archivedAt:\s*null\s*\}/);
  });

  it("표면 목록을 그대로 renderer에 넘긴다 — 기본 표면 하나만 넘기지 않는다", () => {
    expect(src).toContain("renderProjectWorkflowYaml");
    expect(src).toMatch(/surfaces:\s*project\.surfaces\.map\(workflowSurfaceOf\)/);
  });

  it("표면 행 → step 입력 변환을 화면이 직접 하지 않는다 — 그 규칙은 잴 수 있는 자리에 있다", () => {
    expect(src).not.toContain("basePending");
    expect(src).not.toMatch(/adapterName\s*===\s*"ts-dict"/);
  });

  it("표면이 0이면 블록을 그리지 않는다 — step 없는 workflow는 붙여도 아무것도 안 한다", () => {
    expect(src).toMatch(/project\.surfaces\.length\s*>\s*0\s*&&\s*<WorkflowBlock/);
  });
});
