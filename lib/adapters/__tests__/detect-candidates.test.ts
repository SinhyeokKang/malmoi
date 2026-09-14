import { describe, expect, it } from "vitest";
import { ADAPTERS, chromeLocales, detectFormat, jsonCatalog, tsDict } from "../index";
import { tsDictDetectByContent } from "../ts-dict";
import type { FileProbe } from "../types";

/**
 * `detectCandidates` — 1순위만이 아니라 **후보 전부를 순위순으로** 돌려준다.
 *
 * 왜 필요한가: 오탐률을 재려면 "1순위가 틀렸고 2순위가 정답이었다"를 관측할 수 있어야 하는데,
 * `detect`는 1순위 하나만 주므로 2순위가 존재했는지조차 알 수 없다
 * (ARCHITECTURE §1.9).
 *
 * **additive여야 한다** — 기존 `detect`·`detectFormat`·`detectFormatWith`의 시그니처와 결과가
 * 그대로여야 호출부(`scripts/ingest.ts`·`scripts/push-local.ts`)를 건드리지 않는다.
 */

/** bugshot-web에서 실제로 발생한 오탐 쌍 — 검색 인덱스가 진짜 카탈로그보다 먼저 잡혔다. */
const MISDETECT_PAIR = [
  "public/search/en.json",
  "public/search/ko.json",
  "src/lib/i18n/en.json",
  "src/lib/i18n/ko.json",
];

const TS_SOURCE = `
const ko = { "a.b": "확인" } as const;
const en = { "a.b": "OK" } satisfies Bundle;
export const ns = { ko, en };
`;

describe("detectCandidates — 후보를 순위순으로 전부 낸다", () => {
  it("json-catalog: 오탐 후보가 2순위로 남아 관측된다", () => {
    const found = jsonCatalog.detectCandidates(MISDETECT_PAIR);
    expect(found.map((c) => c.pathTemplate)).toEqual([
      "src/lib/i18n/{locale}.json",
      "public/search/{locale}.json",
    ]);
  });

  it("chrome-locales: root가 둘이면 둘 다 낸다", () => {
    const found = chromeLocales.detectCandidates([
      "extension/_locales/en/messages.json",
      "extension/_locales/ko/messages.json",
      "src/i18n/_locales/en/messages.json",
      "src/i18n/_locales/ko/messages.json",
      "src/i18n/_locales/ja/messages.json",
    ]);
    // i18n 신호가 있는 쪽이 먼저 — 로케일 수도 더 많다
    expect(found.map((c) => c.pathTemplate)).toEqual([
      "src/i18n/_locales/{locale}/messages.json",
      "extension/_locales/{locale}/messages.json",
    ]);
  });

  it("ts-dict: 자동 탐지 후보를 낸다 (2026-09-14 — ARCHITECTURE §1.9 판정 ③ 뒤집기)", () => {
    expect(tsDict.detectCandidates(["a/i18n/x.ts", "b/i18n/y.ts"], () => TS_SOURCE).map((c) => c.pathTemplate))
      .toEqual(["a/i18n/*.ts", "b/i18n/*.ts"]);
  });

  /**
   * ⚠️ **2026-09-14에 되살렸다.** `tsDictDetectByContent`는 그때까지 "보관된 로직"이었고 지금은
   * `detectCandidates`가 **그것을 그대로 부른다** — 두 진입점이 갈리면 명시 지정과 자동 탐지가
   * 서로 다른 답을 내고, 그 차이는 화면에서 "후보에는 있는데 고르면 안 되는 포맷"으로 나타난다.
   */
  it("ts-dict: 자동 탐지와 명시 지정이 같은 로직을 지난다", () => {
    const paths = ["a/i18n/x.ts", "b/i18n/y.ts"];
    expect(tsDict.detectCandidates(paths, () => TS_SOURCE))
      .toEqual(tsDictDetectByContent(paths, () => TS_SOURCE));
  });

  it("못 찾으면 빈 배열이다 (undefined가 아니다)", () => {
    expect(jsonCatalog.detectCandidates(["src/data/users.json"])).toEqual([]);
    expect(chromeLocales.detectCandidates(["package.json"])).toEqual([]);
    expect(tsDict.detectCandidates(["src/lib/a.ts"], () => "export const x = 1;")).toEqual([]);
  });

  it("probe가 거른 후보는 후보 목록에도 없다 (detect와 같은 관문을 지난다)", () => {
    // 검색 인덱스만 남기고 내용을 배열로 준다 — 카탈로그가 아니므로 후보가 0이어야 한다.
    const onlySearch = ["public/search/en.json", "public/search/ko.json"];
    const probe: FileProbe = () => '[{"id":1},{"id":2}]';
    expect(jsonCatalog.detectCandidates(onlySearch, probe)).toEqual([]);
    // probe가 없으면 경로만 보고 잡는다 — 기존 detect와 같은 성질이다.
    expect(jsonCatalog.detectCandidates(onlySearch)).toHaveLength(1);
  });

  it("진짜 카탈로그만 probe를 통과하면 그것 하나만 남는다", () => {
    const probe: FileProbe = (p) =>
      p.startsWith("src/lib/i18n/") ? '{"a":"A"}' : '[{"id":1}]';
    const found = jsonCatalog.detectCandidates(MISDETECT_PAIR, probe);
    expect(found.map((c) => c.pathTemplate)).toEqual(["src/lib/i18n/{locale}.json"]);
  });
});

describe("detectCandidates는 additive다 — detect가 그 [0]이다", () => {
  /** 어댑터마다 (경로 목록, probe) 조합. `detect`와 `detectCandidates[0]`이 항상 같아야 한다. */
  const CASES: ReadonlyArray<{ name: string; paths: string[]; probe?: FileProbe }> = [
    { name: "빈 목록", paths: [] },
    { name: "관계없는 파일뿐", paths: ["package.json", "src/index.ts"] },
    { name: "chrome 단일 root", paths: ["public/_locales/en/messages.json", "public/_locales/ko/messages.json"] },
    { name: "json 오탐 쌍", paths: MISDETECT_PAIR },
    { name: "json 오탐 쌍 + probe", paths: MISDETECT_PAIR, probe: (p) => (p.startsWith("src/") ? '{"a":"A"}' : "[]") },
    { name: "로케일 1개뿐", paths: ["config/en.json"] },
    { name: "ts 디렉터리 둘", paths: ["a/i18n/x.ts", "b/i18n/y.ts"], probe: () => TS_SOURCE },
    { name: "chrome + json 공존", paths: ["public/_locales/en/messages.json", "public/_locales/ko/messages.json", "src/i18n/en.json", "src/i18n/ko.json"] },
  ];

  /**
   * ⚠️ **예외가 0이 됐다** (2026-09-14 — 판정 ③ 뒤집기). 2026-09-02부터 `ts-dict`만 이 계약 밖이었다:
   * `detectCandidates`가 항상 빈 배열이라 `detect`(명시 지정)와 일치시킬 수가 없었다. 후보를
   * 내기 시작하면서 다섯이 같은 계약을 진다 — **일치를 강요하면 명시 지정이 죽는다**는 옛 경고는
   * 후보가 0일 때의 이야기였다.
   */
  const AUTO_DETECTED = ADAPTERS;

  for (const adapter of AUTO_DETECTED) {
    for (const c of CASES) {
      it(`${adapter.name} / ${c.name}`, () => {
        const one = adapter.detect(c.paths, c.probe);
        const many = adapter.detectCandidates(c.paths, c.probe);
        expect(one).toEqual(many[0]);
        // 못 찾음의 두 표현이 어긋나지 않는다
        expect(one === undefined).toBe(many.length === 0);
      });
    }
  }

  it("명시 지정은 그대로 받는다 — 후보를 내기 시작해도 1순위 계약은 같다", () => {
    const paths = ["a/i18n/x.ts", "b/i18n/y.ts"];
    expect(tsDict.detect(paths, () => TS_SOURCE)?.pathTemplate).toBe("a/i18n/*.ts");
  });

  it("자동 탐지 밖에 남은 어댑터가 0이다 — 다시 빼면 이 줄이 거짓이 된다", () => {
    expect(ADAPTERS.length - AUTO_DETECTED.length).toBe(0);
  });

  it("detectFormat(어댑터 간 첫 매치)도 그대로다", () => {
    expect(detectFormat(MISDETECT_PAIR)?.pathTemplate).toBe("src/lib/i18n/{locale}.json");
    expect(
      detectFormat([
        "public/_locales/en/messages.json",
        "public/_locales/ko/messages.json",
        "src/lib/i18n/en.json",
        "src/lib/i18n/ko.json",
      ])?.adapter,
    ).toBe("chrome-locales");
  });
});
