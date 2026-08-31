#!/usr/bin/env tsx
/**
 * 키 스캐너 CLI. 대상 리포의 CI가 이걸 부르고, 로컬에서 눈으로 확인할 때도 쓴다.
 *
 *   pnpm scan <대상 디렉터리> [--json]
 *
 * **파일시스템을 아는 유일한 층이다** — `scanSources`는 순수 함수라 소스 텍스트만 받는다.
 * 에러가 하나라도 있으면 exit 1이다. CI가 그걸로 실패한다 (MVP §3.1 3단계).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { scanSources, type SourceFileInput } from "../lib/scan/index";

/** AST 경로로 보낼 확장자. */
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
/** `__MSG_key__` 정규식 경로로 보낼 확장자. */
const RAW_EXT = new Set([".html", ".htm", ".json"]);
/** 들어가지 않을 디렉터리. 산출물을 스캔하면 같은 키가 중복 ref로 부풀고 느려진다. */
const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "dist-e2e", "build", "out", ".next",
  "coverage", "generated", ".vercel", "playwright-report", "test-results",
]);

function collect(root: string, dir: string, acc: SourceFileInput[]): void {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
      collect(root, full, acc);
      continue;
    }
    const dot = name.lastIndexOf(".");
    const ext = dot === -1 ? "" : name.slice(dot);
    const kind = TS_EXT.has(ext) ? "ts" : RAW_EXT.has(ext) ? "raw" : undefined;
    if (!kind) continue;
    // 경로는 리포 기준 상대경로로 정규화한다 — GitHub permalink가 이 값을 그대로 쓴다.
    acc.push({ path: relative(root, full).split(sep).join("/"), code: readFileSync(full, "utf8"), kind });
  }
}

const [target, ...flags] = process.argv.slice(2);
if (!target) {
  console.error("사용법: pnpm scan <대상 디렉터리> [--json]");
  process.exit(2);
}

const files: SourceFileInput[] = [];
collect(target, target, files);
const { keys, errors } = scanSources(files);

if (flags.includes("--json")) {
  console.log(JSON.stringify({ keys, errors }, null, 2));
} else {
  const byNamespace = new Map<string, number>();
  for (const k of keys) byNamespace.set(k.namespace, (byNamespace.get(k.namespace) ?? 0) + 1);

  console.log(`스캔: ${files.length}파일 (ts ${files.filter((f) => f.kind === "ts").length} / raw ${files.filter((f) => f.kind === "raw").length})`);
  console.log(`키: ${keys.length}개 / 네임스페이스: ${byNamespace.size}개`);
  for (const [ns, n] of [...byNamespace].sort()) console.log(`  ${ns}: ${n}`);

  console.log(`\n샘플 (앞 10개):`);
  for (const k of keys.slice(0, 10)) {
    const ref = k.refs[0];
    console.log(`  ${k.key}  "${k.sourceText}"  ${ref ? `${ref.path}:${ref.line}` : "(ref 없음)"}${k.refs.length > 1 ? ` +${k.refs.length - 1}` : ""}`);
  }

  if (errors.length) {
    console.error(`\n에러 ${errors.length}건:`);
    for (const e of errors.slice(0, 30)) console.error(`  ${e.path}:${e.line} ${e.message}`);
    if (errors.length > 30) console.error(`  ... ${errors.length - 30}건 더`);
  }
}

process.exit(errors.length ? 1 : 0);
