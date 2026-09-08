#!/usr/bin/env tsx
/**
 * 적재 + 사용처 스캔 → `POST /api/push`. **TASK 7의 GitHub Actions가 할 일과 같은 순서다** —
 * 워크플로는 이 스크립트를 부르거나 같은 단계를 재현한다.
 *
 *   pnpm push:local <대상 디렉터리> --project <slug> [--url http://localhost:3000] [--wrapper <module>#<export>[()]]...
 *
 * ⚠️ **`--project`가 필수다** (2026-09-07). 서버 env 폴백이 사라졌다 — 서버는 프로젝트를 env가 아니라
 * **토큰**으로 정하므로 폴백은 "로컬에서만 성립하는 값"이 되고, `PUSH_TOKEN`이 **그 프로젝트의 토큰 원문**이라
 * slug와 어긋나면 409다.
 *
 * 파일시스템·네트워크를 아는 층이다. 어댑터·스캐너·계획은 전부 순수 함수다.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { config } from "dotenv";

import { detectFormat, detectFormatWith, isAdapterName } from "../lib/adapters/index";
import { findTarget, flagValue, flagValues } from "../lib/cli/args";
import { sourceKind, walkFiles } from "../lib/cli/walk";
import { optionalEnv } from "../lib/env";
import { AppError } from "../lib/failure";
import { adapterErrorMessage } from "../lib/i18n/adapter-errors";
import { assemblePushInput } from "../lib/push/assemble";
import { buildPushPayload } from "../lib/push/payload";
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

const USAGE =
  "사용법: pnpm push:local <대상 디렉터리> --project <slug> [--url ...] [--wrapper <module>#<export>[()]]... [--adapter <name>] [--base <locale>]";

const target = findTarget(argv, VALUE_FLAGS);
if (!target) {
  console.error(USAGE);
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

// **대상 프로젝트는 인자로만 온다.** 폴백을 두면 값이 어디서 왔는지 진단할 수 없고, 기본값 인자 위치의
// 평가가 "플래그를 줬는데 환경변수가 없어 죽는" 실패를 만든 전례가 있다 (POSTMORTEM 2026-08-31 🔁).
const projectSlug = flagValue(argv, "--project");
if (projectSlug === undefined) {
  console.error("--project <slug>가 필요하다 — 서버는 이 slug를 토큰이 정한 프로젝트와 대조한다(다르면 409).");
  console.error(USAGE);
  process.exit(2);
}

// 토큰은 **적재·스캔 전에** 확인한다 — 다 끝낸 뒤 stdout에 결과를 찍고 나서 죽으면 파이프 출력이
// 잘릴 수 있고(POSTMORTEM 2026-08-31), 애초에 없는 토큰으로 일을 시작할 이유가 없다.
// ⚠️ **`PUSH_TOKEN`은 그 프로젝트의 토큰 원문이다** — 서버 env와 같은 값이 아니다(그런 변수는 더 없다).
// 프로젝트 설정 화면에서 발급한 값을 로컬 `.env.local`에 둔다.
const token = optionalEnv("PUSH_TOKEN");
if (token === undefined) {
  console.error("PUSH_TOKEN이 없다 — 그 프로젝트의 토큰 원문을 .env.local에 넣는다(설정 화면에서 발급).");
  process.exit(1);
}

// 커밋 SHA는 대상 리포에서 읽는다 — permalink 기준이라 실제 값이어야 한다.
const commitSha = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
// 커밋 **시각**은 역행 판정의 근거다 (ARCHITECTURE §5.5.5). `%cI`가 offset이 붙은 ISO 8601이다.
const commitAt = execFileSync("git", ["-C", target, "show", "-s", "--format=%cI", "HEAD"], { encoding: "utf8" }).trim();
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
// ⚠️ **select → read → base 판정은 `lib/push/assemble.ts`가 든다** (2026-09-07). 서버의 첫 적재가 같은
// 함수를 지나야 "CI로 올린 것과 온보딩이 올린 것이 같다"가 구조로 보장된다 (design §4).
// base가 키 집합의 진실이라 명시가 탐지 목록에 없으면 그 함수가 던진다 (2026-09-04 audit #1).
// `--base`가 탐지 목록에 없으면 `assemblePushInput`이 던진다. **플래그 이름을 먼저 찍는다** — 사용자가
// 고쳐야 하는 것은 인자이고, composite action에서는 그 입력 이름이 `base-locale`이다.
const baseOverride = flagValue(argv, "--base");
if (baseOverride !== undefined && !format.locales.includes(baseOverride)) {
  console.error(`--base ${baseOverride}: 탐지된 로케일(${format.locales.slice().sort().join(", ")})에 없다.`);
  process.exit(1);
}
let assembled: ReturnType<typeof assemblePushInput>;
try {
  assembled = assemblePushInput({ paths, probe, format, baseLocale: baseOverride });
} catch (error) {
  // 어댑터가 던지는 예기치 못한 오류까지 삼키지 않는다 — 우리 판정만 한 줄로 접고 나머지는 스택을 남긴다.
  if (!(error instanceof AppError)) throw error;
  console.error(error.message);
  process.exit(1);
}
const { read, baseLocale } = assembled;

if (read.errors.length) {
  console.error(`적재 에러 ${read.errors.length}건 — CI를 실패시킨다:`);
  for (const e of read.errors.slice(0, 10)) console.error(`  ${e.path}  ${adapterErrorMessage(e)}`);
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
