import { compareKeys } from "../adapters/shared";
import {
  READ_ERROR_KINDS,
  emptyErrors,
  type Rate,
  type ReadErrorKind,
  type RepoSurvey,
  type Verdict,
} from "./types";

/**
 * `RepoSurvey[]` + **정답 경로 목록** → 지표 4개 + 2층 마크다운 표.
 *
 * **오탐률은 코드가 자동으로 판정할 수 없다** — `detect`가 자기 출력을 채점하면 순환이다. 정답이
 * 무엇인지는 `verdicts.json`에 있고 이 함수는 그 경로와 후보 목록을 **대조**만 한다. 판정이 코드
 * 밖에 있으므로 `detect`를 고쳐 재실행해도 판정이 파괴되지 않는다.
 */

const VERDICT_SOURCE = "사람 판정 — docs/features/adapter-generality/verdicts.json의 정답 경로와 대조";

const rate = (n: number, of: number): Rate => ({ n, of, pct: of === 0 ? 0 : (n / of) * 100 });
const pct = (r: Rate) => `${r.n}/${r.of} (${r.of === 0 ? "–" : r.pct.toFixed(1)}%)`;

export type SurveyMetrics = {
  repoCount: number;
  /** clone 실패 등 **측정 자체가 안 된** 리포. 분모에서 뺀다. */
  failedCount: number;
  measuredCount: number;

  /** 지표 ① — 분모 둘. 미지원 포맷을 표본에 넣었으므로 합산 분모 하나는 표본 구성에 좌우된다. */
  detect: { supported: Rate; all: Rate };

  /** 지표 ② */
  misdetect: {
    /** 지원 포맷이면서 **후보를 낸** 리포 중 1순위가 틀린 비율. 탐지 실패는 지표 ①이 센다. */
    supported: Rate;
    /** 후보를 낸 리포 전체 중 틀린 비율. **미지원 포맷에서 뭔가를 잡은 것도 오탐이다.** */
    withCandidate: Rate;
    /** 정답이 몇 순위였는지. `"1"`이 정답, `"없음"`은 후보 목록에 정답이 아예 없던 경우. */
    correctRank: Record<string, number>;
  };

  /** 지표 ③ */
  readErrors: Record<ReadErrorKind, number>;
  silentSkips: number;
  keyCollisions: number;
  /** 코드 어댑터에서 읽힌 키가 문자열 리터럴 수보다 적었던 리포 — 부분 읽기 의심. */
  partialReadRepos: string[];

  /** 지표 ④ */
  roundtrip: { semanticSame: Rate; byteFixpointSame: Rate };
  diff: { median?: number; overHalf: Rate; approximateRepos: string[] };

  /** 부수 관측 — 다음 기능의 우선순위 근거다. */
  icuPluralRepos: number;
  placeholderRepos: number;
  configFileRepos: number;
  nonDotSeparatorRepos: string[];

  /** 정답이 등록되지 않아 오탐 분모에 못 들어간 리포. 조용히 빠지면 안 된다. */
  unjudged: string[];
  verdictSource: string;
};

export type SurveySummary = {
  metrics: SurveyMetrics;
  /** 포맷별 요약 — 판정 3·4의 근거를 읽는 층. */
  formatTable: string;
  /** 리포별 상세 — 행 하나가 곧 실패 재현 경로다. */
  repoTable: string;
};

export function summarize(surveys: readonly RepoSurvey[], verdicts: readonly Verdict[]): SurveySummary {
  const byRepo = new Map(verdicts.map((v) => [v.repo, v]));
  const rows = [...surveys].sort((a, b) => compareKeys(a.repo, b.repo));

  const measured = rows.filter((s) => s.failure === undefined || s.candidates.length > 0);
  const failed = rows.filter((s) => s.failure !== undefined && s.candidates.length === 0);

  const supported = measured.filter((s) => byRepo.get(s.repo)?.correctCatalogPath != null);
  const withCandidate = measured.filter((s) => s.chosen !== undefined);

  // ⚠️ **탐지 실패는 오탐이 아니다.** 후보를 아예 못 낸 리포를 오탐 분모에 넣으면 오탐률이
  // 탐지율의 그림자가 되고, "엉뚱한 걸 잡았다"와 "아무것도 못 잡았다"가 한 숫자로 뭉개진다 —
  // 고쳐야 할 곳이 서로 다른데도. 순위 분포에는 `없음`으로 남겨 사라지지 않게 한다.
  const supportedWithCandidate = supported.filter((s) => s.chosen !== undefined);
  const correctRank: Record<string, number> = {};
  const misdetectedSupported: RepoSurvey[] = [];
  for (const s of supported) {
    const want = byRepo.get(s.repo)?.correctCatalogPath;
    const idx = s.candidates.findIndex((c) => c.pathTemplate === want);
    const label = idx === -1 ? "없음" : String(idx + 1);
    correctRank[label] = (correctRank[label] ?? 0) + 1;
    if (s.chosen !== undefined && idx !== 0) misdetectedSupported.push(s);
  }
  // 미지원 포맷 리포에서 후보를 낸 것도 오탐이다 — 우리 어댑터가 맞을 수 있는 정답이 없다.
  const falseOnUnsupported = withCandidate.filter((s) => byRepo.get(s.repo)?.correctCatalogPath == null);

  const readErrors = emptyErrors();
  let silentSkips = 0;
  let keyCollisions = 0;
  const partialReadRepos: string[] = [];
  const nonDotSeparatorRepos: string[] = [];
  const approximateRepos: string[] = [];
  let icuPluralRepos = 0;
  let placeholderRepos = 0;
  let configFileRepos = 0;
  for (const s of rows) {
    for (const kind of READ_ERROR_KINDS) readErrors[kind] += s.errors[kind];
    silentSkips += s.silentSkips;
    keyCollisions += s.keyCollisions;
    if (s.readKeyCount !== undefined && s.literalCount !== undefined && s.readKeyCount < s.literalCount / 2) {
      partialReadRepos.push(s.repo);
    }
    const sep = s.separators;
    if (sep.colon > 0 || sep.slash > 0) nonDotSeparatorRepos.push(s.repo);
    if (s.diffApproximate) approximateRepos.push(s.repo);
    if (s.icuPluralKeys > 0) icuPluralRepos += 1;
    if (s.placeholderKeys > 0) placeholderRepos += 1;
    if (s.configFiles.length > 0) configFileRepos += 1;
  }

  const ranRoundtrip = rows.filter((s) => s.roundtrip.semantic !== "not-run");
  const ranFixpoint = rows.filter((s) => s.roundtrip.byteFixpoint !== "not-run");
  const ratios = rows.map((s) => s.diffRatio).filter((r): r is number => r !== undefined);

  const metrics: SurveyMetrics = {
    repoCount: rows.length,
    failedCount: failed.length,
    measuredCount: measured.length,
    detect: {
      supported: rate(supported.filter((s) => s.chosen !== undefined).length, supported.length),
      all: rate(withCandidate.length, measured.length),
    },
    misdetect: {
      supported: rate(misdetectedSupported.length, supportedWithCandidate.length),
      withCandidate: rate(misdetectedSupported.length + falseOnUnsupported.length, withCandidate.length),
      correctRank,
    },
    readErrors,
    silentSkips,
    keyCollisions,
    partialReadRepos,
    roundtrip: {
      semanticSame: rate(ranRoundtrip.filter((s) => s.roundtrip.semantic === "same").length, ranRoundtrip.length),
      byteFixpointSame: rate(
        ranFixpoint.filter((s) => s.roundtrip.byteFixpoint === "same").length,
        ranFixpoint.length,
      ),
    },
    diff: {
      median: median(ratios),
      overHalf: rate(ratios.filter((r) => r > 0.5).length, ratios.length),
      approximateRepos,
    },
    icuPluralRepos,
    placeholderRepos,
    configFileRepos,
    nonDotSeparatorRepos,
    unjudged: measured.filter((s) => !byRepo.has(s.repo)).map((s) => s.repo),
    verdictSource: VERDICT_SOURCE,
  };

  return { metrics, formatTable: buildFormatTable(rows, byRepo), repoTable: buildRepoTable(rows, byRepo) };
}

function median(xs: readonly number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : ((s[mid - 1]! + s[mid]!) / 2);
}

/** 1층 — 1순위 후보의 어댑터로 묶는다. 탐지 실패도 한 행이다. */
function buildFormatTable(rows: readonly RepoSurvey[], byRepo: ReadonlyMap<string, Verdict>): string {
  const groups = new Map<string, RepoSurvey[]>();
  for (const s of rows) {
    const key = s.failure !== undefined && s.candidates.length === 0 ? "clone 실패" : (s.chosen?.adapter ?? "탐지 실패");
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }
  const header = [
    "| 1순위 어댑터 | 리포 | 오탐 | 왕복 의미 동일 | 바이트 고정점 | diff 중앙값 | read 에러 | 무증상 skip |",
    "|---|---|---|---|---|---|---|---|",
  ];
  const lines = [...groups.entries()]
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([name, list]) => {
      // 후보를 낸 행만 오탐 분모다 — `탐지 실패` 그룹의 "0/N (0%)"은 거짓 안심이 된다.
      const judged = list.filter((s) => byRepo.has(s.repo) && s.chosen !== undefined);
      const wrong = judged.filter((s) => s.chosen!.pathTemplate !== (byRepo.get(s.repo)?.correctCatalogPath ?? null));
      const rt = list.filter((s) => s.roundtrip.semantic !== "not-run");
      const fx = list.filter((s) => s.roundtrip.byteFixpoint !== "not-run");
      const ratios = list.map((s) => s.diffRatio).filter((r): r is number => r !== undefined);
      const errs = list.reduce((n, s) => n + READ_ERROR_KINDS.reduce((m, k) => m + s.errors[k], 0), 0);
      const skips = list.reduce((n, s) => n + s.silentSkips, 0);
      const m = median(ratios);
      return `| \`${name}\` | ${list.length} | ${pct(rate(wrong.length, judged.length))} | ${pct(
        rate(rt.filter((s) => s.roundtrip.semantic === "same").length, rt.length),
      )} | ${pct(rate(fx.filter((s) => s.roundtrip.byteFixpoint === "same").length, fx.length))} | ${
        m === undefined ? "–" : m.toFixed(3)
      } | ${errs} | ${skips} |`;
    });
  return [...header, ...lines].join("\n");
}

/** 2층 — 리포마다 한 행. 실패 유형과 1순위 경로가 있어야 재현이 된다. */
function buildRepoTable(rows: readonly RepoSurvey[], byRepo: ReadonlyMap<string, Verdict>): string {
  const header = [
    "| 리포 | 구간 | 1순위 후보 | 판정 | 정답 순위 | 로케일 | 키 | 에러 | skip | 충돌 | 왕복(의미/바이트) | diff | 비고 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const lines = rows.map((s) => {
    const v = byRepo.get(s.repo);
    const want = v?.correctCatalogPath ?? null;
    const idx = want === null ? -1 : s.candidates.findIndex((c) => c.pathTemplate === want);
    const mark =
      v === undefined
        ? "❔"
        : s.chosen === undefined
          ? want === null
            ? "➖"
            : "❌"
          : s.chosen.pathTemplate === want
            ? "✅"
            : "❌";
    const rank = want === null ? "–" : idx === -1 ? "없음" : String(idx + 1);
    const errs = READ_ERROR_KINDS.reduce((m, k) => m + s.errors[k], 0);
    const notes = [
      s.failure,
      s.truncated ? "선택 잘림" : undefined,
      s.diffApproximate ? "diff 근사" : undefined,
      v?.unsupported ? `미지원: ${v.unsupported}` : undefined,
      s.configFiles.length > 0 ? `설정 ${s.configFiles.length}` : undefined,
    ].filter(Boolean);
    return `| [${s.repo}](https://github.com/${s.repo}) | ${v?.tier ?? "–"} | ${
      s.chosen ? `\`${s.chosen.pathTemplate}\`` : "–"
    } | ${mark} | ${rank} | ${s.localeCount} | ${s.keyCount} | ${errs} | ${s.silentSkips} | ${s.keyCollisions} | ${
      s.roundtrip.semantic
    }/${s.roundtrip.byteFixpoint} | ${s.diffRatio === undefined ? "–" : s.diffRatio.toFixed(3)} | ${
      notes.join(", ") || "–"
    } |`;
  });
  return [...header, ...lines].join("\n");
}
