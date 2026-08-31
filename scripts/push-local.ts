#!/usr/bin/env tsx
/**
 * 적재 + 사용처 스캔 → `POST /api/push`. **TASK 7의 GitHub Actions가 할 일과 같은 순서다** —
 * 워크플로는 이 스크립트를 부르거나 같은 단계를 재현한다.
 *
 *   pnpm push:local <대상 디렉터리> [--url http://localhost:3000] [--wrapper <module>#<export>]
 *
 * 파일시스템·네트워크를 아는 층이다. 어댑터·스캐너·계획은 전부 순수 함수다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";

import { config } from "dotenv";

import { adapterFor, detectFormat, namespaceOf, type AdapterFile } from "../lib/adapters/index";
import { DEFAULT_WRAPPER, scanSources, type SourceFileInput, type WrapperId } from "../lib/scan/index";

config({ path: ".env.local", quiet: true });

const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const RAW_EXT = new Set([".html", ".htm", ".json"]);
const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "dist-e2e", "dist-log-viewer", "build", "out", ".next",
  "coverage", "generated", ".vercel", "playwright-report", "test-results",
]);

function walk(root: string, dir: string, paths: string[], sources: SourceFileInput[]): void {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
      walk(root, full, paths, sources);
      continue;
    }
    const rel = relative(root, full).split(sep).join("/");
    paths.push(rel);
    const dot = name.lastIndexOf(".");
    const ext = dot === -1 ? "" : name.slice(dot);
    const kind = TS_EXT.has(ext) ? "ts" : RAW_EXT.has(ext) ? "raw" : undefined;
    if (kind) sources.push({ path: rel, code: readFileSync(full, "utf8"), kind });
  }
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

function parseWrapper(raw: string): WrapperId {
  const hash = raw.lastIndexOf("#");
  if (hash <= 0 || hash === raw.length - 1) return DEFAULT_WRAPPER;
  return { module: raw.slice(0, hash), export: raw.slice(hash + 1) };
}

const target = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!target) {
  console.error("사용법: pnpm push:local <대상 디렉터리> [--url ...] [--wrapper <module>#<export>]");
  process.exit(2);
}
const baseUrl = arg("url", "http://localhost:3000");
const wrapper = parseWrapper(arg("wrapper", `${DEFAULT_WRAPPER.module}#${DEFAULT_WRAPPER.export}`));

// 커밋 SHA는 대상 리포에서 읽는다 — permalink 기준이라 실제 값이어야 한다.
const commitSha = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const paths: string[] = [];
const sources: SourceFileInput[] = [];
walk(target, target, paths, sources);

const probe = (p: string): string | undefined => {
  try {
    return readFileSync(join(target, p), "utf8");
  } catch {
    return undefined;
  }
};

// ── 적재 (키의 진실) ────────────────────────────────────────────────────────
const format = detectFormat(paths, probe);
if (!format) {
  console.error(`로케일 포맷을 찾지 못했다 (${paths.length}파일) — 연동 불가.`);
  process.exit(1);
}
const adapter = adapterFor(format);
const files: AdapterFile[] = format.locales
  .map((l) => format.pathTemplate.replace("{locale}", l))
  .filter((p) => paths.includes(p))
  .map((p) => ({ path: p, content: probe(p) ?? "" }));

const read = adapter.read(format, files);
if (read.errors.length) {
  console.error(`적재 에러 ${read.errors.length}건 — CI를 실패시킨다:`);
  for (const e of read.errors.slice(0, 10)) console.error(`  ${e.path}  ${e.message}`);
  process.exit(1);
}

const baseLocale = format.locales.includes("en") ? "en" : format.locales.slice().sort()[0];
if (baseLocale === undefined) {
  console.error("로케일이 없다 — 연동 불가.");
  process.exit(1);
}
const baseEntries = read.locales.find((l) => l.locale === baseLocale)?.entries ?? [];

// ── 사용처 (컨텍스트) — 실패가 경고다 ──────────────────────────────────────
const scan = scanSources(sources, wrapper);
const keySet = new Set(baseEntries.map((e) => e.key));
const refs = scan.refs
  .filter((r) => keySet.has(r.key))
  .flatMap((r) => r.refs.map((loc) => ({ key: r.key, path: loc.path, line: loc.line })));
// 로케일 파일에 없는 키를 코드가 참조하는 것도 경고다 (MVP §3.1 5단계).
const unknownRefs = scan.refs.filter((r) => !keySet.has(r.key)).length;

const payload = {
  commitSha,
  format: {
    adapter: format.adapter,
    pathTemplate: format.pathTemplate,
    nested: read.nested,
    baseLocale,
  },
  locales: format.locales,
  keys: baseEntries.map((e) => ({
    key: e.key,
    sourceText: e.message,
    namespace: namespaceOf(e.key),
    ...(e.description === undefined ? {} : { description: e.description }),
  })),
  // 리포 파일의 번역값 — 없을 때만 채워진다 (서버가 DO NOTHING).
  translations: read.locales.flatMap((l) =>
    l.locale === baseLocale ? [] : l.entries.map((e) => ({ locale: l.locale, key: e.key, value: e.message })),
  ),
  refs,
};

console.log(`대상:     ${target}`);
console.log(`커밋:     ${commitSha.slice(0, 8)}`);
console.log(`포맷:     ${format.adapter}${read.nested ? " (중첩)" : " (flat)"}  ${format.pathTemplate}`);
console.log(`로케일:   ${format.locales.slice().sort().join(", ")}  (base: ${baseLocale})`);
console.log(`키:       ${payload.keys.length} / 번역: ${payload.translations.length} / refs: ${payload.refs.length}`);
console.log(`경고:     스캔 ${scan.warnings.length}건 / 로케일 파일에 없는 참조 키 ${unknownRefs}개`);
console.log(`페이로드: ${(Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0)} KB`);

const token = process.env["PUSH_TOKEN"];
if (!token) {
  console.error("PUSH_TOKEN이 없다 — .env.local을 확인한다.");
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/push`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log(`\nPOST ${baseUrl}/api/push → ${res.status}`);
console.log(text.slice(0, 800));
process.exitCode = res.ok ? 0 : 1;
