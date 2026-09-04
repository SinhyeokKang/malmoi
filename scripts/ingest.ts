#!/usr/bin/env tsx
/**
 * 로케일 적재 CLI — 리포를 연동했을 때 무엇이 DB에 들어갈지 미리 본다.
 *
 *   pnpm ingest <대상 디렉터리> [--json] [--base <locale>]
 *
 * 파일시스템을 아는 유일한 층이다 — 어댑터의 detect·read·write는 순수 함수다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { adapterFor, detectFormat, detectFormatWith, isAdapterName, namespaceOf } from "../lib/adapters/index";
import { findTarget, flagValue, hasFlag } from "../lib/cli/args";
import { walkFiles } from "../lib/cli/walk";
import { blobSha } from "../lib/githash";
import { pickBaseLocale, selectLocaleFiles } from "../lib/push/payload";

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

const argv = process.argv.slice(2);
// 값 플래그의 값 자리를 대상으로 오인하지 않는다 — `pnpm ingest --adapter ts-dict ./repo`가 `ts-dict`를
// 디렉터리로 읽어 ENOENT로 죽었다 (2026-09-04). `lib/cli/args.ts`가 세 CLI 공통이다.
const target = findTarget(argv, new Set(["--base", "--adapter"]));
if (!target) {
  console.error("사용법: pnpm ingest <대상 디렉터리> [--json] [--base <locale>] [--adapter <name>]");
  process.exit(2);
}
const baseOverride = flagValue(argv, "--base");

const paths = walkFiles(target);

// probe를 준다 — 경로 신호만으로는 검색 인덱스 같은 무관한 JSON 묶음을 잡는다.
const probe = (p: string): string | undefined => {
  try {
    return readFileSync(join(target, p), "utf8");
  } catch {
    return undefined;
  }
};
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
  console.error(`로케일 포맷을 찾지 못했다 (${paths.length}파일 훑음) — 연동 불가.`);
  process.exit(1);
}

const adapter = adapterFor(format);

// 파일 수집은 push와 **같은 함수**를 쓴다 — 여기만 따로 짜면 새 어댑터를 추가할 때 한쪽만 먹인다
// (POSTMORTEM 2026-09-02, ARCHITECTURE §5.5.0).
const files = selectLocaleFiles(adapter.layout, format, paths, probe);

const result = adapter.read(format, files);
// detect는 경로만 보므로 nested를 모른다 — read가 관측한 값을 write에 실어준다.
// **파일별 관측값도 함께 넘긴다** — 포맷 단위 boolean만 넘기면 평평한 파일의 점 키가 쪼개진다.
// **원본 내용도 넘긴다** — 수술적 어댑터는 write에 필수이고, 재생성은 표현(들여쓰기)을 거기서
// 읽는다. 안 넘기면 4칸 리포의 왕복 검증이 계속 `⚠️ 정렬 정규화`를 찍는데 그건 이제 거짓 경고다
// (POSTMORTEM 2026-09-02 — 원본이 필요한 층은 pull·survey·CLI 셋이다).
const writeFormat = {
  ...format,
  nested: result.nested,
  ...(result.nestedByPath === undefined ? {} : { nestedByPath: result.nestedByPath }),
  currentFiles: files,
};

// base 로케일: --base가 없으면 push와 같은 판정(`pickBaseLocale` — en 우선, 없으면 사전순).
// detect가 base를 알 수 없다 — 어느 로케일이 기준인지는 리포의 관례이므로 미결이다 (TASKS §3a 🔒).
const base = baseOverride ?? pickBaseLocale(format.locales);
if (base === undefined) {
  console.error("로케일이 하나도 없다 — 연동 불가.");
  process.exit(1);
}

if (hasFlag(argv, "--json")) {
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
