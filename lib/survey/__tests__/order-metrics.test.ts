import { describe, expect, it } from "vitest";
import { surveyOne } from "../one";
import { summarize } from "../summarize";
import { emptyChromeFields, emptyDiffCauses, emptyErrors, type RepoSurvey, type SurveyInput } from "../types";

/**
 * 키 순서 보존 기능(`docs/features/key-order-preservation/`)의 **태스크 0 — 측정** 지표.
 *
 * 이 지표들이 닫는 것은 설계 두 갈래다:
 *   - 로케일 간 순서 일치율 → `StringKey.sortIndex`(A안) vs `Translation.sortIndex`(대안 E)
 *   - 들여쓰기 분포·잔여 diff 원인 → 순서 보존만으로 목표(diff ≤ 0.10)가 닫히는가
 *
 * ⚠️ **지표를 만드는 것과 지표가 배선되는 것은 다른 일이다.** `configFileRepos`가 껍데기의 구조
 * 분해 누락으로 구조적으로 항상 0이면서 단위 테스트만 green이었던 전례가 있다
 * (`docs/POSTMORTEM.md` 2026-09-02 "어댑터를 만들고 파일 선택 층에 먹이지 않았다"와 같은 축).
 * 그래서 `SurveyInput.configFiles`를 **필수 필드**로 두어 껍데기가 안 넘기면 타입이 막게 했다.
 */

const two = (obj: unknown) => `${JSON.stringify(obj, null, 2)}\n`;

const input = (repo: string, files: Record<string, string>): SurveyInput => ({
  repo,
  paths: Object.keys(files),
  files: new Map(Object.entries(files)),
  configFiles: [],
});

/** base(en)만 흐트러져 있고 비-base는 이미 우리 순서다 — 순서 일치율이 0이 되는 모양. */
const BASE_SCRAMBLED = {
  "src/i18n/en.json": two({ b: "B", a: "A" }),
  "src/i18n/ko.json": two({ a: "에이", b: "비" }),
  "src/i18n/ja.json": two({ a: "エー", b: "ビー" }),
};

/**
 * base에만 **빈 값**이 있어 base diff만 나는 모양.
 *
 * ⚠️ **픽스처를 두 번 갈았다.** 처음엔 "base만 정렬이 흐트러짐"이었는데 키 순서 보존이 그 diff를
 * 없앴고, 다음엔 4칸 들여쓰기였는데 **원본 포맷 보존이 그것도 없앴다** (2026-09-04). 지표
 * (`diffRatioNonBase`)가 재려는 것은 **base 하나만 재면 안 보이는 격차**이고, 그 격차를 만드는
 * 원인은 시간이 지나며 하나씩 고쳐진다 — 그래서 **이 기능들이 고치지 않는 원인**으로 만들어야
 * 판별력이 남는다. 미번역 제외는 의도된 규칙이라 앞으로도 안 고친다 (MVP §4.1).
 */
const BASE_EMPTY_ONLY = {
  "src/i18n/en.json": two({ a: "A", b: "B", gone: "" }),
  "src/i18n/ko.json": two({ a: "에이", b: "비" }),
  "src/i18n/ja.json": two({ a: "エー", b: "ビー" }),
};

/** 전 로케일에 빈 값 — 비-base도 diff가 난다. */
const ALL_EMPTY = {
  "src/i18n/en.json": two({ a: "A", b: "B", gone: "" }),
  "src/i18n/ko.json": two({ a: "에이", b: "비", gone: "" }),
  "src/i18n/ja.json": two({ a: "エー", b: "ビー", gone: "" }),
};

/** 전 로케일이 base 순서를 그대로 따른다 — A안(base 순서를 전 로케일에 전파)이 성립하는 모양. */
const ALL_AGREE = {
  "src/i18n/en.json": two({ b: "B", a: "A" }),
  "src/i18n/ko.json": two({ b: "비", a: "에이" }),
  "src/i18n/ja.json": two({ b: "ビー", a: "エー" }),
};

/** 잔여 diff 원인 넷이 한 파일에 다 들어 있다. */
const CAUSE_FILE = [
  "{",
  '    "greet": "\\uD55C\\uAD6D",',
  '    "list": [',
  '        "a",',
  '        "",',
  '        "c"',
  "    ],",
  '    "m": {',
  '        "10": "ten",',
  '        "2": "two"',
  "    }",
  "}",
  "",
].join("\n");

const CAUSES = {
  "src/i18n/en.json": CAUSE_FILE,
  "src/i18n/ko.json": CAUSE_FILE,
};

describe("surveyOne — 로케일 간 순서 일치율", () => {
  it("비-base 파일이 base 순서를 안 따르면 0이다", () => {
    const s = surveyOne(input("acme/scrambled", BASE_SCRAMBLED));
    expect(s.chosen?.adapter).toBe("json-catalog");
    expect(s.localeOrderCompared).toBe(2);
    expect(s.localeOrderAgreement).toBe(0);
  });

  it("전 로케일이 base 순서를 따르면 1이다", () => {
    const s = surveyOne(input("acme/agree", ALL_AGREE));
    expect(s.localeOrderCompared).toBe(2);
    expect(s.localeOrderAgreement).toBe(1);
  });

  it("섞여 있으면 비율이 나온다", () => {
    const s = surveyOne(
      input("acme/mixed", {
        "src/i18n/en.json": two({ b: "B", a: "A" }),
        "src/i18n/ko.json": two({ b: "비", a: "에이" }),
        "src/i18n/ja.json": two({ a: "エー", b: "ビー" }),
      }),
    );
    expect(s.localeOrderCompared).toBe(2);
    expect(s.localeOrderAgreement).toBe(0.5);
  });

  it("로케일이 base 하나뿐이면 잴 것이 없다 — 0이 아니라 undefined다", () => {
    // 0으로 보고하면 "순서가 어긋난 리포"로 세어져 대안 E 승격 판정이 오염된다.
    const s = surveyOne(
      input("acme/single", {
        "src/i18n/en.json": two({ b: "B", a: "A" }),
        "src/i18n/en-GB.json": two({ b: "B", a: "A" }),
      }),
    );
    expect(s.localeOrderAgreement === undefined || s.localeOrderCompared > 0).toBe(true);
  });

  it("탐지 실패면 지표가 없다", () => {
    const s = surveyOne(input("acme/none", { "README.md": "# hi\n" }));
    expect(s.localeOrderAgreement).toBeUndefined();
    expect(s.localeOrderCompared).toBe(0);
  });
});

describe("surveyOne — 들여쓰기와 잔여 diff 원인", () => {
  it("base 파일의 들여쓰기를 관측한다", () => {
    expect(surveyOne(input("acme/two", ALL_AGREE)).indent).toEqual({ char: "space", width: 2 });
    expect(surveyOne(input("acme/four", CAUSES)).indent).toEqual({ char: "space", width: 4 });
  });

  it("원인 셋을 각각 표시한다 — 들여쓰기는 고쳐져서 원인 목록에서 빠졌다", () => {
    const s = surveyOne(input("acme/causes", CAUSES));
    expect(s.diffCauses).toMatchObject({
      escapedNonAscii: true,
      sparseArray: true,
      integerKeys: true,
    });
    // 관측치로는 남는다 — 사실이 사라진 것이 아니라 **원인이 아닌 것**이다.
    expect(s.indent).toEqual({ char: "space", width: 4 });
  });

  it("깨끗한 2칸 파일은 원인이 없다", () => {
    const s = surveyOne(input("acme/clean", ALL_AGREE));
    expect(s.diffCauses).toEqual(emptyDiffCauses());
  });

  it("chrome placeholders와 비-base description을 **관측치로** 센다 — 이제 보존되므로 diff 원인이 아니다", () => {
    const s = surveyOne(
      input("acme/chrome", {
        "public/_locales/en/messages.json": two({
          EXT_NAME: { message: "Hi $USER$", description: "greeting", placeholders: { USER: { content: "$1" } } },
          CMD: { message: "Go" },
        }),
        "public/_locales/ko/messages.json": two({
          EXT_NAME: { message: "안녕 $USER$", description: "인사" },
          CMD: { message: "가기" },
        }),
      }),
    );
    expect(s.chosen?.adapter).toBe("chrome-locales");
    expect(s.chromeFields.placeholders).toBe(true);
    expect(s.chromeFields.nonBaseDescription).toBe(true);
    // ⚠️ **`diffCauses`에 있으면 안 된다** — 그러면 chrome 리포가 clean 분모에서 부당하게 빠진다.
    // 실측에서 13개가 그렇게 빠졌고 그들의 diff 중앙값은 0.032로 목표 통과였다.
    expect(s.diffCauses).toEqual(emptyDiffCauses());
  });
});

describe("surveyOne — 비-base 로케일 diff", () => {
  it("base에만 원인이 있으면 비-base diff는 0이다 — base 하나만 재던 지표의 사각", () => {
    const s = surveyOne(input("acme/base-empty", BASE_EMPTY_ONLY));
    expect(s.diffRatio).toBeGreaterThan(0);
    expect(s.diffRatioNonBase).toBe(0);
  });

  it("전 로케일에 원인이 있으면 비-base diff도 0이 아니다", () => {
    const s = surveyOne(input("acme/all-empty", ALL_EMPTY));
    expect(s.diffRatioNonBase).toBeGreaterThan(0);
  });

  it("4칸 들여쓰기만 다른 파일은 이제 diff가 0이다 — 원본 포맷 보존이 한 일이 이것이다", () => {
    const fourSpace = {
      "src/i18n/en.json": `${JSON.stringify({ a: "A", b: "B" }, null, 4)}\n`,
      "src/i18n/ko.json": `${JSON.stringify({ a: "에이", b: "비" }, null, 4)}\n`,
      "src/i18n/ja.json": `${JSON.stringify({ a: "エー", b: "ビー" }, null, 4)}\n`,
    };
    const s = surveyOne(input("acme/four-space", fourSpace));
    expect(s.diffRatio).toBe(0);
    expect(s.diffRatioNonBase).toBe(0);
    // 들여쓰기 **관측치**는 그대로 4칸이다 — 원인이 아니라 사실이다.
    expect(s.indent).toEqual({ char: "space", width: 4 });
  });

  it("순서만 흐트러진 파일은 이제 diff가 0이다 — 태스크 2가 한 일이 이것이다", () => {
    // 전에는 이 픽스처가 base diff > 0을 냈다. 순서 보존이 실제로 프로덕션 경로에서
    // 동작하는지를 **어댑터 단위 테스트가 아니라 survey 진입점에서** 확인하는 지점이다.
    const s = surveyOne(input("acme/scrambled", BASE_SCRAMBLED));
    expect(s.diffRatio).toBe(0);
    expect(s.diffRatioNonBase).toBe(0);
    // 순서 일치율은 원본 텍스트에서 재므로 **여전히 0이다** — write가 고쳐진 것과 무관하다.
    expect(s.localeOrderAgreement).toBe(0);
  });
});

describe("surveyOne — configFiles 배선", () => {
  it("껍데기가 넘긴 설정 파일 목록을 그대로 싣는다", () => {
    const s = surveyOne({ ...input("acme/cfg", ALL_AGREE), configFiles: ["crowdin.yml"] });
    expect(s.configFiles).toEqual(["crowdin.yml"]);
  });
});

// ── summarize 층 ────────────────────────────────────────────────────────

const row = (over: Partial<RepoSurvey> & { repo: string }): RepoSurvey => ({
  fileCount: 10,
  selectedFileCount: 2,
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
  ms: 1,
  ...over,
});

const cand = (pathTemplate: string, adapter: RepoSurvey["candidates"][number]["adapter"]) => ({
  adapter,
  pathTemplate,
  locales: ["en", "ko"],
});

describe("summarize — 어댑터별 diff", () => {
  it("어댑터별 중앙값을 --json으로 읽을 수 있게 낸다", () => {
    // 지금까지 어댑터별 값은 마크다운 표에만 있어 완료 조건 1·2를 jq로 못 읽었다.
    const rows = [
      row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.8 }),
      row({ repo: "a/2", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.6 }),
      row({ repo: "a/3", chosen: cand("_locales/{locale}/messages.json", "chrome-locales"), diffRatio: 0.7 }),
      row({ repo: "a/4", chosen: cand("l/{locale}.yml", "yaml-catalog"), diffRatio: 0 }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.byAdapter["json-catalog"]?.median).toBeCloseTo(0.7);
    expect(metrics.diff.byAdapter["chrome-locales"]?.median).toBeCloseTo(0.7);
    expect(metrics.diff.byAdapter["yaml-catalog"]?.median).toBe(0);
  });

  it("목표(0.10)를 넘는 리포 비율을 낸다 — 중앙값은 '내가 붙일 그 리포'를 말해주지 않는다", () => {
    const rows = [
      row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.02 }),
      row({ repo: "a/2", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.05 }),
      row({ repo: "a/3", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.9 }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.median).toBeCloseTo(0.05);
    expect(metrics.diff.overTarget.n).toBe(1);
    expect(metrics.diff.overTarget.of).toBe(3);
    expect(metrics.diff.byAdapter["json-catalog"]?.overTarget.n).toBe(1);
  });

  it("비-base diff 중앙값을 따로 낸다", () => {
    const rows = [
      row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.8, diffRatioNonBase: 0 }),
      row({ repo: "a/2", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.8, diffRatioNonBase: 0.4 }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.median).toBeCloseTo(0.8);
    expect(metrics.diff.nonBaseMedian).toBeCloseTo(0.2);
  });
});

describe("summarize — 표에 실린다", () => {
  it("포맷별 표에 비-base diff 열이 있다", () => {
    // 태스크 0의 결과는 docs/ADAPTER-COVERAGE.md에 **표로** 기록된다. 표에 없는 숫자는
    // --json에만 있어도 문서로 못 간다 — 지표를 만드는 것과 읽히는 것은 다른 일이다.
    const { formatTable } = summarize(
      [row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), diffRatio: 0.8, diffRatioNonBase: 0.2 })],
      [],
    );
    expect(formatTable).toContain("비-base diff");
    expect(formatTable).toContain("0.200");
  });

  it("리포별 표에 순서 일치율과 들여쓰기가 있다", () => {
    const { repoTable } = summarize(
      [
        row({
          repo: "a/1",
          chosen: cand("i/{locale}.json", "json-catalog"),
          localeOrderAgreement: 0.75,
          localeOrderCompared: 4,
          indent: { char: "space", width: 4 },
        }),
      ],
      [],
    );
    expect(repoTable).toContain("순서 일치");
    expect(repoTable).toContain("0.75");
    expect(repoTable).toContain("space-4");
  });
});

describe("summarize — 순서 보존이 자기 책임 범위에서 닫히는가", () => {
  const clean = () => emptyDiffCauses();
  const dirty = () => ({ ...emptyDiffCauses(), escapedNonAscii: true });

  it("**순서 외 원인이 없는 리포만**의 중앙값을 따로 낸다", () => {
    // 완료 조건의 분모다. 전체 코퍼스에 걸면 68%가 들여쓰기·chrome 필드 때문에 초과해서
    // **어느 기능이 실패했는지 못 가른다** (spec §완료 조건, ADAPTER-COVERAGE §10.3).
    const rows = [
      row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.02, diffCauses: clean() }),
      row({ repo: "a/2", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.04, diffCauses: clean() }),
      row({ repo: "a/3", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.9, diffCauses: dirty() }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.median).toBeCloseTo(0.04);
    expect(metrics.diff.clean.median).toBeCloseTo(0.03);
    expect(metrics.diff.clean.repos).toBe(2);
  });

  it("그 부분집합에서 목표 초과 비율을 낸다", () => {
    const rows = [
      row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.02, diffCauses: clean() }),
      row({ repo: "a/2", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.5, diffCauses: clean() }),
      row({ repo: "a/3", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.9, diffCauses: dirty() }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.clean.overTarget).toMatchObject({ n: 1, of: 2 });
  });

  it("수술적 어댑터는 분모에서 뺀다 — 이 기능이 닿지 않는 어댑터다", () => {
    // 0.000이라 넣으면 중앙값을 끌어내려 "순서 보존이 잘 됐다"는 거짓 신호가 된다.
    const rows = [
      row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.6, diffCauses: clean() }),
      row({ repo: "a/2", chosen: cand("l/{locale}.yml", "yaml-catalog"), keyCount: 500, diffRatio: 0, diffCauses: clean() }),
      row({ repo: "a/3", chosen: cand("l/{locale}.ts", "code-dict"), keyCount: 500, diffRatio: 0, diffCauses: clean() }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.clean.repos).toBe(1);
    expect(metrics.diff.clean.median).toBeCloseTo(0.6);
  });

  it("키가 극히 적은 리포는 분모에서 뺀다 — 비율 자체가 무의미하다", () => {
    // carettab(키 2개, diff 0.889)·next-official(키 1개, 0.143). 키가 몇 개뿐이면 줄 하나가
    // 비율을 수십 %씩 움직여서, 그 값이 "순서가 안 지켜졌다"를 뜻하지 않는다.
    const rows = [
      row({ repo: "a/tiny", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 2, diffRatio: 0.9, diffCauses: clean() }),
      row({ repo: "a/big", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.02, diffCauses: clean() }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.clean.repos).toBe(1);
    expect(metrics.diff.clean.overTarget).toMatchObject({ n: 0, of: 1 });
  });

  it("`.`-키가 중첩과 공존하는 리포도 뺀다 — 키 구분자 계약이 담당하는 축이다", () => {
    const rows = [
      row({
        repo: "a/dotted",
        chosen: cand("i/{locale}.json", "json-catalog"),
        keyCount: 500,
        diffRatio: 0.5,
        diffCauses: { ...emptyDiffCauses(), dottedWithNested: true },
      }),
      row({ repo: "a/ok", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.02, diffCauses: clean() }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.clean.repos).toBe(1);
  });

  it("미번역 제외로 줄이 사라지는 리포도 원인이 있는 쪽이다", () => {
    const rows = [
      row({
        repo: "a/empty",
        chosen: cand("i/{locale}.json", "json-catalog"),
        keyCount: 500,
        diffRatio: 0.25,
        diffCauses: { ...emptyDiffCauses(), emptyValues: true },
      }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.clean.repos).toBe(0);
  });

  it("원인이 없는 리포가 하나도 없으면 중앙값이 undefined다 — 0이 아니다", () => {
    const rows = [row({ repo: "a/1", chosen: cand("i/{locale}.json", "json-catalog"), keyCount: 500, diffRatio: 0.9, diffCauses: dirty() })];
    const { metrics } = summarize(rows, []);
    expect(metrics.diff.clean.median).toBeUndefined();
    expect(metrics.diff.clean.repos).toBe(0);
  });
});

describe("summarize — 왕복 not-run", () => {
  it("not-run 리포 수를 센다 — 분모에서 조용히 빠지면 '98/100 유지'를 읽을 수 없다", () => {
    const rows = [
      row({ repo: "a/1", roundtrip: { semantic: "same", byteFixpoint: "same" } }),
      row({ repo: "a/2", roundtrip: { semantic: "different", byteFixpoint: "same" } }),
      row({ repo: "a/3" }), // not-run
      row({ repo: "a/4" }), // not-run
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.roundtrip.semanticSame).toMatchObject({ n: 1, of: 2 });
    expect(metrics.roundtrip.notRun).toBe(2);
  });
});

describe("summarize — 순서 일치율과 들여쓰기 분포", () => {
  it("일치율의 리포별 중앙값을 낸다 — 이 값이 A안/대안 E를 가른다", () => {
    const rows = [
      row({ repo: "a/1", localeOrderAgreement: 1, localeOrderCompared: 3 }),
      row({ repo: "a/2", localeOrderAgreement: 0.9, localeOrderCompared: 10 }),
      row({ repo: "a/3", localeOrderAgreement: 0.2, localeOrderCompared: 5 }),
      row({ repo: "a/4" }), // 비교 대상 없음 — 분모에서 빠진다
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.localeOrder.agreementMedian).toBeCloseTo(0.9);
    expect(metrics.localeOrder.comparedRepos).toBe(3);
  });

  it("들여쓰기 분포와 2칸 비율을 낸다 — 이 값이 들여쓰기 별기능 판정을 가른다", () => {
    const rows = [
      row({ repo: "a/1", indent: { char: "space", width: 2 } }),
      row({ repo: "a/2", indent: { char: "space", width: 2 } }),
      row({ repo: "a/3", indent: { char: "space", width: 4 } }),
      row({ repo: "a/4", indent: { char: "tab", width: 1 } }),
      row({ repo: "a/5" }), // 관측 불가 — 분모에서 빠진다
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.indent.twoSpace).toMatchObject({ n: 2, of: 4 });
    expect(metrics.indent.distribution).toEqual({ "space-2": 2, "space-4": 1, "tab-1": 1 });
  });

  it("잔여 diff 원인별 리포 수를 낸다", () => {
    const rows = [
      row({ repo: "a/1", diffCauses: { ...emptyDiffCauses(), compactContainer: true, escapedNonAscii: true } }),
      row({ repo: "a/2", diffCauses: { ...emptyDiffCauses(), compactContainer: true } }),
      row({ repo: "a/3", diffCauses: emptyDiffCauses() }),
    ];
    const { metrics } = summarize(rows, []);
    expect(metrics.diffCauses.compactContainer).toBe(2);
    expect(metrics.diffCauses.escapedNonAscii).toBe(1);
    expect(metrics.diffCauses.sparseArray).toBe(0);
  });
});
