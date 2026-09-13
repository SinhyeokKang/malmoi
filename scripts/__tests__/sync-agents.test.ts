import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isMirrorOutput, MIRROR_PREFIX } from "../sync-agents.mjs";

/**
 * **미러 생성기의 orphan 삭제 범위**를 고정한다.
 *
 * ⚠️ `scripts/sync-agents.mjs`는 `.agents/skills/`에서 "이번에 생성하지 않은" 디렉터리를
 * `rmSync(recursive)`로 지운다. 그 필터가 접두사를 보지 않으면 **손으로 만든 Codex 전용 스킬이
 * 조용히 사라진다** — 그리고 `/push` 4c가 `pnpm sync:agents`를 확인 없이 돌리므로 그 삭제는
 * 사람 눈을 한 번도 안 지난다. 생성기는 **자기가 만든 것만** 지워야 한다.
 *
 * 소스를 읽지 않고 함수를 직접 부르는 이유: 접두사 문자열이 소스 어딘가에 있는지가 아니라
 * **판정이 실제로 그렇게 갈리는지**가 불변식이다 (POSTMORTEM 2026-09-03 "이름만 정확한 테스트").
 */

describe("isMirrorOutput — 생성기는 자기 산출물만 orphan으로 잡는다", () => {
  it("미러 산출물 이름을 받는다", () => {
    expect(isMirrorOutput("source-command-tdd")).toBe(true);
    expect(isMirrorOutput(`${MIRROR_PREFIX}anything`)).toBe(true);
  });

  it("손으로 만든 Codex 전용 스킬은 미러 산출물이 아니다 — 지우면 안 된다", () => {
    expect(isMirrorOutput("codex-only-helper")).toBe(false);
    expect(isMirrorOutput("research")).toBe(false);
  });

  it("접두사를 부분 문자열로 갖기만 한 이름은 아니다 — `startsWith`여야 한다", () => {
    expect(isMirrorOutput("legacy-source-command-tdd")).toBe(false);
  });

  it("닷파일은 미러 산출물이 아니다", () => {
    // 생성기가 별도로 거르지만, 접두사 판정만으로도 걸러져야 이중 방어가 성립한다.
    expect(isMirrorOutput(".DS_Store")).toBe(false);
  });
});

describe(".agents/skills/ 실제 내용", () => {
  it("현재 디렉터리는 전부 미러 산출물이다 — 아니면 orphan 삭제 대상이 아닌 것이 섞였다는 뜻", () => {
    const root = new URL("../../", import.meta.url);
    const dirs = readdirSync(fileURLToPath(new URL(".agents/skills", root))).filter(
      (d) => !d.startsWith("."),
    );
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) expect(isMirrorOutput(d)).toBe(true);
  });
});
