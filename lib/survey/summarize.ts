import { compareKeys } from "../adapters/shared";
import { median } from "./stats";
import {
  READ_ERROR_KINDS,
  emptyDiffCauses,
  emptyErrors,
  type DiffCauses,
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

/**
 * 완료 조건의 diff 목표 (`docs/features/key-order-preservation/spec.md`).
 *
 * 중앙값 하나로는 부족해서 **초과 리포 비율**을 함께 낸다 — 도입 판단은 코퍼스가 아니라 한
 * 리포에서 일어나고, 중앙값 0.10은 "절반은 0.10 이하"일 뿐이다.
 */
export const DIFF_TARGET = 0.1;

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
  roundtrip: {
    semanticSame: Rate;
    byteFixpointSame: Rate;
    /**
     * 왕복을 아예 못 돌린 리포 수.
     *
     * ⚠️ **분모에서 조용히 빠진다.** 없으면 "98/100 유지"를 읽을 때 분모가 100에서 줄었는지
     * 알 수 없다 — 실측 2회차에서 `not-run` 8건이 성공/실패 어느 쪽으로도 안 세어져 표가
     * 조용했던 전례가 있다 (`docs/POSTMORTEM.md` 2026-09-02).
     */
    notRun: number;
  };
  diff: {
    median?: number;
    overHalf: Rate;
    /** `DIFF_TARGET`을 넘는 리포 비율 — 완료 조건 게이트 ②. */
    overTarget: Rate;
    /** **비-base** 로케일 파일 diff의 리포별 중앙값. base만 재던 지표의 사각을 덮는다. */
    nonBaseMedian?: number;
    /** 어댑터별 diff — 전에는 마크다운 표에만 있어 `--json | jq`로 완료 조건을 못 읽었다. */
    byAdapter: Record<string, AdapterDiff>;
    /**
     * **순서 외 원인이 하나도 없는 재생성 리포**만의 diff — 키 순서 보존의 완료 조건 분모다.
     *
     * 전체 코퍼스에 목표를 걸면 68%가 들여쓰기·chrome 필드·이스케이프 때문에 초과해서
     * **어느 기능이 실패했는지 못 가른다** (`docs/ADAPTER-COVERAGE.md` §10.3). 순서 보존이
     * **자기 책임 범위에서** 0에 도달하는지를 재는 것이 정직하다.
     *
     * ⚠️ 수술적 어댑터는 분모에서 뺀다 — 이미 0.000이라 넣으면 중앙값을 끌어내려
     * "순서 보존이 잘 됐다"는 거짓 신호가 된다.
     */
    clean: AdapterDiff;
    approximateRepos: string[];
  };

  /**
   * 로케일 간 키 순서 일치율 — `StringKey.sortIndex`(A안)와 `Translation.sortIndex`(대안 E)를
   * 가르는 값이다 (`docs/features/key-order-preservation/tasks.md` 🔒: 중앙값 ≥ 0.9면 A안).
   */
  localeOrder: { agreementMedian?: number; comparedRepos: number };
  /** 원본 들여쓰기 — 2칸 비율이 0.8 미만이면 들여쓰기 보존이 별 기능이 된다 (같은 🔒 표). */
  indent: { twoSpace: Rate; distribution: Record<string, number> };
  /** 잔여 diff 원인별 **리포 수**. 지배 원인이 있으면 목표 수치를 그 근거로 조정한다. */
  diffCauses: Record<keyof DiffCauses, number>;
  /** chrome이 원본에 들고 있는 필드별 리포 수 — **diff 원인이 아니라 관측치다.** */
  chromeFields: { placeholders: number; nonBaseDescription: number };
  /** 원본 표현 관측 — 보존되므로 원인이 아니다. 몇 개 리포가 그 표현을 쓰는지. */
  presentation: { escapedNonAscii: number; compactContainer: number };

  /**
   * 수술적 어댑터에서 **키 1개 편집** write의 hunk 수가 1인 리포 비율. 분모는 측정된 수술적 리포다.
   * `multiHunkRepos`가 재직렬화가 편집 밖 줄을 건드린 리포다 — 왕복·고정점·diff 0.000이 못 보는 축.
   */
  surgicalEdit: { oneHunk: Rate; multiHunkRepos: string[] };

  /** 부수 관측 — 다음 기능의 우선순위 근거다. */
  icuPluralRepos: number;
  placeholderRepos: number;
  configFileRepos: number;
  nonDotSeparatorRepos: string[];

  /** 정답이 등록되지 않아 오탐 분모에 못 들어간 리포. 조용히 빠지면 안 된다. */
  unjudged: string[];
  verdictSource: string;
};

export type AdapterDiff = {
  repos: number;
  median?: number;
  overTarget: Rate;
};

export type SurveySummary = {
  metrics: SurveyMetrics;
  /** 포맷별 요약 — 판정 3·4의 근거를 읽는 층. */
  formatTable: string;
  /** 리포별 상세 — 행 하나가 곧 실패 재현 경로다. */
  repoTable: string;
};

const CAUSE_KEYS = Object.keys(emptyDiffCauses()) as Array<keyof DiffCauses>;

/**
 * 이 기능이 닿는 어댑터. 수술적 3개는 원본을 보존하므로 이미 0.000이고, `orderedEntries`를
 * 지나지도 않는다 — 분모에 넣으면 순서 보존의 성과를 재는 숫자가 아니게 된다.
 */
const REGENERATE_ADAPTERS = new Set(["chrome-locales", "json-catalog"]);

/**
 * `clean` 분모의 최소 키 수.
 *
 * 키가 몇 개뿐이면 줄 하나가 diff 비율을 수십 %씩 움직인다 — carettab은 키 2개에 0.889,
 * next-official은 키 1개에 0.143이었다. 그 값은 "순서가 안 지켜졌다"를 뜻하지 않으므로
 * **지표가 재려는 것과 재는 것이 어긋난다.** 20은 "한 줄이 5%를 넘게 움직이지 않는" 선이다.
 */
const CLEAN_MIN_KEYS = 20;

const emptyCauseCounts = (): Record<keyof DiffCauses, number> =>
  Object.fromEntries(CAUSE_KEYS.map((k) => [k, 0])) as Record<keyof DiffCauses, number>;

/** 그 리포에서 "맞다"고 인정되는 경로 전부 — 대표 + `alsoValid`. */
function acceptedPaths(v: Verdict | undefined): string[] {
  if (v?.correctCatalogPath == null) return [];
  return [v.correctCatalogPath, ...(v.alsoValid ?? [])];
}

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
    const accepted = acceptedPaths(byRepo.get(s.repo));
    // 후보 목록에서 **인정 경로 중 가장 앞선 것**의 순위. 여럿이 맞을 수 있다.
    const ranks = accepted
      .map((want) => s.candidates.findIndex((c) => c.pathTemplate === want))
      .filter((i) => i !== -1);
    const idx = ranks.length === 0 ? -1 : Math.min(...ranks);
    const label = idx === -1 ? "없음" : String(idx + 1);
    correctRank[label] = (correctRank[label] ?? 0) + 1;
    if (s.chosen !== undefined && !accepted.includes(s.chosen.pathTemplate)) misdetectedSupported.push(s);
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
  const nonBaseRatios = rows.map((s) => s.diffRatioNonBase).filter((r): r is number => r !== undefined);

  const byAdapter: Record<string, AdapterDiff> = {};
  const perAdapter = new Map<string, number[]>();
  for (const s of rows) {
    if (s.chosen === undefined || s.diffRatio === undefined) continue;
    (perAdapter.get(s.chosen.adapter) ?? perAdapter.set(s.chosen.adapter, []).get(s.chosen.adapter)!).push(s.diffRatio);
  }
  for (const [name, list] of [...perAdapter.entries()].sort(([a], [b]) => compareKeys(a, b))) {
    byAdapter[name] = {
      repos: list.length,
      median: median(list),
      overTarget: rate(list.filter((r) => r > DIFF_TARGET).length, list.length),
    };
  }

  const agreements = rows.map((s) => s.localeOrderAgreement).filter((r): r is number => r !== undefined);
  const indents = rows.map((s) => s.indent).filter((i): i is NonNullable<typeof i> => i !== undefined);
  const indentDistribution: Record<string, number> = {};
  for (const i of indents) {
    const label = `${i.char}-${i.width}`;
    indentDistribution[label] = (indentDistribution[label] ?? 0) + 1;
  }

  const causeCounts = emptyCauseCounts();
  const chromeFieldCounts = { placeholders: 0, nonBaseDescription: 0 };
  const presentationCounts = { escapedNonAscii: 0, compactContainer: 0 };
  for (const s of rows) {
    for (const key of CAUSE_KEYS) if (s.diffCauses[key]) causeCounts[key] += 1;
    if (s.chromeFields.placeholders) chromeFieldCounts.placeholders += 1;
    if (s.chromeFields.nonBaseDescription) chromeFieldCounts.nonBaseDescription += 1;
    if (s.presentation.escapedNonAscii) presentationCounts.escapedNonAscii += 1;
    if (s.presentation.compactContainer) presentationCounts.compactContainer += 1;
  }

  const edited = rows.filter((s) => s.surgicalEditHunks !== undefined);
  const surgicalEdit = {
    oneHunk: rate(edited.filter((s) => s.surgicalEditHunks === 1).length, edited.length),
    multiHunkRepos: edited.filter((s) => (s.surgicalEditHunks ?? 0) > 1).map((s) => s.repo),
  };

  const cleanRatios = rows
    .filter((s) => s.chosen !== undefined && REGENERATE_ADAPTERS.has(s.chosen.adapter))
    .filter((s) => CAUSE_KEYS.every((k) => !s.diffCauses[k]))
    // 비율이 의미를 갖는 크기여야 한다 — 위 상수 참조.
    .filter((s) => s.keyCount >= CLEAN_MIN_KEYS)
    .map((s) => s.diffRatio)
    .filter((r): r is number => r !== undefined);

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
      notRun: rows.length - ranRoundtrip.length,
    },
    diff: {
      median: median(ratios),
      overHalf: rate(ratios.filter((r) => r > 0.5).length, ratios.length),
      overTarget: rate(ratios.filter((r) => r > DIFF_TARGET).length, ratios.length),
      nonBaseMedian: median(nonBaseRatios),
      byAdapter,
      clean: {
        repos: cleanRatios.length,
        median: median(cleanRatios),
        overTarget: rate(cleanRatios.filter((r) => r > DIFF_TARGET).length, cleanRatios.length),
      },
      approximateRepos,
    },
    localeOrder: { agreementMedian: median(agreements), comparedRepos: agreements.length },
    indent: {
      twoSpace: rate(indents.filter((i) => i.char === "space" && i.width === 2).length, indents.length),
      distribution: indentDistribution,
    },
    diffCauses: causeCounts,
    chromeFields: chromeFieldCounts,
    presentation: presentationCounts,
    surgicalEdit,
    icuPluralRepos,
    placeholderRepos,
    configFileRepos,
    nonDotSeparatorRepos,
    unjudged: measured.filter((s) => !byRepo.has(s.repo)).map((s) => s.repo),
    verdictSource: VERDICT_SOURCE,
  };

  return { metrics, formatTable: buildFormatTable(rows, byRepo), repoTable: buildRepoTable(rows, byRepo) };
}

/** 1층 — 1순위 후보의 어댑터로 묶는다. 탐지 실패도 한 행이다. */
function buildFormatTable(rows: readonly RepoSurvey[], byRepo: ReadonlyMap<string, Verdict>): string {
  const groups = new Map<string, RepoSurvey[]>();
  for (const s of rows) {
    const key = s.failure !== undefined && s.candidates.length === 0 ? "clone 실패" : (s.chosen?.adapter ?? "탐지 실패");
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }
  const header = [
    "| 1순위 어댑터 | 리포 | 오탐 | 왕복 의미 동일 | 바이트 고정점 | diff 중앙값 | 비-base diff | read 에러 | 무증상 skip |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  const lines = [...groups.entries()]
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([name, list]) => {
      // 후보를 낸 행만 오탐 분모다 — `탐지 실패` 그룹의 "0/N (0%)"은 거짓 안심이 된다.
      const judged = list.filter((s) => byRepo.has(s.repo) && s.chosen !== undefined);
      const wrong = judged.filter((s) => !acceptedPaths(byRepo.get(s.repo)).includes(s.chosen!.pathTemplate));
      const rt = list.filter((s) => s.roundtrip.semantic !== "not-run");
      const fx = list.filter((s) => s.roundtrip.byteFixpoint !== "not-run");
      const ratios = list.map((s) => s.diffRatio).filter((r): r is number => r !== undefined);
      const nonBase = list.map((s) => s.diffRatioNonBase).filter((r): r is number => r !== undefined);
      const errs = list.reduce((n, s) => n + READ_ERROR_KINDS.reduce((m, k) => m + s.errors[k], 0), 0);
      const skips = list.reduce((n, s) => n + s.silentSkips, 0);
      const m = median(ratios);
      const mn = median(nonBase);
      return `| \`${name}\` | ${list.length} | ${pct(rate(wrong.length, judged.length))} | ${pct(
        rate(rt.filter((s) => s.roundtrip.semantic === "same").length, rt.length),
      )} | ${pct(rate(fx.filter((s) => s.roundtrip.byteFixpoint === "same").length, fx.length))} | ${
        m === undefined ? "–" : m.toFixed(3)
      } | ${mn === undefined ? "–" : mn.toFixed(3)} | ${errs} | ${skips} |`;
    });
  return [...header, ...lines].join("\n");
}

/** 2층 — 리포마다 한 행. 실패 유형과 1순위 경로가 있어야 재현이 된다. */
function buildRepoTable(rows: readonly RepoSurvey[], byRepo: ReadonlyMap<string, Verdict>): string {
  const header = [
    "| 리포 | 구간 | 1순위 후보 | 판정 | 정답 순위 | 로케일 | 키 | 에러 | skip | 충돌 | 왕복(의미/바이트) | diff | 순서 일치 | 들여쓰기 | 비고 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const lines = rows.map((s) => {
    const v = byRepo.get(s.repo);
    const accepted = acceptedPaths(v);
    const want = v?.correctCatalogPath ?? null;
    const ranks = accepted.map((w) => s.candidates.findIndex((c) => c.pathTemplate === w)).filter((i) => i !== -1);
    const idx = ranks.length === 0 ? -1 : Math.min(...ranks);
    const hit = s.chosen !== undefined && accepted.includes(s.chosen.pathTemplate);
    const mark =
      v === undefined
        ? "❔"
        : s.chosen === undefined
          ? want === null
            ? "➖"
            : "❌"
          : hit
            ? "✅"
            : "❌";
    const rank = want === null ? "–" : idx === -1 ? "없음" : String(idx + 1);
    const errs = READ_ERROR_KINDS.reduce((m, k) => m + s.errors[k], 0);
    const notes = [
      s.failure,
      hit && s.chosen !== undefined && s.chosen.pathTemplate !== want ? "다른 유효 표면" : undefined,
      s.truncated ? "선택 잘림" : undefined,
      s.diffApproximate ? "diff 근사" : undefined,
      s.surgicalEditHunks !== undefined && s.surgicalEditHunks !== 1 ? `편집 hunk ${s.surgicalEditHunks}` : undefined,
      v?.unsupported ? `미지원: ${v.unsupported}` : undefined,
      s.configFiles.length > 0 ? `설정 ${s.configFiles.length}` : undefined,
    ].filter(Boolean);
    return `| [${s.repo}](https://github.com/${s.repo}) | ${v?.tier ?? "–"} | ${
      s.chosen ? `\`${s.chosen.pathTemplate}\`` : "–"
    } | ${mark} | ${rank} | ${s.localeCount} | ${s.keyCount} | ${errs} | ${s.silentSkips} | ${s.keyCollisions} | ${
      s.roundtrip.semantic
    }/${s.roundtrip.byteFixpoint} | ${s.diffRatio === undefined ? "–" : s.diffRatio.toFixed(3)} | ${
      s.localeOrderAgreement === undefined ? "–" : `${s.localeOrderAgreement.toFixed(2)} (${s.localeOrderCompared})`
    } | ${s.indent === undefined ? "–" : `${s.indent.char}-${s.indent.width}`} | ${notes.join(", ") || "–"} |`;
  });
  return [...header, ...lines].join("\n");
}
