#!/usr/bin/env tsx
/**
 * 어댑터 범용성 측정 CLI — 오픈소스 리포에 `detect`·`read`·왕복을 돌려 지표를 낸다.
 *
 *   pnpm adapter-survey <리포목록.txt> [--json] [--verdicts <파일>] [--out <파일>] [--limit N] [--jobs N]
 *
 * ⚠️ **`--json`을 파이프로 넘길 때는 `pnpm --silent`를 쓴다.** pnpm이 `> tsx scripts/...` 배너를
 * **stdout에** 찍어서 `pnpm x --json | jq`가 항상 깨진다 — 이 스크립트만의 문제가 아니라
 * `pnpm ingest --json`도 같다(2026-09-02 실측). 우리 출력 자체는 유효한 JSON 한 문서다.
 *
 * **읽기 전용이다.** 남의 리포에 아무것도 쓰지 않는다 — clone만 하고, PR·커밋을 만드는 코드가
 * 이 파일에 없다.
 *
 * 파일시스템·git을 아는 층은 이 파일과 `lib/survey/run.ts`(git 러너를 주입받는다) 둘이다. 판정은 전부
 * `lib/survey/`의 순수 함수가 한다 (`selectSurveyFiles` → `surveyOne` → `summarize`).
 *
 * ## blobless partial clone
 *
 * `--depth 1 --filter=blob:none --no-checkout`으로 **트리만** 받는다(리포당 0.9초·200KB). 파일
 * 내용은 `selectSurveyFiles`가 고른 것만 sparse-checkout으로 **한 번에** 받는다 — blob마다
 * `git cat-file`을 부르면 partial clone이 blob당 네트워크 왕복을 해서 리포 하나에 수 분이 든다.
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { promisify } from "node:util";

import { findTarget, flagValue, hasFlag } from "../lib/cli/args";
import { fetchRepo, runSurveys, type GitRunner } from "../lib/survey/run";
import { DIFF_TARGET, summarize } from "../lib/survey/summarize";
import type { RepoSurvey, Verdict } from "../lib/survey/types";

const argv = process.argv.slice(2);
// 값 플래그의 값 자리를 대상으로 오인하지 않는다 — `--limit 5 repos.txt`에서 `5`를 목록 파일로 읽었다.
// 세 CLI가 공유하는 `lib/cli/args.ts`가 정확히 이 함정으로 통합됐는데 이 스크립트만 빠져 있었다
// (2026-09-04 audit #17).
const listPath = findTarget(argv, new Set(["--verdicts", "--out", "--limit", "--jobs"]));
if (!listPath) {
  console.error(
    "사용법: pnpm adapter-survey <리포목록.txt> [--json] [--verdicts <파일>] [--out <파일>] [--limit N] [--jobs N]",
  );
  // 사용법 오류만 2다. 측정 결과는 어떤 값이 나와도 0이다 (아래 §종료 코드).
  process.exit(2);
}

const flag = (name: string): string | undefined => flagValue(argv, `--${name}`);
const asJson = hasFlag(argv, "--json");
// ⚠️ `undefined`면 `.slice(0, undefined)`가 **전량**이다 — 의도한 기본값이지만 읽는 사람에게
// "상한 없음"이 안 보여서 값으로 적는다 (sec-audit 발견 20).
const limit = Number(flag("limit") ?? "0") || Number.POSITIVE_INFINITY;
const jobs = Math.max(1, Number(flag("jobs") ?? "6") || 6);
const outPath = flag("out");
const verdictsPath = flag("verdicts");

const repos = readFileSync(listPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l !== "" && !l.startsWith("#"))
  .slice(0, limit);

const verdicts: Verdict[] =
  verdictsPath && existsSync(verdictsPath) ? (JSON.parse(readFileSync(verdictsPath, "utf8")) as Verdict[]) : [];

const execFileAsync = promisify(execFile);
/** ⚠️ **async다** (audit #21) — `execFileSync`면 워커가 몇 개든 clone이 이벤트 루프를 막아 하나씩만 돈다. */
const git: GitRunner = async (cwd, args) =>
  (await execFileAsync("git", [...args], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })).stdout;

const run = (): Promise<RepoSurvey[]> =>
  runSurveys(repos, jobs, (repo) => fetchRepo(repo, git), (survey, done) => {
    if (asJson) return;
    const tag = survey.failure ? "실패" : (survey.chosen?.adapter ?? "탐지 실패");
    console.error(`  [${String(done).padStart(3)}/${repos.length}] ${survey.repo.padEnd(45)} ${tag}`);
  });

if (!asJson) console.error(`리포 ${repos.length}개, 동시 ${jobs}개\n`);

const surveys = await run();
const { metrics, formatTable, repoTable } = summarize(surveys, verdicts);

if (outPath) {
  writeFileSync(outPath, JSON.stringify({ surveys, metrics }, null, 2));
  if (!asJson) console.error(`\n원자료: ${outPath}`);
}

if (asJson) {
  // ⚠️ `process.exit()`을 쓰지 않는다 — 파이프로 나가는 stdout은 비동기라 버퍼가 남은 채
  // 프로세스가 죽으면 출력이 잘린다(POSTMORTEM 2026-08-31, skillflo가 73KB에서 끊겼다).
  // exitCode만 세우므로 **여기서 명시적으로 빠져나가야** 한다 — 안 그러면 아래 사람용 출력이
  // 이어져 JSON 문서가 두 개 나온다(같은 항목의 2차 원인).
  console.log(JSON.stringify({ metrics, surveys }, null, 2));
} else {
  const { detect, misdetect, roundtrip, diff, localeOrder } = metrics;
  const pct = (r: { n: number; of: number; pct: number }) =>
    `${r.n}/${r.of} (${r.of === 0 ? "–" : r.pct.toFixed(1)}%)`;

  console.log(`\n리포 ${metrics.repoCount}개 (측정 ${metrics.measuredCount}, clone 실패 ${metrics.failedCount})`);
  console.log(`\n① detect 성공률`);
  console.log(`   지원 포맷 대상: ${pct(detect.supported)}`);
  console.log(`   전체 대상:      ${pct(detect.all)}   (미지원 포맷을 표본에 넣었으므로 분모가 둘이다)`);
  console.log(`\n② 오탐률   [${metrics.verdictSource}]`);
  console.log(`   지원 포맷 대상: ${pct(misdetect.supported)}`);
  console.log(`   후보를 낸 전체: ${pct(misdetect.withCandidate)}   (미지원 포맷에서 잡은 것도 오탐이다)`);
  console.log(`   정답 순위 분포: ${JSON.stringify(misdetect.correctRank)}`);
  if (metrics.unjudged.length > 0) {
    console.log(`   ⚠️ 정답 미등록 ${metrics.unjudged.length}개 — 오탐 분모에서 빠졌다`);
  }
  console.log(`\n③ read 에러`);
  for (const [kind, n] of Object.entries(metrics.readErrors)) if (n > 0) console.log(`   ${kind.padEnd(20)} ${n}`);
  console.log(`   ${"무증상 skip".padEnd(20)} ${metrics.silentSkips}   (에러가 아니라 조용히 건너뛴 것 — 게이트를 통과한다)`);
  console.log(`   ${"키 충돌".padEnd(20)} ${metrics.keyCollisions}`);
  console.log(`\n④ 왕복 안정성`);
  console.log(`   의미 동일:      ${pct(roundtrip.semanticSame)}   (다르면 데이터 손실)`);
  console.log(`   바이트 고정점:  ${pct(roundtrip.byteFixpointSame)}   (다르면 결정성 결함)`);
  console.log(`   첫 write diff:  중앙값 ${diff.median?.toFixed(3) ?? "–"}, 절반 이상 바뀐 리포 ${pct(diff.overHalf)}`);
  console.log(`   목표(${DIFF_TARGET}) 초과: ${pct(diff.overTarget)}   (도입 판단은 코퍼스가 아니라 한 리포에서 일어난다)`);
  console.log(`   비-base diff:   중앙값 ${diff.nonBaseMedian?.toFixed(3) ?? "–"}   (base 순서를 전 로케일에 쓰는 설계의 위험이 여기 산다)`);
  console.log(`   왕복 못 돌림:   ${roundtrip.notRun}개   (분모에서 빠지므로 함께 읽어야 한다)`);
  for (const [name, d] of Object.entries(diff.byAdapter)) {
    console.log(`   └ ${name.padEnd(16)} 중앙값 ${d.median?.toFixed(3) ?? "–"}  초과 ${pct(d.overTarget)}`);
  }

  console.log(`\n⑤ 키 순서 보존의 근거   [ARCHITECTURE §1.9]`);
  console.log(
    `   ★ 순서 외 원인 없는 재생성 리포: ${diff.clean.repos}개, 중앙값 ` +
      `${diff.clean.median?.toFixed(3) ?? "–"}, 목표 초과 ${pct(diff.clean.overTarget)}`,
  );
  console.log(`     └ **완료 조건의 분모다** — 전체에 걸면 다른 원인이 섞여 어느 기능이 실패했는지 못 가른다`);
  console.log(
    `   로케일 간 순서 일치율: 중앙값 ${localeOrder.agreementMedian?.toFixed(3) ?? "–"} (리포 ${localeOrder.comparedRepos})` +
      `   → ≥ 0.9면 StringKey.sortIndex, 미만이면 Translation.sortIndex`,
  );
  console.log(`   들여쓰기 2칸:          ${pct(metrics.indent.twoSpace)}   → ≥ 80%면 순서 보존만으로 진행`);
  console.log(`   들여쓰기 분포:         ${JSON.stringify(metrics.indent.distribution)}`);
  console.log(`   잔여 diff 원인(리포):  ${JSON.stringify(metrics.diffCauses)}`);
  console.log(`   수술적 1키 편집 hunk=1: ${pct(metrics.surgicalEdit.oneHunk)}${metrics.surgicalEdit.multiHunkRepos.length > 0 ? `   초과: ${metrics.surgicalEdit.multiHunkRepos.join(", ")}` : ""}`);
  console.log(`   chrome 원본 필드(관측): ${JSON.stringify(metrics.chromeFields)}   (보존되므로 diff 원인이 아니다)`);
  console.log(`   JSON 표현(관측): ${JSON.stringify(metrics.presentation)}   (보존되므로 diff 원인이 아니다)`);
  console.log(`\n부수: ICU 복수형 ${metrics.icuPluralRepos}개 리포, 치환자 ${metrics.placeholderRepos}, 설정 파일 ${metrics.configFileRepos}, 비-점 구분자 ${metrics.nonDotSeparatorRepos.length}`);
  console.log(`\n${formatTable}\n`);
  console.log(repoTable);
}

// **측정 층이라 항상 0이다.** `pnpm scan`과 같은 축 — 남의 리포 상태를 우리 종료 코드로
// 판정하지 않는다. 사용법 오류(위 exit 2)만 예외다.
process.exitCode = 0;
