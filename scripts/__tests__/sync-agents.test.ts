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

describe("deployment and orchestration skill generation", () => {
  it("generates runnable command mirrors and detects later drift without touching user skills", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync, realpathSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, dirname } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "malmoi-agent-mirror-")));
    const put = (path: string, content: string) => {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    };
    try {
      put("CLAUDE.md", "# CLAUDE.md\n\nShared rules.\n");
      put(".agents/PREAMBLE.md", "# AGENTS.md\n");
      put("scripts/sync-agents.mjs", "");
      copyFileSync(new URL("../sync-agents.mjs", import.meta.url), join(root, "scripts/sync-agents.mjs"));
      put(".agents/skills/local-helper/SKILL.md", "User-owned skill");
      put(".agents/skills/source-command-obsolete/SKILL.md", "Obsolete mirror");
      const commands = ["push", "merge", "sync", "orchestrate", "ship", "runtime-test", "design-sync", "guide-shots"];
      for (const name of commands) {
        put(`.claude/commands/${name}.md`, `---\ndescription: ${name} workflow\n---\n\nKeep ${name} gates.\n`);
      }
      const run = (...args: string[]) => spawnSync(process.execPath, [join(root, "scripts/sync-agents.mjs"), ...args], { encoding: "utf8" });
      expect(run("--check").status).toBe(1);
      expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
      expect(run().status).toBe(0);
      for (const name of commands) {
        const mirror = readFileSync(join(root, `.agents/skills/source-command-${name}/SKILL.md`), "utf8");
        expect(mirror).toContain(`name: "source-command-${name}"`);
        expect(mirror).toContain(`Keep ${name} gates.`);
      }
      expect(existsSync(join(root, ".agents/skills/source-command-obsolete"))).toBe(false);
      expect(readFileSync(join(root, ".agents/skills/local-helper/SKILL.md"), "utf8")).toBe("User-owned skill");
      expect(run("--check").status).toBe(0);
      put(".claude/commands/push.md", "---\ndescription: push workflow\n---\n\nUpdated gate.\n");
      expect(run("--check").status).toBe(1);
      expect(readFileSync(join(root, ".agents/skills/source-command-push/SKILL.md"), "utf8")).toContain("Keep push gates.");
      expect(run().status).toBe(0);
      expect(run("--check").status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
