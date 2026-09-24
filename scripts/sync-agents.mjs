#!/usr/bin/env node
// Claude Code 원본 → Codex 미러 생성기.
//   CLAUDE.md            → AGENTS.md                                  (.agents/PREAMBLE.md 를 앞에 붙임)
//   .claude/commands/*.md → .agents/skills/source-command-<n>/SKILL.md (래퍼만 씌우고 본문은 원문 그대로)
// 본문은 치환하지 않는다 — 미러가 `CLAUDE.md`·`.claude/commands/` 원본을 그대로 가리켜야 정확하다.
// Codex 런타임 차이(훅 부재·미제공 스킬 등)는 전부 PREAMBLE 로 몰아둔다.
//
// 사용: node scripts/sync-agents.mjs [--check]
//   --check  파일을 쓰지 않고 드리프트만 검출 (드리프트 있으면 exit 1)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

// 원격·배포 상태를 바꾸는 스킬은 Codex 런타임에서 쓰지 않으므로 미러하지 않는다.
// 창구가 둘이면 원격 상태가 경쟁한다 — Claude Code 단독으로 둔다. 셋의 이유가 각각 다르다:
//   push  : dev를 움직인다 (preview 배포)
//   merge : main 머지 = Vercel 프로덕션 배포
//   sync  : dev를 force update한다 — 두 창구가 겹치면 한쪽 작업이 사라진다
// orchestrate : Orca 워커 세션을 띄워 리뷰·통합·push까지 지휘한다 — 지휘자는 Claude Code 단독이다(워커는 Codex일 수 있다).
// (`ship`은 미러한다 — push 이전 단계가 전부 로컬이고, Codex는 10단계 커밋에서 멈춘다는
//  규칙이 스킬 본문과 PREAMBLE에 박혀 있다.)
const EXCLUDE = new Set(["push", "merge", "sync", "runtime-test", "design-sync", "orchestrate"]);

const read = (p) => readFileSync(join(ROOT, p), "utf8");

function parseCommand(src, name) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(src);
  if (!m) throw new Error(`.claude/commands/${name}.md: frontmatter 없음`);
  const desc = /^description:\s*(.*)$/m.exec(m[1]);
  if (!desc) throw new Error(`.claude/commands/${name}.md: description 없음`);
  return { description: desc[1].trim(), body: src.slice(m[0].length).replace(/^\n+/, "") };
}

function buildAgentsMd() {
  const preamble = read(".agents/PREAMBLE.md").trimEnd();
  const claude = read("CLAUDE.md");
  const [first, ...rest] = claude.split("\n");
  if (first.trim() !== "# CLAUDE.md") {
    throw new Error(`CLAUDE.md 첫 줄이 "# CLAUDE.md"가 아니다 (실제: ${first})`);
  }
  return `${preamble}\n\n${rest.join("\n").replace(/^\n+/, "")}`;
}

function buildSkill(name, { description, body }) {
  return [
    "---",
    `name: "source-command-${name}"`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# source-command-${name}`,
    "",
    `Use this skill when the user asks to run the migrated source command \`${name}\`.`,
    "",
    "## Command Template",
    "",
    body.trimEnd(),
    "",
  ].join("\n");
}

/** 미러 산출물 디렉터리 접두사. */
export const MIRROR_PREFIX = "source-command-";

/**
 * `.agents/skills/<dir>`가 이 생성기의 산출물인가.
 *
 * ⚠️ **orphan 삭제의 범위를 정하는 판정이다.** 접두사를 안 보면 손으로 둔 Codex 전용 스킬이
 * `rmSync(recursive)`로 사라진다 — 그리고 `/push` 4c가 `pnpm sync:agents`를 확인 없이 돌리므로
 * 그 삭제는 사람 눈을 한 번도 안 지난다. **생성기는 자기가 만든 것만 지운다.**
 */
export function isMirrorOutput(dirName) {
  return dirName.startsWith(MIRROR_PREFIX);
}

function build() {
  const outputs = new Map([["AGENTS.md", buildAgentsMd()]]);
  const mirrored = new Set();

  for (const file of readdirSync(join(ROOT, ".claude/commands")).sort()) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    if (EXCLUDE.has(name)) continue;
    mirrored.add(`${MIRROR_PREFIX}${name}`);
    outputs.set(
      `.agents/skills/${MIRROR_PREFIX}${name}/SKILL.md`,
      buildSkill(name, parseCommand(read(`.claude/commands/${file}`), name)),
    );
  }
  return { outputs, mirrored };
}

function main() {
  const { outputs, mirrored } = build();

  // 닷파일(.DS_Store 등)은 미러 산출물이 아니므로 orphan으로 잡지 않는다 —
  // 잡으면 check가 false positive 드리프트를 내고, 지워도 커밋할 것이 없어 push 4c가 헛돈다.
  // ⚠️ **`isMirrorOutput`이 두 번째 좁힘이다** — 접두사를 안 보면 손으로 둔 Codex 전용 스킬이
  // 전부 orphan이 되어 재귀 삭제된다 (2026-09-13, Codex 하네스 검토 지적 6).
  const orphans = existsSync(join(ROOT, ".agents/skills"))
    ? readdirSync(join(ROOT, ".agents/skills")).filter(
        (d) => !d.startsWith(".") && isMirrorOutput(d) && !mirrored.has(d),
      )
    : [];

  const drift = [];
  for (const [rel, content] of outputs) {
    const abs = join(ROOT, rel);
    const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    if (current === content) continue;
    drift.push(`${current === null ? "missing" : "stale"}: ${rel}`);
    if (!CHECK) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  for (const d of orphans) {
    drift.push(`orphan: .agents/skills/${d}`);
    if (!CHECK) rmSync(join(ROOT, ".agents/skills", d), { recursive: true, force: true });
  }

  if (CHECK) {
    if (drift.length) {
      console.error("Codex 미러 드리프트 — `pnpm sync:agents` 실행 필요:");
      for (const d of drift) console.error(`  - ${d}`);
      process.exit(1);
    }
    console.log("Codex 미러 최신 상태.");
  } else {
    console.log(drift.length ? `Codex 미러 동기화 (${drift.length}건):` : "Codex 미러 변경 없음.");
    for (const d of drift) console.log(`  - ${d}`);
  }
}

// ⚠️ **import만으로는 아무것도 쓰지 않는다.** `scripts/__tests__/sync-agents.test.ts`가 판정
// 함수를 직접 부르는데, 가드가 없으면 그 import가 미러를 재생성하고 orphan을 지운다 — 테스트가
// 리포를 고치는 구조가 된다.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
