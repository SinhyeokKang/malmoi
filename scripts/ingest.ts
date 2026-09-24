#!/usr/bin/env tsx
/**
 * 로케일 적재 CLI — 리포를 연동했을 때 무엇이 DB에 들어갈지 미리 본다.
 *
 *   pnpm ingest <대상 디렉터리> [--json] [--base <locale>]
 *
 * 파일시스템을 아는 유일한 층이다 — 어댑터의 detect·read·write는 순수 함수다.
 */
import { adapterFor, namespaceOf } from "../lib/adapters/index";
import { adapterErrorKind } from "../lib/adapters/types";
import { findTarget, flagValue, hasFlag } from "../lib/cli/args";
import { walkFiles } from "../lib/cli/walk";
import { blobSha } from "../lib/githash";
import { adapterErrorMessage } from "../lib/i18n/adapter-errors";
import { matchGlobPaths } from "../lib/adapters/index";
import { sameMeaning } from "../lib/adapters/shared";
import { AppError } from "../lib/failure";
import { assemblePushInput } from "../lib/push/assemble";
import { fileProbe, requestedFormat } from "./format";


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
// 포맷 결정은 `push:local`과 같은 함수다(`scripts/format.ts`) — 미리 본 것과 올리는 것이 갈리지 않는다.
const probe = fileProbe(target);
const requested = requestedFormat(paths, probe, { adapterName: flagValue(argv, "--adapter") });
if (!requested.ok) {
  console.error(requested.message);
  process.exit(requested.exitCode);
}
const { format } = requested;

const adapter = adapterFor(format);

// 파일 수집·read·base 판정은 push와 **같은 함수**(`assemblePushInput`)를 지난다 — 여기만 따로 짜면 새 어댑터를
// 추가할 때 한쪽만 먹이고(POSTMORTEM 2026-09-02), `--base` 검증이 이 CLI에서만 빠진다(launch-readiness L7.3 —
// 탐지되지 않은 로케일을 base로 받아 진짜 base에만 있는 키가 미리보기에서 사라졌다).
// base가 없으면 push와 같은 판정(`pickBaseLocale` — en 우선, 없으면 사전순)이다.
let assembled: ReturnType<typeof assemblePushInput>;
try {
  assembled = assemblePushInput({ paths, probe, format, baseLocale: baseOverride });
} catch (error) {
  // 우리 판정만 한 줄로 접는다 — 어댑터의 예기치 못한 오류는 스택을 남긴다(`scripts/push-local.ts`와 같다).
  if (!(error instanceof AppError)) throw error;
  console.error(error.message);
  process.exit(1);
}
const { read: result, files, baseLocale: base } = assembled;
// detect는 경로만 보므로 nested를 모른다 — read가 관측한 값을 write에 실어준다.
// **파일별 관측값도 함께 넘긴다** — 포맷 단위 boolean만 넘기면 평평한 파일의 점 키가 쪼개진다.
// **원본 내용도 넘긴다** — 수술적 어댑터는 write에 필수이고, 재생성은 표현(들여쓰기)을 거기서
// 읽는다. 안 넘기면 4칸 리포의 왕복 검증이 계속 `⚠️ 정렬 정규화`를 찍는데 그건 이제 거짓 경고다
// (POSTMORTEM 2026-09-02 — 원본이 필요한 층은 pull·survey·CLI 셋이다).
// ⚠️ `currentFiles`는 **파일별로** 싣는다(아래 왕복 루프). 전 로케일을 한 번에 실으면 yaml·code-dict가
// `currentFiles[0]`을 원본으로 잡아 `ar.yml` 본문에 en 값을 치환한 결과를 `en.yml`과 비교한다 —
// 그래서 CLI 왕복 게이트만 거짓 "❌ 데이터 손실"을 내고 있었다 (2026-09-04 audit #8).
const writeFormat = {
  ...format,
  nested: result.nested,
  ...(result.nestedByPath === undefined ? {} : { nestedByPath: result.nestedByPath }),
};

if (hasFlag(argv, "--json")) {
  console.log(JSON.stringify({ format: { ...writeFormat, currentFiles: files }, base, result }, null, 2));
  // ⚠️ process.exit()을 쓰지 않는다 — 파이프로 나가는 stdout은 비동기라 버퍼가 남은 채로
  // 프로세스가 죽으면 출력이 잘린다(skillflo의 --json이 73KB에서 끊겼다).
  // 대신 exitCode만 세우므로 **여기서 명시적으로 빠져나가야** 한다 — 안 그러면 아래
  // 사람용 출력이 이어져 JSON 문서가 두 개 나온다.
  if (result.errors.some((e) => adapterErrorKind(e.code) !== "warning")) process.exitCode = 1;
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

  // 왕복 검증: 읽은 내용을 그대로 되돌려 **어댑터의 read로 다시 읽어** 의미를 비교한다.
  // survey의 게이트와 같은 함수(`sameMeaning`)다 — 자체 JSON 비교는 YAML·code-dict에서 죽고
  // ts-dict(글롭)는 `{locale}` 치환 경로가 없어 검증을 조용히 건너뛰었다 (2026-09-04 audit #8).
  // 재생성 writer는 미번역을 빼므로 그 규칙을 양쪽에 적용한다 — 축은 `writeStrategy`다.
  const dropEmpty = adapter.writeStrategy === "regenerate";
  const targets =
    adapter.layout === "per-locale"
      ? [format.pathTemplate.replaceAll("{locale}", base)]
      : matchGlobPaths(format.pathTemplate, files.map((f) => f.path));
  for (const path of targets) {
    const original = files.find((f) => f.path === path);
    if (!original) continue;
    // multi-locale은 한 파일에 로케일이 여럿이라 로케일마다 write하고 결과를 다음 원본으로 넘긴다
    // (`lib/pull/render.ts`의 이중 루프와 같다). per-locale은 base 한 번이다.
    const localesInFile = adapter.layout === "per-locale" ? [base] : result.locales.map((l) => l.locale);
    let rewritten: string | null = original.content;
    for (const locale of localesInFile) {
      const entries = result.locales.find((l) => l.locale === locale)?.entries ?? [];
      const out = adapter.write(
        { ...writeFormat, currentFiles: [{ path, content: rewritten ?? original.content }] },
        { locale, entries },
      );
      if (out === null) break;
      rewritten = out;
    }
    if (rewritten === null) continue;

    // **파일 단위로 비교한다** — 전체 read(`result`)는 multi-locale에서 namespace 파일 전부의 키를
    // 담고 있어 한 파일의 재읽기와 크기부터 다르다. 원본 한 파일을 다시 읽은 것이 비교 기준이다.
    const before = adapter.read(writeFormat, [original]);
    const back = adapter.read(writeFormat, [{ path, content: rewritten }]);
    const semanticSame = sameMeaning(before, back, dropEmpty);
    const byteSame = blobSha(original.content) === blobSha(rewritten);
    console.log(`\n왕복(${path})`);
    console.log(`  의미 동일:  ${semanticSame ? "✅" : "❌ 데이터 손실"}`);
    console.log(`  바이트 동일: ${byteSame ? "✅" : "⚠️ 표현 정규화 (첫 pull에서 한 번 발생)"}`);
    if (!semanticSame) process.exitCode = 1;
  }
}

  if (result.errors.length) {
    console.error(`\n에러 ${result.errors.length}건:`);
    for (const e of result.errors.slice(0, 15)) console.error(`  ${e.path}  ${adapterErrorMessage(e)}`);
    if (result.errors.length > 15) console.error(`  ... ${result.errors.length - 15}건 더`);
    // 경고(`duplicate-property`)만이면 push:local처럼 실패로 끝내지 않는다(B7a r1).
    if (result.errors.some((e) => adapterErrorKind(e.code) !== "warning")) process.exitCode = 1;
  }
  // ⚠️ **exitCode를 낮추지 않는다** (audit #53) — 위 왕복 게이트가 의미 손실로 세운 1을 `errors.length ? 1 : 0`이 0으로 덮었다.
}
