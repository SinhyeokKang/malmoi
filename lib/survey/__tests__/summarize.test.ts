import { describe, expect, it } from "vitest";
import { summarize } from "../summarize";
import { emptyChromeFields, emptyDiffCauses, emptyErrors, emptyJsonPresentation, type RepoSurvey, type Verdict } from "../types";

/**
 * `summarize` — `RepoSurvey[]` + **정답 경로 목록** → 지표 4개 + 2층 마크다운 표.
 *
 * 오탐률은 코드가 스스로 판정할 수 없다(`detect`가 자기를 채점하면 순환이다). 정답이 무엇인지는
 * 사람/실행 주체가 `verdicts.json`에 적고, 이 함수는 그 경로와 후보 목록을 **대조**만 한다 —
 * 그래서 `detect`를 고쳐 재실행해도 판정이 살아남는다.
 */

const base = (over: Partial<RepoSurvey> & { repo: string }): RepoSurvey => ({
  fileCount: 100,
  selectedFileCount: 4,
  truncated: false,
  candidates: [],
  localeCount: 0,
  keyCount: 0,
  errors: emptyErrors(),
  keyCollisions: 0,
  silentSkips: 0,
  writeErrors: 0,
  roundtrip: { semantic: "not-run", byteFixpoint: "not-run" },
  diffApproximate: false,
  separators: { dot: 0, underscore: 0, colon: 0, slash: 0, none: 0 },
  icuPluralKeys: 0,
  placeholderKeys: 0,
  configFiles: [],
  localeOrderCompared: 0,
  diffCauses: emptyDiffCauses(),
  chromeFields: emptyChromeFields(),
  presentation: emptyJsonPresentation(),
  ms: 1,
  ...over,
});

const cand = (pathTemplate: string, adapter: RepoSurvey["candidates"][number]["adapter"] = "json-catalog") => ({
  adapter,
  pathTemplate,
  locales: ["en", "ko"],
});

/** 1순위가 정답 */
const HIT = base({
  repo: "acme/hit",
  candidates: [cand("src/i18n/{locale}.json")],
  chosen: cand("src/i18n/{locale}.json"),
  localeCount: 2,
  keyCount: 10,
  roundtrip: { semantic: "same", byteFixpoint: "same" },
  diffRatio: 0.1,
});

/** 1순위가 오탐이고 정답은 2순위 — detect 확장이 없으면 관측 자체가 불가능한 경우 */
const MISS = base({
  repo: "acme/miss",
  candidates: [cand("public/search/{locale}.json"), cand("src/lib/i18n/{locale}.json")],
  chosen: cand("public/search/{locale}.json"),
  localeCount: 2,
  keyCount: 5,
  roundtrip: { semantic: "same", byteFixpoint: "different" },
  diffRatio: 0.95,
  errors: { ...emptyErrors(), "json-parse": 2 },
});

/** 미지원 포맷(YAML) — 후보를 내면 그 자체가 오탐이다 */
const UNSUPPORTED_DETECTED = base({
  repo: "acme/yaml",
  candidates: [cand("config/{locale}.json")],
  chosen: cand("config/{locale}.json"),
  localeCount: 2,
  keyCount: 3,
});

/** 미지원 포맷이고 아무것도 못 찾음 — 설계상 실패라 지원 포맷 분모에서 빠진다 */
const UNSUPPORTED_MISSED = base({ repo: "acme/yaml2" });

/**
 * 지원 포맷인데 후보를 아예 못 냄 — **탐지 실패**다.
 *
 * 지표 ①이 세는 사건이고 **지표 ②(오탐)가 세면 안 된다**: "엉뚱한 걸 잡았다"와 "아무것도 못
 * 잡았다"는 고쳐야 할 곳이 다르고, 섞으면 오탐률이 탐지율의 그림자가 된다.
 */
const SUPPORTED_MISSED = base({ repo: "acme/missed", localeCount: 0 });

/** clone 실패 */
const FAILED = base({ repo: "acme/gone", failure: "clone 실패" });

const VERDICTS: Verdict[] = [
  { repo: "acme/hit", correctCatalogPath: "src/i18n/{locale}.json", note: "유일한 카탈로그" },
  { repo: "acme/miss", correctCatalogPath: "src/lib/i18n/{locale}.json", note: "public/search는 검색 인덱스다" },
  { repo: "acme/yaml", correctCatalogPath: null, unsupported: "yaml", note: "locales/{locale}.yml" },
  { repo: "acme/yaml2", correctCatalogPath: null, unsupported: "yaml", note: "config/locales/{locale}.yml" },
  { repo: "acme/missed", correctCatalogPath: "locales/{locale}.json", note: "지원 포맷인데 probe가 걸렀다" },
  { repo: "acme/gone", correctCatalogPath: null, unsupported: "unknown", note: "클론 실패로 판정 불가" },
];

const ALL = [HIT, MISS, UNSUPPORTED_DETECTED, UNSUPPORTED_MISSED, SUPPORTED_MISSED, FAILED];

describe("summarize — 지표", () => {
  const { metrics } = summarize(ALL, VERDICTS);

  it("clone 실패는 분모에서 뺀다 (측정하지 못한 것과 측정해서 실패한 것은 다르다)", () => {
    expect(metrics.repoCount).toBe(6);
    expect(metrics.failedCount).toBe(1);
    expect(metrics.measuredCount).toBe(5);
  });

  it("지표 ① detect 성공률: 분모 두 개를 모두 낸다", () => {
    // 지원 포맷 리포 = hit, miss, missed → 2개가 후보를 냈다
    expect(metrics.detect.supported).toMatchObject({ n: 2, of: 3 });
    // 전체(측정된 것) = hit, miss, yaml, yaml2, missed → 3개가 후보를 냈다
    expect(metrics.detect.all).toMatchObject({ n: 3, of: 5 });
  });

  it("지표 ② 오탐률: **후보를 낸 리포만** 분모다 — 탐지 실패는 지표 ①이 센다", () => {
    // 지원 포맷 중 후보를 낸 것 = hit, miss → 그중 miss 1개가 1순위 오탐.
    // missed(탐지 실패)는 여기 분모에 들어가지 않는다.
    expect(metrics.misdetect.supported).toMatchObject({ n: 1, of: 2 });
    // 후보를 낸 3개 중 miss + yaml(미지원인데 잡음) = 2개가 오탐
    expect(metrics.misdetect.withCandidate).toMatchObject({ n: 2, of: 3 });
  });

  it("정답 순위 분포에는 탐지 실패도 '없음'으로 남는다 (분모에서 뺀 것이 사라지진 않는다)", () => {
    expect(metrics.misdetect.correctRank).toEqual({ "1": 1, "2": 1, "없음": 1 });
  });

  it("지표 ③ read 에러를 유형별로 합산한다", () => {
    expect(metrics.readErrors["json-parse"]).toBe(2);
    expect(metrics.readErrors["leaf-type"]).toBe(0);
  });

  it("지표 ① 탐지 실패는 지표 ②를 오염시키지 않는다 (섞으면 오탐률이 탐지율의 그림자가 된다)", () => {
    const onlyMissed = summarize([SUPPORTED_MISSED], [
      { repo: "acme/missed", correctCatalogPath: "locales/{locale}.json", note: "" },
    ]);
    expect(onlyMissed.metrics.detect.supported).toMatchObject({ n: 0, of: 1 });
    // 후보가 없으니 오탐률은 정의되지 않는다 — 0/0이지 1/1이 아니다
    expect(onlyMissed.metrics.misdetect.supported).toMatchObject({ n: 0, of: 0 });
    expect(onlyMissed.metrics.misdetect.withCandidate).toMatchObject({ n: 0, of: 0 });
  });

  it("지표 ④ 왕복 2층을 따로 낸다", () => {
    expect(metrics.roundtrip.semanticSame).toMatchObject({ n: 2, of: 2 });
    expect(metrics.roundtrip.byteFixpointSame).toMatchObject({ n: 1, of: 2 });
  });

  it("첫 write 변경 줄 비율의 중앙값과 '절반 이상 바뀐 비율'을 낸다", () => {
    expect(metrics.diff.median).toBeCloseTo((0.1 + 0.95) / 2, 10);
    expect(metrics.diff.overHalf).toMatchObject({ n: 1, of: 2 });
  });

  it("판정 주체를 표시한다 — 자동이 아니라 대조라는 사실이 숫자에 붙어야 한다", () => {
    expect(metrics.verdictSource).toContain("verdicts.json");
  });

  it("정답이 없는 리포는 오탐 분모에서 조용히 빠지지 않는다", () => {
    const { metrics: m } = summarize([HIT], []);
    expect(m.misdetect.supported.of).toBe(0);
    expect(m.unjudged).toEqual(["acme/hit"]);
  });
});

/**
 * ⚠️ **한 리포에 유효한 카탈로그가 둘 이상일 수 있다.** 실측에서 mastodon(Rails YAML 106로케일 +
 * 프런트엔드 JSON 106), chatwoot, Kavita(백엔드+UI), vikunja(백엔드+프런트), uBlock(MV2+MV3)이
 * 그렇다. 어느 쪽을 골라도 "진짜 번역이 사는 곳"이므로 **오탐으로 세면 숫자가 과장된다.**
 */
describe("summarize — 유효한 표면이 둘 이상인 리포", () => {
  const MULTI = base({
    repo: "acme/multi",
    candidates: [cand("backend/i18n/{locale}.json"), cand("frontend/i18n/{locale}.json")],
    chosen: cand("backend/i18n/{locale}.json"),
    localeCount: 2,
    keyCount: 10,
    roundtrip: { semantic: "same", byteFixpoint: "same" },
    diffRatio: 0.2,
  });
  const V: Verdict[] = [
    {
      repo: "acme/multi",
      correctCatalogPath: "frontend/i18n/{locale}.json",
      alsoValid: ["backend/i18n/{locale}.json"],
      note: "모노레포에 표면 둘. 어느 쪽도 진짜다",
    },
  ];

  it("alsoValid에 든 경로를 골랐으면 오탐이 아니다", () => {
    const { metrics } = summarize([MULTI], V);
    expect(metrics.misdetect.supported).toMatchObject({ n: 0, of: 1 });
  });

  it("순위 분포에서도 1순위로 센다", () => {
    const { metrics } = summarize([MULTI], V);
    expect(metrics.misdetect.correctRank).toEqual({ "1": 1 });
  });

  it("alsoValid가 없으면 그대로 오탐이다 (규칙이 느슨해진 게 아니다)", () => {
    const { metrics } = summarize([MULTI], [{ ...V[0]!, alsoValid: undefined }]);
    expect(metrics.misdetect.supported).toMatchObject({ n: 1, of: 1 });
  });

  it("표에 다른 유효 표면을 골랐다는 사실이 남는다", () => {
    const { repoTable } = summarize([MULTI], V);
    expect(repoTable).toContain("다른 유효 표면");
  });
});

describe("summarize — 2층 표", () => {
  const { formatTable, repoTable } = summarize(ALL, VERDICTS);

  it("포맷별 요약 표는 어댑터마다 한 행이고 탐지 실패 행이 있다", () => {
    expect(formatTable).toContain("json-catalog");
    expect(formatTable).toContain("탐지 실패");
    expect(formatTable.split("\n").filter((l) => l.startsWith("|")).length).toBeGreaterThanOrEqual(3);
  });

  it("리포별 상세 표에 1순위 경로와 판정이 있다 — 행 하나가 곧 재현 경로다", () => {
    expect(repoTable).toContain("acme/miss");
    expect(repoTable).toContain("public/search/{locale}.json");
    expect(repoTable).toContain("https://github.com/acme/miss");
    // 판정 표시
    expect(repoTable).toMatch(/❌/);
    expect(repoTable).toMatch(/✅/);
  });

  it("clone 실패 리포도 표에 남는다 (사라지면 분모를 검산할 수 없다)", () => {
    expect(repoTable).toContain("acme/gone");
    expect(repoTable).toContain("clone 실패");
  });

  it("결정적이다 — 입력 순서를 바꿔도 같은 표", () => {
    const a = summarize(ALL, VERDICTS);
    const b = summarize([...ALL].reverse(), [...VERDICTS].reverse());
    expect(b.repoTable).toBe(a.repoTable);
    expect(b.formatTable).toBe(a.formatTable);
  });
});
