#!/usr/bin/env tsx
/**
 * 가이드 스크린샷 stale 목록 — 촬영 매핑 표(`guide/SHOOTING.md` `#shots`)의 기록 SHA를 작업 트리의
 * `git hash-object`와 견준다.
 *
 *   pnpm guide:check [--json]
 *
 * **읽기 전용이고 결과가 어떻든 exit 0이다** — 인자 오류만 2(`pnpm scan`과 같은 규약). stale은 "다시 찍어라"는
 * 신호일 뿐 막을 일이 아니고, 찍을 수 있는 런타임이 로컬뿐이다. `/guide`·`/guide-shots`·`/push`가 이 출력을
 * 인용한다 — 판정을 복제하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMd } from "../lib/guide/parse";
import { parseMdTable } from "../lib/guide/sections";
import { shotSources, staleShots, type ShotRecord, type StaleShot } from "../lib/guide/stale";

const USAGE = "사용법: pnpm guide:check [--json]";

const argv = process.argv.slice(2);
if (argv.some((arg) => arg !== "--json")) {
  console.error(USAGE);
  process.exit(2);
}
const json = argv.includes("--json");

// 매핑 표의 경로는 리포 기준이다 — 어느 디렉터리에서 불러도 같은 답을 준다
const root = fileURLToPath(new URL("..", import.meta.url));
const shooting = join(root, "guide", "SHOOTING.md");

function report(stale: StaleShot[] | null, note?: string) {
  if (json) {
    console.log(JSON.stringify({ stale, ...(note ? { note } : {}) }, null, 2));
    return;
  }
  if (stale === null) {
    console.log(note);
    return;
  }
  if (stale.length === 0) {
    console.log("stale 0 — 모든 컷이 기록 SHA와 같다");
    return;
  }
  console.log(`stale ${new Set(stale.map((s) => s.asset)).size}컷 (${stale.length}건):`);
  for (const s of stale) console.log(`  ${s.reason.padEnd(14)} ${s.asset}${s.source ? `  ← ${s.source}` : ""}`);
}

function main() {
  if (!existsSync(shooting)) return report(null, "no shots — guide/SHOOTING.md가 없다");
  let table: Record<string, string>[] | null;
  try {
    table = parseMdTable(parseMd(readFileSync(shooting, "utf8")), "shots");
  } catch (error) {
    // 표가 깨진 것도 결과다 — 막지 않고 알린다
    return report(null, `매핑 표를 읽지 못했다: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (table === null || table.length === 0) return report(null, "no shots — #shots 절에 매핑이 없다");
  // 열 이름은 SHOOTING.md의 계약이다(G2 이미지 게이트와 같은 표). 없는 열은 빈 셀 → unrecorded로 드러난다
  const rows: ShotRecord[] = table.map((row) => ({ asset: row["에셋"] ?? "", sources: row["소스"] ?? "", blobs: row["blob"] ?? "" }));

  // 리포 밖 경로는 shotSources가 이미 뺐다(→ invalid). 파일이 아닌 경로(삭제·이동·디렉터리)는 hash-object가
  // 던지므로 먼저 거른다 → staleShots가 deleted로 본다
  const present = shotSources(rows).filter((path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile());
  const shas = present.length === 0 ? [] : execFileSync("git", ["hash-object", "--", ...present], { cwd: root, encoding: "utf8" }).trim().split("\n");
  const current = new Map(present.map((path, i) => [path, shas[i] ?? ""]));
  report(staleShots(rows, current));
}

main();
