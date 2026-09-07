import { describe, expect, it } from "vitest";

import { ADAPTERS, matchGlobPaths } from "@/lib/adapters";
import { sampleOrder } from "@/lib/adapters/shared";
import type { DetectedFormat } from "@/lib/adapters/types";
import { pickBaseLocale } from "@/lib/push/payload";

import { PROBE_LIMITS, formatLabel, ingestTargets, makeProbe, probeTargets, summarizeCandidates } from "../detect";

/**
 * 2패스 탐지의 순수 조각들 (design §3.1·§3.2·§3.3·§4).
 *
 * ⚠️ **`probeTargets`가 고르는 파일은 5)의 검증이 읽을 파일과 바이트 단위로 같아야 한다.** `verifySamples`와
 * `hasDictionary`가 `sampleOrder(locales)`(en 우선 → 코드포인트 순, 3개)를 읽는다. 다른 3개를 받으면 후보가
 * 검증 실패가 아니라 **미검증으로 통째로 떨어진다** — 그래서 아래가 `sampleOrder`를 import해 같은 파일인지 잰다.
 */

const json = (template: string, locales: string[]): DetectedFormat => ({
  adapter: "json-catalog",
  pathTemplate: template,
  locales,
});

describe("probeTargets — 내려받을 blob 경로", () => {
  it("후보마다 `sampleOrder(locales)`와 같은 파일을 고른다 — en 우선, 코드포인트 순, 3개", () => {
    const c = json("src/locales/{locale}.json", ["ko", "en", "ja", "fr"]);
    const targets = probeTargets([c], []);
    expect(targets).toEqual(sampleOrder(new Set(c.locales)).map((l) => `src/locales/${l}.json`));
    expect(targets).toEqual(["src/locales/en.json", "src/locales/fr.json", "src/locales/ja.json"]);
  });

  it("en이 없으면 코드포인트 순 앞 3개다", () => {
    expect(probeTargets([json("i18n/{locale}.json", ["zh", "ko", "ja", "de"])], [])).toEqual([
      "i18n/de.json",
      "i18n/ja.json",
      "i18n/ko.json",
    ]);
  });

  it("로케일이 3개 미만이면 있는 만큼만이다", () => {
    expect(probeTargets([json("i18n/{locale}.json", ["en", "ko"])], [])).toEqual(["i18n/en.json", "i18n/ko.json"]);
  });

  it("code-dict 그룹도 같은 규칙으로 고른다 — `{locale}` 치환에 확장자가 따라온다", () => {
    const group = { pathTemplate: "src/locale/{locale}.ts", locales: new Set(["ko", "en", "ja", "fr"]) };
    expect(probeTargets([], [group])).toEqual(["src/locale/en.ts", "src/locale/fr.ts", "src/locale/ja.ts"]);
  });

  it("상한: JSON류 상위 5 × 3 + code-dict 상위 2 × 3 = 21이다 (design §3.1)", () => {
    expect(PROBE_LIMITS).toEqual({ jsonLike: 5, codeDict: 2 });
    const locales = ["en", "ko", "ja", "fr", "de"];
    const jsonLike = Array.from({ length: 7 }, (_, i) => json(`dir${i}/{locale}.json`, locales));
    const codeDict = Array.from({ length: 3 }, (_, i) => ({
      pathTemplate: `code${i}/{locale}.ts`,
      locales: new Set(locales),
    }));
    const targets = probeTargets(jsonLike, codeDict);
    expect(targets).toHaveLength(21);
    // 순위 밖 후보의 파일은 하나도 없다 — 내려받지 않은 후보는 5)에서 미검증 탈락이고, 그 사실을 화면이 말한다.
    expect(targets.some((p) => p.startsWith("dir5/") || p.startsWith("dir6/") || p.startsWith("code2/"))).toBe(false);
    // 순위 안 후보는 전부 있다.
    for (let i = 0; i < 5; i += 1) expect(targets).toContain(`dir${i}/en.json`);
    for (let i = 0; i < 2; i += 1) expect(targets).toContain(`code${i}/en.ts`);
  });

  it("같은 경로는 한 번만 낸다", () => {
    const a = json("i18n/{locale}.json", ["en", "ko"]);
    const targets = probeTargets([a, { ...a }], []);
    expect(targets).toEqual(["i18n/en.json", "i18n/ko.json"]);
  });

  it("후보가 없으면 빈 배열이다", () => {
    expect(probeTargets([], [])).toEqual([]);
  });
});

describe("makeProbe — Map을 동기 FileProbe로", () => {
  it("있으면 내용, 없으면 undefined다 (빈 문자열이 아니다 — 어댑터가 undefined를 '미검증'으로 읽는다)", () => {
    const probe = makeProbe(new Map([["a.json", '{"k":"v"}']]));
    expect(probe("a.json")).toBe('{"k":"v"}');
    expect(probe("b.json")).toBeUndefined();
  });
});

describe("formatLabel — 어댑터 이름을 화면에 쓰지 않는다 (design §3.3)", () => {
  const names = ADAPTERS.map((a) => a.name);

  it("다섯 어댑터 전부에 라벨과 경로 예시가 있다", () => {
    for (const name of names) {
      const { label, example } = formatLabel(name);
      expect(label.trim().length).toBeGreaterThan(0);
      expect(example.trim().length).toBeGreaterThan(0);
    }
  });

  it("라벨에 내부 이름이 들어가지 않는다", () => {
    for (const name of names) expect(formatLabel(name).label).not.toContain(name);
  });

  it("경로 예시가 구별자다 — '코드 딕셔너리'가 둘이라 라벨만으로는 못 가른다", () => {
    expect(new Set(names.map((n) => formatLabel(n).example)).size).toBe(names.length);
  });

  it("per-locale 예시에는 `{locale}`이, multi-locale 예시에는 `*`가 있다 — 사용자가 자기 리포에서 확인할 단서다", () => {
    for (const a of ADAPTERS) {
      const { example } = formatLabel(a.name);
      if (a.layout === "per-locale") expect(example).toContain("{locale}");
      else expect(example).toContain("*");
    }
  });
});

describe("summarizeCandidates — 후보 + blob → 사용자 언어 요약", () => {
  const EN = '{"a":"A","b":{"c":"C"}}';
  const c1 = json("src/locales/{locale}.json", ["ko", "en"]);
  const c2 = json("other/{locale}.json", ["ja", "ko"]);

  it("키 수는 기준 로케일 파일을 실제로 read한 결과에서 온다 (design §3.2)", () => {
    const [s] = summarizeCandidates([c1], new Map([["src/locales/en.json", EN]]));
    expect(s?.keys).toEqual({ status: "counted", count: 2 });
  });

  it("기준 로케일 기본값은 `pickBaseLocale`과 같다 — 규칙을 두 벌 만들지 않는다", () => {
    const [a, b] = summarizeCandidates([c1, c2], new Map());
    expect(a?.baseLocale).toBe(pickBaseLocale(c1.locales));
    expect(a?.baseLocale).toBe("en");
    expect(b?.baseLocale).toBe(pickBaseLocale(c2.locales));
    expect(b?.baseLocale).toBe("ja");
  });

  it("blob이 없으면 후보를 떨어뜨리지 않고 `key-count-failed`다 — 남의 리포를 우리 규칙으로 탈락시키지 않는다", () => {
    const out = summarizeCandidates([c1, c2], new Map([["src/locales/en.json", EN]]));
    expect(out).toHaveLength(2);
    expect(out[0]?.keys).toEqual({ status: "counted", count: 2 });
    expect(out[1]?.keys).toEqual({ status: "key-count-failed" });
  });

  it("read가 실패해도(깨진 JSON) `key-count-failed`다", () => {
    const [s] = summarizeCandidates([c1], new Map([["src/locales/en.json", "{ not json"]]));
    expect(s?.keys).toEqual({ status: "key-count-failed" });
  });

  it("순서를 바꾸지 않는다 — 후보 순위는 탐지기 순위다 (spec §6)", () => {
    const out = summarizeCandidates([c2, c1], new Map());
    expect(out.map((s) => s.pathTemplate)).toEqual([c2.pathTemplate, c1.pathTemplate]);
  });

  it("어댑터 이름은 값으로 실리되(확정 시 되돌려 보낸다) 라벨엔 없다", () => {
    const [s] = summarizeCandidates([c1], new Map());
    expect(s?.adapter).toBe("json-catalog");
    expect(s?.label).toBe(formatLabel("json-catalog").label);
    expect(s?.label).not.toContain("json-catalog");
  });

  it("로케일 목록은 정렬돼 있다 — 탐지 결과는 정렬돼 있지 않다", () => {
    const [s] = summarizeCandidates([c1], new Map());
    expect(s?.locales).toEqual(["en", "ko"]);
  });

  it("code-dict 후보도 read해서 센다", () => {
    const c: DetectedFormat = { adapter: "code-dict", pathTemplate: "src/locale/{locale}.ts", locales: ["en", "ko"] };
    const [s] = summarizeCandidates([c], new Map([["src/locale/en.ts", 'export default { a: "A", b: { c: "C" } }']]));
    expect(s?.keys).toEqual({ status: "counted", count: 2 });
  });
});

describe("ingestTargets — 첫 적재가 내려받을 로케일 파일 전부 (design §4)", () => {
  it("per-locale은 `{locale}` 치환 ∩ 트리 경로다 — 트리에 없는 로케일 파일은 뺀다", () => {
    const format = json("src/locales/{locale}.json", ["ko", "en", "fr"]);
    const paths = ["src/locales/en.json", "src/locales/ko.json", "src/locales/index.ts", "README.md"];
    expect(ingestTargets(format, "per-locale", paths)).toEqual(["src/locales/en.json", "src/locales/ko.json"]);
  });

  it("multi-locale은 `matchGlobPaths`로 글롭에 걸리는 파일 **전부**다", () => {
    const format: DetectedFormat = { adapter: "ts-dict", pathTemplate: "src/i18n/namespaces/*.ts", locales: ["ko", "en"] };
    const paths = [
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/editor.ts",
      "src/i18n/namespaces/sub/deep.ts",
      "src/i18n/types.ts",
    ];
    const out = ingestTargets(format, "multi-locale", paths);
    expect(out).toEqual(["src/i18n/namespaces/common.ts", "src/i18n/namespaces/editor.ts"]);
    expect(out).toEqual(matchGlobPaths(format.pathTemplate, paths));
  });

  it("결과는 결정적으로 정렬돼 있다", () => {
    const format = json("i18n/{locale}.json", ["ko", "en", "de"]);
    const paths = ["i18n/ko.json", "i18n/de.json", "i18n/en.json"];
    expect(ingestTargets(format, "per-locale", paths)).toEqual(["i18n/de.json", "i18n/en.json", "i18n/ko.json"]);
  });

  it("적재 상한이 없다 — probeTargets의 21개와 별개 예산이다 (50로케일이면 50개)", () => {
    const locales = Array.from({ length: 50 }, (_, i) => `l${String(i).padStart(2, "0")}`);
    const format = json("i18n/{locale}.json", locales);
    const paths = locales.map((l) => `i18n/${l}.json`);
    expect(ingestTargets(format, "per-locale", paths)).toHaveLength(50);
  });
});
