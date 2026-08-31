#!/usr/bin/env tsx
/**
 * 로케일 적재 CLI — 리포를 연동했을 때 무엇이 DB에 들어갈지 미리 본다.
 *
 *   pnpm ingest <대상 디렉터리> [--json] [--base <locale>]
 *
 * 파일시스템을 아는 유일한 층이다 — 어댑터의 detect·read·write는 순수 함수다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { adapterFor, detectFormat, namespaceOf, type AdapterFile } from "../lib/adapters/index";
import { blobSha } from "../lib/githash";

/** 키 순서를 무시하고 내용만 비교하기 위한 정규화. */
function stableJson(text: string): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v === null || typeof v !== "object") return v;
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sort(obj[k]);
    return out;
  };
  return JSON.stringify(sort(JSON.parse(text)));
}

const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "dist-e2e", "dist-log-viewer", "build", "out", ".next",
  "coverage", "generated", ".vercel", "playwright-report", "test-results",
]);

function walk(root: string, dir: string, acc: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
      walk(root, full, acc);
      continue;
    }
    acc.push(relative(root, full).split(sep).join("/"));
  }
}

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("사용법: pnpm ingest <대상 디렉터리> [--json] [--base <locale>]");
  process.exit(2);
}
const baseArg = argv.indexOf("--base");
const baseOverride = baseArg === -1 ? undefined : argv[baseArg + 1];

const paths: string[] = [];
walk(target, target, paths);

// probe를 준다 — 경로 신호만으로는 검색 인덱스 같은 무관한 JSON 묶음을 잡는다.
const probe = (p: string): string | undefined => {
  try {
    return readFileSync(join(target, p), "utf8");
  } catch {
    return undefined;
  }
};
const format = detectFormat(paths, probe);
if (!format) {
  console.error(`로케일 포맷을 찾지 못했다 (${paths.length}파일 훑음) — 연동 불가.`);
  process.exit(1);
}

const adapter = adapterFor(format);
const files: AdapterFile[] = format.locales
  .map((locale) => format.pathTemplate.replace("{locale}", locale))
  .filter((p) => paths.includes(p))
  .map((p) => ({ path: p, content: readFileSync(join(target, p), "utf8") }));

const result = adapter.read(format, files);
// detect는 경로만 보므로 nested를 모른다 — read가 관측한 값을 write에 실어준다.
const writeFormat = { ...format, nested: result.nested };

// base 로케일: --base가 없으면 en, 없으면 사전순 첫 번째. detect가 base를 알 수 없다 —
// 어느 로케일이 기준인지는 리포의 관례이므로 §10의 미결 항목이다.
const sorted = format.locales.slice().sort();
const base = baseOverride ?? (format.locales.includes("en") ? "en" : sorted[0]);
if (base === undefined) {
  console.error("로케일이 하나도 없다 — 연동 불가.");
  process.exit(1);
}

if (argv.includes("--json")) {
  console.log(JSON.stringify({ format: writeFormat, base, result }, null, 2));
  // ⚠️ process.exit()을 쓰지 않는다 — 파이프로 나가는 stdout은 비동기라 버퍼가 남은 채로
  // 프로세스가 죽으면 출력이 잘린다(skillflo의 --json이 73KB에서 끊겼다).
  // 대신 exitCode만 세우므로 **여기서 명시적으로 빠져나가야** 한다 — 안 그러면 아래
  // 사람용 출력이 이어져 JSON 문서가 두 개 나온다.
  process.exitCode = result.errors.length ? 1 : 0;
} else {

console.log(`어댑터: ${format.adapter}${result.nested ? " (중첩)" : " (flat)"}`);
console.log(`경로:   ${format.pathTemplate}`);
console.log(`로케일: ${format.locales.slice().sort().join(", ")}  (base: ${base})`);
console.log();
for (const l of result.locales) {
  const filled = l.entries.filter((e) => e.message !== "").length;
  const withDesc = l.entries.filter((e) => e.description).length;
  console.log(`  ${l.locale.padEnd(6)} 키 ${String(l.entries.length).padStart(5)}  채워짐 ${String(filled).padStart(5)}  description ${withDesc}`);
}

const baseLocale = result.locales.find((l) => l.locale === base);
if (baseLocale) {
  const ns = new Map<string, number>();
  for (const e of baseLocale.entries) {
    const name = namespaceOf(e.key);
    ns.set(name, (ns.get(name) ?? 0) + 1);
  }
  console.log(`\n네임스페이스 ${ns.size}개: ${[...ns].sort().slice(0, 10).map(([k, v]) => `${k}(${v})`).join(" ")}${ns.size > 10 ? " ..." : ""}`);
  console.log(`\n샘플:`);
  for (const e of baseLocale.entries.slice(0, 5)) {
    console.log(`  ${e.key}  =  ${JSON.stringify(e.message).slice(0, 60)}${e.description ? `  [${e.description}]` : ""}`);
  }

  // 왕복 검증: 읽은 내용을 그대로 되돌려 원본 파일과 바이트 비교한다.
  const originalPath = format.pathTemplate.replace("{locale}", base);
  const original = files.find((f) => f.path === originalPath);
  const rewritten = adapter.write(writeFormat, { locale: base, isBase: true, entries: baseLocale.entries });
  if (original && rewritten !== null) {
    const byteSame = blobSha(original.content) === blobSha(rewritten);
    // **의미 동일이 진짜 게이트다.** 바이트 차이는 원본이 정렬돼 있지 않을 때 항상 나고,
    // 우리 결정성 규칙(키 정렬)의 의도된 결과다 — 첫 pull에서 한 번 정규화되고 이후 안정된다.
    // 의미가 다르면 그건 데이터 손실이므로 실패다.
    const semanticSame = stableJson(original.content) === stableJson(rewritten);
    console.log(`\n왕복(${originalPath})`);
    console.log(`  의미 동일:  ${semanticSame ? "✅" : "❌ 데이터 손실"}`);
    console.log(`  바이트 동일: ${byteSame ? "✅" : "⚠️ 정렬 정규화 (원본이 정렬돼 있지 않다 — 첫 pull에서 한 번 발생)"}`);
    if (!semanticSame) process.exitCode = 1;
  }
}

  if (result.errors.length) {
    console.error(`\n에러 ${result.errors.length}건:`);
    for (const e of result.errors.slice(0, 15)) console.error(`  ${e.path}  ${e.message}`);
    if (result.errors.length > 15) console.error(`  ... ${result.errors.length - 15}건 더`);
  }
  process.exitCode = result.errors.length ? 1 : 0;
}
