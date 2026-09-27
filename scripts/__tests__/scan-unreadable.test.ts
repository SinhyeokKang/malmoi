import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, expect, it } from "vitest";

/**
 * **`pnpm scan`은 파일 하나를 못 읽어도 exit 0이다** (audit #16). 전에는 `readFileSync`가 그대로 던져 `EACCES` 하나가 CLI를
 * 죽였다 — 문서가 약속한 "스캔 결과가 어떻든 exit 0"(CLAUDE.md 명령표 · ARCHITECTURE §4)의 반례다. 실제 프로세스를 띄운다 —
 * exit code는 import로는 못 본다.
 */
const repo = mkdtempSync(join(tmpdir(), "malmoi-scan-unreadable-"));
mkdirSync(join(repo, "src"));
writeFileSync(join(repo, "src/a.ts"), 'import { t } from "@/i18n";\nt("hello");\n');
writeFileSync(join(repo, "src/locked.ts"), 'import { t } from "@/i18n";\nt("bye");\n');
afterAll(() => { chmodSync(join(repo, "src/locked.ts"), 0o644); rmSync(repo, { recursive: true, force: true }); });

it.skipIf(process.getuid?.() === 0)("읽지 못한 소스는 unreadable로 알리고 나머지 사용처를 내며 exit 0이다", () => {
  chmodSync(join(repo, "src/locked.ts"), 0o000);
  // 던지면(비0 종료) execFileSync가 예외를 낸다 — 그것이 곧 실패 단언이다.
  const out = execFileSync(join("node_modules", ".bin", "tsx"), ["scripts/scan.ts", repo, "--json", "--wrapper", "@/i18n#t"], { encoding: "utf8" });
  const result = JSON.parse(out) as { refs: { key: string }[]; unreadable: string[] };
  expect(result.unreadable).toEqual(["src/locked.ts"]);
  expect(result.refs.map((r) => r.key)).toEqual(["hello"]);
});

it("push:local도 사용처 소스를 같은 함수로 읽는다 — 직접 readFileSync로 되돌아가지 않는다", () => {
  const source = readFileSync("scripts/push-local.ts", "utf8");
  expect(source).toContain("readSourceFiles(target, paths)");
  expect(source).not.toMatch(/readFileSync\(/);
});
