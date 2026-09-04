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
 * 이 파일이 파일시스템·git을 아는 유일한 층이다. 판정은 전부 `lib/survey/`의 순수 함수가 한다
 * (`selectSurveyFiles` → `surveyOne` → `summarize`).
 *
 * ## blobless partial clone
 *
 * `--depth 1 --filter=blob:none --no-checkout`으로 **트리만** 받는다(리포당 0.9초·200KB). 파일
 * 내용은 `selectSurveyFiles`가 고른 것만 sparse-checkout으로 **한 번에** 받는다 — blob마다
 * `git cat-file`을 부르면 partial clone이 blob당 네트워크 왕복을 해서 리포 하나에 수 분이 든다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findTarget, flagValue, hasFlag } from "../lib/cli/args";
import { selectSurveyFiles } from "../lib/survey/select";
import { DIFF_TARGET, summarize } from "../lib/survey/summarize";
import { surveyOne } from "../lib/survey/one";
import type { RepoSurvey, SurveyInput, Verdict } from "../lib/survey/types";

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
const limit = Number(flag("limit") ?? "0") || undefined;
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

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

/**
 * 리포 하나를 받아 `surveyOne`에 넘길 입력을 만든다. **여기가 유일한 I/O다.**
 *
 * 실패는 던지지 않고 `failure`로 담는다 — 리포 하나가 전체를 멈추면 50개짜리 실행이 첫 사설
 * 리포에서 죽는다 (tasks.md 6).
 */
function fetchRepo(repo: string): SurveyInput {
  const dir = mkdtempSync(join(tmpdir(), "adapter-survey-"));
  try {
    git(dir, ["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", "--quiet", `https://github.com/${repo}.git`, "r"]);
  } catch (cause) {
    rmSync(dir, { recursive: true, force: true });
    return { repo, paths: [], files: new Map(), configFiles: [], failure: `clone 실패: ${short(cause)}` };
  }
  const work = join(dir, "r");
  try {
    const paths = git(work, ["ls-tree", "-r", "HEAD", "--name-only"]).split("\n").filter(Boolean);
    if (paths.length === 0) {
      return { repo, paths: [], files: new Map(), configFiles: [], failure: "빈 트리" };
    }
    const { paths: wanted, configFiles, truncated } = selectSurveyFiles(paths);
    const files = new Map<string, string>();
    if (wanted.length > 0) {
      try {
        // 한 번에 받는다. 개별 blob fetch는 네트워크 왕복이 파일 수만큼 든다.
        git(work, ["sparse-checkout", "set", "--no-cone", ...wanted]);
        git(work, ["checkout", "--quiet", "HEAD"]);
      } catch {
        // 부분 실패해도 받은 것만으로 진행한다 — 아래 읽기가 없는 파일을 건너뛴다.
      }
      for (const p of wanted) {
        try {
          const buf = readFileSync(join(work, p));
          // 비UTF-8·바이너리는 건너뛴다. 로케일 카탈로그가 그런 경우는 그 자체가 관측치다.
          if (buf.includes(0)) continue;
          files.set(p, buf.toString("utf8"));
        } catch {
          // 서브모듈(gitlink)·심볼릭 링크·체크아웃 실패 — 없는 파일로 취급한다.
        }
      }
    }
    return { repo, paths, files, configFiles, truncated };
  } catch (cause) {
    return { repo, paths: [], files: new Map(), configFiles: [], failure: `트리 읽기 실패: ${short(cause)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const short = (cause: unknown): string =>
  String((cause as Error).message ?? cause).split("\n")[0]?.slice(0, 120) ?? "알 수 없음";

/** 리포 목록을 `jobs`개씩 겹쳐 처리한다. clone이 네트워크 대기라 직렬로 돌리면 훨씬 느리다. */
async function run(): Promise<RepoSurvey[]> {
  const out: RepoSurvey[] = [];
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const repo = repos[i];
      if (repo === undefined) return;
      const survey = surveyOne(fetchRepo(repo));
      out.push(survey);
      done += 1;
      if (!asJson) {
        const tag = survey.failure ? "실패" : (survey.chosen?.adapter ?? "탐지 실패");
        console.error(`  [${String(done).padStart(3)}/${repos.length}] ${repo.padEnd(45)} ${tag}`);
      }
      // clone이 동기라 이벤트 루프를 놓아준다.
      await Promise.resolve();
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, repos.length) }, worker));
  return out;
}

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

  console.log(`\n⑤ 키 순서 보존의 근거   [docs/features/key-order-preservation/]`);
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
