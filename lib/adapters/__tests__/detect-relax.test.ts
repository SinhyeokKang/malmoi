import { describe, expect, it } from "vitest";
import { ADAPTERS, detectFormat, detectFormatWith, jsonCatalog, tsDict } from "../index";
import { catalogVerdict } from "../shared";
import type { FileProbe } from "../types";

/**
 * 탐지 관문의 완화·감점·제외 — 전부 **오픈소스 109개 실측에서 나온 실패**에 대응한다
 * (`docs/ADAPTER-COVERAGE.md` §3·§1②, ARCHITECTURE §1.3).
 *
 * ⚠️ **완화한 것은 탐지 관문뿐이다.** `read`는 그대로 엄격하고, 여기서 통과시킨 값들은 여전히
 * `errors`로 보고된다 — 탐지가 리포 전체를 버리는 것과 read가 항목을 거르는 것은 다른 층이다.
 */

describe("catalogVerdict — 빈 객체는 '아님'이 아니라 '정보 없음'이다", () => {
  it("문자열 리프가 있으면 yes", () => {
    expect(catalogVerdict('{"a":"A","b":"B"}')).toBe("yes");
  });

  it("객체 리프만 있어도 yes (중첩 카탈로그)", () => {
    expect(catalogVerdict('{"grp":{"a":"A"}}')).toBe("yes");
  });

  it("빈 객체는 unknown — esmBot의 locales/bg.json이 `{}`였다", () => {
    expect(catalogVerdict("{}")).toBe("unknown");
  });

  it("최상위 배열·비객체는 no (검색 인덱스 오탐 방지가 이 규칙이다)", () => {
    expect(catalogVerdict("[1,2,3]")).toBe("no");
    expect(catalogVerdict('"just a string"')).toBe("no");
    expect(catalogVerdict("{ not json")).toBe("no");
  });

  it("메타데이터가 섞여도 문자열·객체가 과반이면 yes — scratchblocks의 percentTranslated", () => {
    expect(catalogVerdict('{"commands":{"a":"A"},"name":"Abkhazian","percentTranslated":42}')).toBe("yes");
  });

  it("최상위 null이 섞여도 yes — jsxc의 \"Notifications\": null", () => {
    expect(catalogVerdict('{"translation":{"a":"A"},"Notifications":null}')).toBe("yes");
  });

  it("숫자·불린만이면 no (설정 파일이다)", () => {
    expect(catalogVerdict('{"timeout":30,"retries":3}')).toBe("no");
    expect(catalogVerdict('{"debug":true}')).toBe("no");
  });
});

describe("verify — 샘플 하나로 리포 전체를 버리지 않는다", () => {
  const paths = ["locales/ab.json", "locales/bg.json", "locales/en.json", "locales/ko.json"];

  it("정렬상 첫 로케일이 빈 스텁이어도 탐지된다 (esmBot 실패 재현)", () => {
    const probe: FileProbe = (p) => (p.endsWith("/ab.json") || p.endsWith("/bg.json") ? "{}" : '{"a":"A"}');
    expect(jsonCatalog.detectCandidates(paths, probe)).toHaveLength(1);
  });

  it("첫 로케일에 최상위 null이 있어도 탐지된다 (jsxc 실패 재현)", () => {
    const probe: FileProbe = () => '{"translation":{"a":"A"},"Notifications":null}';
    expect(jsonCatalog.detectCandidates(paths, probe)).toHaveLength(1);
  });

  it("첫 로케일에 메타데이터 숫자가 있어도 탐지된다 (scratchblocks 실패 재현)", () => {
    const probe: FileProbe = () => '{"commands":{"a":"A"},"percentTranslated":42}';
    expect(jsonCatalog.detectCandidates(paths, probe)).toHaveLength(1);
  });

  it("`en`을 먼저 본다 — base 후보가 가장 잘 관리된 파일이다", () => {
    const read: string[] = [];
    const probe: FileProbe = (p) => {
      read.push(p);
      return '{"a":"A"}';
    };
    jsonCatalog.detectCandidates(paths, probe);
    expect(read[0]).toBe("locales/en.json");
  });

  it("전부 카탈로그가 아니면 여전히 버린다 (완화가 관문을 없앤 건 아니다)", () => {
    const probe: FileProbe = () => "[1,2,3]";
    expect(jsonCatalog.detectCandidates(paths, probe)).toEqual([]);
  });

  it("전부 빈 스텁이면 버린다 — unknown만으로는 인정하지 않는다", () => {
    const probe: FileProbe = () => "{}";
    expect(jsonCatalog.detectCandidates(paths, probe)).toEqual([]);
  });

  it("샘플을 4개 이상 읽지 않는다 (GitHub에서는 블롭 읽기가 요청 비용이다)", () => {
    const many = Array.from({ length: 40 }, (_, i) => `locales/l${String(i).padStart(2, "0")}.json`);
    // 로케일처럼 보이는 이름만 남긴다
    const real = ["locales/aa.json", "locales/ab.json", "locales/ac.json", "locales/ad.json", "locales/ae.json"];
    let reads = 0;
    const probe: FileProbe = () => {
      reads += 1;
      return "[1,2,3]";
    };
    jsonCatalog.detectCandidates([...many, ...real], probe);
    expect(reads).toBeLessThanOrEqual(3);
  });
});

describe("예제·픽스처 디렉터리는 순위에서 밀린다", () => {
  it("examples/ 아래 후보가 진짜 카탈로그에 진다 (lokalise/i18n-ally 실측)", () => {
    const found = jsonCatalog.detectCandidates([
      "examples/by-frameworks/next-intl/messages/en.json",
      "examples/by-frameworks/next-intl/messages/ko.json",
      "examples/by-frameworks/next-intl/messages/ja.json",
      "examples/by-frameworks/next-intl/messages/de.json",
      "locales/en.json",
      "locales/ko.json",
    ]);
    // 예제 쪽이 로케일 수가 더 많은데도 진짜가 1순위여야 한다
    expect(found[0]?.pathTemplate).toBe("locales/{locale}.json");
    // 배제가 아니라 감점 — 목록에는 남는다
    expect(found.map((c) => c.pathTemplate)).toContain("examples/by-frameworks/next-intl/messages/{locale}.json");
  });

  it("chrome-locales에서도 예제가 밀린다 (lokalise의 1순위가 그 형태였다)", () => {
    const d = detectFormat([
      "examples/by-frameworks/chrome-extension/_locales/en/messages.json",
      "examples/by-frameworks/chrome-extension/_locales/ko/messages.json",
      "_locales/en/messages.json",
      "_locales/ko/messages.json",
    ]);
    expect(d?.pathTemplate).toBe("_locales/{locale}/messages.json");
  });

  it("문서 사이트 부속물도 밀린다 (ant-design의 .dumi/theme/locales)", () => {
    const found = jsonCatalog.detectCandidates([
      ".dumi/theme/locales/en-US.json",
      ".dumi/theme/locales/zh-CN.json",
      "src/i18n/en.json",
      "src/i18n/ko.json",
    ]);
    expect(found[0]?.pathTemplate).toBe("src/i18n/{locale}.json");
  });

  it("예제 디렉터리에만 카탈로그가 있으면 그걸 잡는다 (감점은 배제가 아니다)", () => {
    const found = jsonCatalog.detectCandidates([
      "examples/demo/locales/en.json",
      "examples/demo/locales/ko.json",
    ]);
    expect(found).toHaveLength(1);
  });
});

describe("ts-dict는 자동 탐지에서 빠진다 (ADAPTER-COVERAGE 판정 ③)", () => {
  const TS = `
const ko = { "a.b": "확인" } as const;
const en = { "a.b": "OK" } satisfies Bundle;
export const ns = { ko, en };
`;
  const paths = ["src/i18n/namespaces/a.ts", "src/i18n/namespaces/b.ts"];

  it("detectCandidates가 항상 빈 배열이다 — 자동 탐지의 진입점은 이쪽이다", () => {
    expect(tsDict.detectCandidates(paths, () => TS)).toEqual([]);
  });

  it("detectFormat도 ts-dict를 고르지 않는다", () => {
    expect(detectFormat(paths, () => TS)).toBeUndefined();
  });

  it("ADAPTERS에는 남아 있다", () => {
    expect(ADAPTERS.map((a) => a.name)).toContain("ts-dict");
  });

  it("**명시 지정은 실제로 동작한다** — `detectFormatWith`가 포맷을 낸다", () => {
    // ⚠️ 전에는 이 자리에 "ADAPTERS에 남아 있다"만 있었고 이름만 "명시 지정이 계속 동작해야
    // 한다"였다. 실제로는 `detect`가 `detectCandidates()[0]`이라 **항상 undefined**였고,
    // `--adapter ts-dict`가 "이 리포에서 해당 포맷을 찾지 못했다"로 죽었다. 목록에 있는 것과
    // 불릴 수 있는 것은 다른 일이다 (POSTMORTEM 2026-09-02와 같은 축).
    const found = detectFormatWith("ts-dict", paths, () => TS);
    expect(found?.adapter).toBe("ts-dict");
    expect(found?.pathTemplate).toBe("src/i18n/namespaces/*.ts");
    expect(found?.locales.slice().sort()).toEqual(["en", "ko"]);
  });

  it("명시 지정도 내용을 봐야 한다 — probe가 없으면 못 찾는다", () => {
    // `.ts` 디렉터리는 어디에나 있다. 경로만으로 인정하면 아무 소스 디렉터리나 잡힌다.
    expect(detectFormatWith("ts-dict", paths)).toBeUndefined();
  });

  it("명시 지정이라도 로케일 객체가 2개 미만이면 안 잡는다", () => {
    const one = `const ko = { "a.b": "확인" } as const;\nexport const ns = { ko };\n`;
    expect(detectFormatWith("ts-dict", paths, () => one)).toBeUndefined();
  });

  it("read·write는 아무것도 바뀌지 않았다", () => {
    const fmt = {
      adapter: "ts-dict" as const,
      pathTemplate: "src/i18n/namespaces/*.ts",
      locales: ["ko", "en"],
      currentFiles: [{ path: "src/i18n/namespaces/a.ts", content: TS }],
    };
    const r = tsDict.read(fmt, [{ path: "src/i18n/namespaces/a.ts", content: TS }]);
    expect(r.locales.map((l) => l.locale).sort()).toEqual(["en", "ko"]);
    const out = tsDict.write(fmt, { locale: "ko", entries: [{ key: "a.b", message: "바뀜" }] });
    expect(out).toContain('"바뀜"');
  });
});

/**
 * ⚠️ **어댑터 간 순위도 신호로 정한다** (2026-09-02 실측 발견).
 *
 * `detectFormat`이 `ADAPTERS` 고정 순서의 첫 매치였다. 그래서 어댑터 **내** 순위 규칙(i18n 신호·
 * 예제 감점·로케일 수)이 어댑터 **간**에는 하나도 작동하지 않았다:
 *
 * | 리포 | 이긴 것 | 져야 했던 이유 |
 * |---|---|---|
 * | GSA/search-gov | `spec/fixtures/json/rtu_dashboard/{locale}.json` (2로케일) | `config/locales/{locale}.yml`이 65로케일이다 |
 * | ant-design | `.dumi/theme/locales/{locale}.json` (2) | `components/locale/{locale}.ts`가 73이다 |
 * | vuetify | `packages/docs/src/data/{locale}.json` (2) | `packages/vuetify/src/locale/{locale}.ts`가 43이다 |
 *
 * **chrome은 예외로 남는다** — 크롬 확장은 `_locales`가 실제 배포 산출물이고 옆에 뭐가 있어도
 * 브라우저가 읽는 건 그것뿐이다 (ARCHITECTURE §1).
 */
describe("어댑터 간 순위 — 고정 순서가 아니라 신호로 정한다", () => {
  it("픽스처 JSON이 로케일 많은 YAML을 이기지 않는다 (GSA/search-gov)", () => {
    const paths = [
      "spec/fixtures/json/rtu_dashboard/en.json",
      "spec/fixtures/json/rtu_dashboard/es.json",
      "config/locales/en.yml",
      "config/locales/es.yml",
      "config/locales/ko.yml",
    ];
    const d = detectFormat(paths, () => '{"a":"A"}');
    expect(d?.adapter).toBe("yaml-catalog");
  });

  it("문서 사이트 JSON이 진짜 코드 딕셔너리를 이기지 않는다 (ant-design·vuetify)", () => {
    const code = "export default { a: 'A', b: 'B' }\n";
    const paths = [
      ".dumi/theme/locales/en-US.json",
      ".dumi/theme/locales/zh-CN.json",
      "components/locale/en_US.ts",
      "components/locale/ko_KR.ts",
      "components/locale/ja_JP.ts",
    ];
    const d = detectFormat(paths, (p) => (p.endsWith(".json") ? '{"a":"A"}' : code));
    expect(d?.adapter).toBe("code-dict");
  });

  it("예제 JSON이 진짜 코드 딕셔너리를 이기지 않는다 (payloadcms/payload)", () => {
    const code = "export default { a: 'A' }\n";
    const paths = [
      "examples/localization/src/i18n/messages/en.json",
      "examples/localization/src/i18n/messages/ko.json",
      "packages/translations/src/languages/en.ts",
      "packages/translations/src/languages/ko.ts",
    ];
    const d = detectFormat(paths, (p) => (p.endsWith(".json") ? '{"a":"A"}' : code));
    expect(d?.adapter).toBe("code-dict");
  });

  it("chrome `_locales`는 여전히 최우선이다 — 브라우저가 읽는 건 그것뿐이다", () => {
    const d = detectFormat([
      "public/_locales/en/messages.json",
      "public/_locales/ko/messages.json",
      "src/lib/i18n/en.json",
      "src/lib/i18n/ko.json",
      "src/lib/i18n/ja.json",
    ]);
    expect(d?.adapter).toBe("chrome-locales");
  });

  it("예제 안의 chrome은 최우선이 아니다 (lokalise/i18n-ally)", () => {
    const d = detectFormat([
      "examples/by-frameworks/chrome-extension/_locales/en/messages.json",
      "examples/by-frameworks/chrome-extension/_locales/ko/messages.json",
      "locales/en.json",
      "locales/ko.json",
    ]);
    expect(d?.pathTemplate).toBe("locales/{locale}.json");
  });

  it("동률이면 경로순 — 얕은 쪽이 이긴다 (happy-func/next-official)", () => {
    const code = "export default { a: 'A' }\n";
    const paths = ["locale/article/en-US.json", "locale/article/zh-CN.json", "locale/en-US.ts", "locale/zh-CN.ts"];
    const d = detectFormat(paths, (p) => (p.endsWith(".json") ? '{"a":"A"}' : code));
    expect(d?.pathTemplate).toBe("locale/{locale}.ts");
  });
});

describe("null 리프는 에러가 아니라 미번역이다 (jsxc 5,099건)", () => {
  it("json-catalog: null 값을 조용히 건너뛴다", () => {
    const src = JSON.stringify({ translation: { a: "A", b: null, c: null } }, null, 2) + "\n";
    const r = jsonCatalog.read(
      { adapter: "json-catalog", pathTemplate: "locales/{locale}.json", locales: ["en"] },
      [{ path: "locales/en.json", content: src }],
    );
    expect(r.errors).toEqual([]);
    expect(r.locales[0]?.entries.map((e) => e.key)).toEqual(["translation.a"]);
  });

  it("숫자·불린은 여전히 에러다 — 그건 카탈로그에 있을 값이 아니다", () => {
    const src = JSON.stringify({ n: 3, flag: true, ok: "OK" }, null, 2) + "\n";
    const r = jsonCatalog.read(
      { adapter: "json-catalog", pathTemplate: "locales/{locale}.json", locales: ["en"] },
      [{ path: "locales/en.json", content: src }],
    );
    expect(r.errors).toHaveLength(2);
  });
});
