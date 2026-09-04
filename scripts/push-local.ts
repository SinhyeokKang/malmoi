#!/usr/bin/env tsx
/**
 * 적재 + 사용처 스캔 → `POST /api/push`. **TASK 7의 GitHub Actions가 할 일과 같은 순서다** —
 * 워크플로는 이 스크립트를 부르거나 같은 단계를 재현한다.
 *
 *   pnpm push:local <대상 디렉터리> [--url http://localhost:3000] [--wrapper <module>#<export>[()]]...
 *
 * 파일시스템·네트워크를 아는 층이다. 어댑터·스캐너·계획은 전부 순수 함수다.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { config } from "dotenv";

import { adapterFor, detectFormat, detectFormatWith, isAdapterName } from "../lib/adapters/index";
import { findTarget, flagValue, flagValues } from "../lib/cli/args";
import { sourceKind, walkFiles } from "../lib/cli/walk";
import { optionalEnv, requireEnv } from "../lib/env";
import { buildPushPayload, pickBaseLocale, selectLocaleFiles } from "../lib/push/payload";
import {
  DEFAULT_WRAPPERS,
  parseWrapperSpec,
  scanSources,
  type SourceFileInput,
  type WrapperId,
} from "../lib/scan/index";

config({ path: ".env.local", quiet: true });

const argv = process.argv.slice(2);
/** 값을 뒤에 하나 더 먹는 플래그. 대상 디렉터리를 고를 때 그 자리를 건너뛰어야 한다 (`lib/cli/args.ts`). */
const VALUE_FLAGS = new Set(["--url", "--wrapper", "--adapter", "--project", "--base"]);

const target = findTarget(argv, VALUE_FLAGS);
if (!target) {
  console.error("사용법: pnpm push:local <대상 디렉터리> [--url ...] [--wrapper <module>#<export>[()]]... [--adapter <name>] [--project <slug>] [--base <locale>]");
  process.exit(2);
}
const baseUrl = flagValue(argv, "--url") ?? "http://localhost:3000";
const specs = flagValues(argv, "--wrapper");
const wrappers: readonly WrapperId[] = specs.length === 0 ? DEFAULT_WRAPPERS : specs.map((raw) => {
  const parsed = parseWrapperSpec(raw);
  if (!parsed) {
    console.error("--wrapper 형식: <module>#<export> 또는 <module>#<export>() (예: @/i18n#t, next-intl#useTranslations())");
    process.exit(2);
  }
  return parsed;
});

// 토큰은 **적재·스캔 전에** 확인한다 — 다 끝낸 뒤 stdout에 결과를 찍고 나서 죽으면 파이프 출력이
// 잘릴 수 있고(POSTMORTEM 2026-08-31), 애초에 없는 토큰으로 일을 시작할 이유가 없다.
const token = optionalEnv("PUSH_TOKEN");
if (token === undefined) {
  console.error("PUSH_TOKEN이 없다 — .env.local을 확인한다.");
  process.exit(1);
}

// 커밋 SHA는 대상 리포에서 읽는다 — permalink 기준이라 실제 값이어야 한다.
const commitSha = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
// 커밋 **시각**은 역행 판정의 근거다 (ARCHITECTURE §5.5.5). `%cI`가 offset이 붙은 ISO 8601이다.
const commitAt = execFileSync("git", ["-C", target, "show", "-s", "--format=%cI", "HEAD"], { encoding: "utf8" }).trim();
// 서버와 같은 `.env.local`을 읽으므로 기본값은 항상 통과한다. `--project`로 덮으면
// 오배송 거부(409)를 로컬에서 실제로 확인할 수 있다.
//
// ⚠️ `flagValue(...) ?? requireEnv(...)`의 순서가 요지다 — 반대로 두면 **인자가 먼저 평가되므로**
// 플래그를 명시해도 환경변수가 없으면 죽는다 (POSTMORTEM 2026-08-31 🔁).
const projectSlug = flagValue(argv, "--project") ?? requireEnv("ACTIVE_PROJECT_SLUG");

const paths = walkFiles(target);
const sources: SourceFileInput[] = paths.flatMap((path) => {
  const kind = sourceKind(path);
  return kind ? [{ path, code: readFileSync(join(target, path), "utf8"), kind }] : [];
});

const probe = (p: string): string | undefined => {
  try {
    return readFileSync(join(target, p), "utf8");
  } catch {
    return undefined;
  }
};

// ── 적재 (키의 진실) ────────────────────────────────────────────────────────
// ⚠️ 한 리포에 포맷이 둘일 수 있다 — bugshot-2는 _locales(4키)와 ts-dict(903키)가 공존하고
// 탐지 우선순위가 작은 쪽을 고른다. `--adapter <name>`으로 지정하면 그게 이긴다.
const adapterName = flagValue(argv, "--adapter");
// 이름 오타와 미탐지를 가른다 — 둘이 같은 메시지면 진단이 오래 걸린다.
if (adapterName !== undefined && !isAdapterName(adapterName)) {
  console.error(`--adapter ${adapterName}: 등록되지 않은 어댑터다.`);
  process.exit(2);
}
const format = adapterName === undefined
  ? detectFormat(paths, probe)
  : detectFormatWith(adapterName, paths, probe);
if (adapterName !== undefined && !format) {
  console.error(`--adapter ${adapterName}: 이 리포에서 해당 포맷을 찾지 못했다.`);
  process.exit(1);
}
if (!format) {
  console.error(`로케일 포맷을 찾지 못했다 (${paths.length}파일) — 연동 불가.`);
  process.exit(1);
}
const adapter = adapterFor(format);

const read = adapter.read(format, selectLocaleFiles(adapter.layout, format, paths, probe));
if (read.errors.length) {
  console.error(`적재 에러 ${read.errors.length}건 — CI를 실패시킨다:`);
  for (const e of read.errors.slice(0, 10)) console.error(`  ${e.path}  ${e.message}`);
  process.exit(1);
}

// ⚠️ **base가 키 집합의 진실이다** — `keySet`은 base 엔트리로만 만들어진다. 추정(`en` 우선 → 사전순)이
// 틀리면 진짜 base에만 있는 키가 적재에서 빠지고 orphaned로 떨어진다. `ingest`엔 `--base`가 있었는데
// 실제 적재 경로엔 없었다 (2026-09-04 audit #1). 명시가 있으면 로케일 목록에 있어야 한다.
const baseOverride = flagValue(argv, "--base");
if (baseOverride !== undefined && !format.locales.includes(baseOverride)) {
  console.error(`--base ${baseOverride}: 탐지된 로케일(${format.locales.slice().sort().join(", ")})에 없다.`);
  process.exit(1);
}
const baseLocale = baseOverride ?? pickBaseLocale(format.locales);
if (baseLocale === undefined) {
  console.error("로케일이 없다 — 연동 불가.");
  process.exit(1);
}

// ── 사용처 (컨텍스트) — 실패가 경고다 ──────────────────────────────────────
const scan = scanSources(sources, wrappers);

// **생산자는 `lib/push/payload.ts` 하나다.** 리터럴로 조립하던 시절엔 계약이 넓어져도
// 컴파일러가 붙잡을 지점이 없었고, 이 스크립트만 400을 받는 상태로 남았다
// (POSTMORTEM 2026-08-31). 7단계의 Actions 워크플로도 같은 함수를 지나야 한다.
const { payload, unknownRefs, duplicateKeys } = buildPushPayload({
  projectSlug,
  commitSha,
  commitAt,
  format,
  read,
  baseLocale,
  scanRefs: scan.refs,
});

console.log(`대상:     ${target}`);
console.log(`커밋:     ${commitSha.slice(0, 8)}`);
console.log(`포맷:     ${format.adapter}${read.nested ? " (중첩)" : " (flat)"}  ${format.pathTemplate}`);
console.log(`로케일:   ${format.locales.slice().sort().join(", ")}  (base: ${baseLocale})`);
console.log(`키:       ${payload.keys.length} / 번역: ${payload.translations.length} / refs: ${payload.refs.length}`);
console.log(
  `경고:     스캔 ${scan.warnings.length}건 / 로케일 파일에 없는 참조 키 ${unknownRefs}개` +
    (duplicateKeys === 0 ? "" : ` / 중복으로 접힌 엔트리 ${duplicateKeys}개 (점 키와 중첩 키가 같은 평탄화 키를 낸다)`),
);
console.log(`페이로드: ${(Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0)} KB`);

const res = await fetch(`${baseUrl}/api/push`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log(`\nPOST ${baseUrl}/api/push → ${res.status}`);
console.log(text.slice(0, 800));
process.exitCode = res.ok ? 0 : 1;
