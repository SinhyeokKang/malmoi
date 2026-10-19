import { describe, expect, it } from "vitest";
import { arbCatalog, detectCandidatesAcross } from "../index";
import { arbProbePaths } from "../arb-catalog";
import type { DetectedFormat, FileProbe, LocaleEntry } from "../types";
import { renderLocaleFiles, type RenderKey } from "@/lib/pull/render";

/**
 * Flutter `gen-l10n`의 ARB (arb design §2). 엔트리는 최상위 `"key": "string"`뿐이고, `@key` 메타데이터와 `@@*` 전역 항목은
 * 번역이 아니라 **코드가 소유하는 소스 키 메타데이터**라 원본 파일의 텍스트 구간을 바이트 그대로 나른다.
 */

const TEMPLATE = "lib/l10n/app_{locale}.arb";
const pathOf = (locale: string) => TEMPLATE.replace("{locale}", locale);

function format(originals: Record<string, string> = {}, extra: Partial<DetectedFormat> = {}): DetectedFormat {
  const currentFiles = Object.entries(originals).map(([locale, content]) => ({ path: pathOf(locale), content }));
  return { adapter: "arb-catalog", pathTemplate: TEMPLATE, locales: ["en", "ko"], ...(currentFiles.length > 0 ? { currentFiles } : {}), ...extra };
}

/** 원본 순서를 흉내 낸 엔트리 — `order`는 파일에서의 위치다. */
const entries = (pairs: readonly [string, string][]): LocaleEntry[] => pairs.map(([key, message], order) => ({ key, message, order }));

function write(locale: string, list: readonly LocaleEntry[], original?: string, extra: Partial<DetectedFormat> = {}): string | null {
  return arbCatalog.write(format(original === undefined ? {} : { [locale]: original }, extra), { locale, entries: list });
}

/** write∘write — 1차 출력을 원본으로 다시 쓰면 같은 바이트여야 한다(고정점). */
function expectFixedPoint(locale: string, list: readonly LocaleEntry[], first: string | null): void {
  expect(first).not.toBeNull();
  expect(write(locale, list, first!)).toBe(first);
}

function read(locale: string, content: string) {
  return arbCatalog.read(format(), [{ path: pathOf(locale), content }]);
}

describe("arb-catalog read", () => {
  it("엔트리는 최상위 문자열뿐이다 — `@key`·`@@*`는 엔트리가 아니고 ICU는 통짜 문자열이다", () => {
    const content = [
      "{",
      '  "@@locale": "en",',
      '  "title": "Hello",',
      '  "@title": { "description": "Greeting" },',
      '  "count": "{n, plural, =1{one} other{many}}",',
      '  "@@x-generated": true',
      "}",
      "",
    ].join("\n");
    const result = read("en", content);
    expect(result.errors).toEqual([]);
    expect(result.nested).toBe(false);
    expect(result.locales).toEqual([
      {
        locale: "en",
        entries: [
          { key: "count", message: "{n, plural, =1{one} other{many}}", order: 1 },
          { key: "title", message: "Hello", order: 0 },
        ],
      },
    ]);
  });

  it("중복 속성은 마지막이 적재되고 `duplicate-property` warning이다", () => {
    const result = read("en", '{"a": "1", "b": "B", "a": "2"}');
    expect(result.locales[0]?.entries.find((e) => e.key === "a")?.message).toBe("2");
    expect(result.errors).toEqual([{ path: pathOf("en"), code: "duplicate-property", key: "a" }]);
  });

  it('`"__proto__"` 키가 own 엔트리로 남는다', () => {
    const result = read("en", '{"__proto__": "P", "a": "A"}');
    expect(result.locales[0]?.entries.map((e) => [e.key, e.message])).toEqual([["__proto__", "P"], ["a", "A"]]);
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("P");
  });

  it("문자열이 아닌 엔트리 값은 `value-not-string`이다 — writer가 원본 구간 그대로 남기므로 unmanaged다", () => {
    const result = read("en", '{"a": "A", "n": 3, "o": {"x": "y"}, "z": null}');
    expect(result.locales[0]?.entries.map((e) => e.key)).toEqual(["a"]);
    expect(result.errors.map((e) => [e.code, e.key])).toEqual([["value-not-string", "n"], ["value-not-string", "o"], ["value-not-string", "z"]]);
  });

  it("깨진 JSON·배열 루트는 파일 층 오류다, BOM은 벗긴다", () => {
    expect(read("en", '{"a": ').errors.map((e) => e.code)).toEqual(["parse-failed"]);
    expect(read("en", "[]").errors.map((e) => e.code)).toEqual(["root-not-object"]);
    expect(read("en", '﻿{"a": "A"}').locales[0]?.entries).toEqual([{ key: "a", message: "A", order: 0 }]);
  });

  it("퇴화 입력(`{}`·`@@locale`만)은 오류 없는 빈 로케일이다", () => {
    expect(read("en", "{}\n")).toEqual({ locales: [{ locale: "en", entries: [] }], errors: [], nested: false });
    expect(read("en", '{\n  "@@locale": "en"\n}\n')).toEqual({ locales: [{ locale: "en", entries: [] }], errors: [], nested: false });
  });
});

describe("arb-catalog write", () => {
  it("`@key`는 원본 구간을 바이트 그대로 그 키 바로 뒤로 나른다 — 다시 직렬화하지 않는다", () => {
    const original = [
      "{",
      '  "@@locale": "en",',
      '  "title": "Hello",',
      '  "@title": {',
      '      "description":"Odd   spacing",  "placeholders": {}',
      "  },",
      '  "bye": "Bye"',
      "}",
      "",
    ].join("\n");
    const list = entries([["title", "Hi"], ["bye", "See you"]]);
    const out = write("en", list, original);
    expect(out).toBe([
      "{",
      '  "@@locale": "en",',
      '  "title": "Hi",',
      '  "@title": {',
      '      "description":"Odd   spacing",  "placeholders": {}',
      "  },",
      '  "bye": "See you"',
      "}",
      "",
    ].join("\n"));
    expectFixedPoint("en", list, out);
  });

  it("원본에서 `@key`가 키보다 앞이어도 출력은 키 바로 뒤다 — 첫 write에서 한 번 옮기고 그 뒤 고정점", () => {
    const original = '{\n  "@title": {\n    "description": "D"\n  },\n  "title": "Hello"\n}\n';
    const list = entries([["title", "Hello"]]);
    const out = write("en", list, original);
    expect(out).toBe('{\n  "title": "Hello",\n  "@title": {\n    "description": "D"\n  }\n}\n');
    expectFixedPoint("en", list, out);
  });

  it("`untranslated`로 받은 키의 `@key`는 값 없이 그 키 자리에, `orphaned`로 받은 키의 `@key`는 버린다", () => {
    const original = '{\n  "@b": {},\n  "a": "A",\n  "@a": {},\n  "@gone": {}\n}\n';
    const list = entries([["a", "A1"]]);
    const input = { locale: "ko", entries: list, untranslated: [{ key: "b", order: 1 }], orphaned: ["gone"] };
    const kept = arbCatalog.write(format({ ko: original }), input);
    expect(kept).toBe('{\n  "a": "A1",\n  "@a": {},\n  "@b": {}\n}\n');
    expect(arbCatalog.write(format({ ko: kept! }), input)).toBe(kept);
  });

  it("orphaned 키의 `@key`만 버린다 — 미번역 키의 `@key`는 그 자리에, 표면에 없는 키의 `@x`(주석)는 원본 위치에 남는다", () => {
    const original = [
      "{",
      '  "title": "Hello",',
      '  "@title": {},',
      '  "gone": "Gone",',
      '  "@gone": { "description": "orphan" },',
      '  "@stray": { "description": "no key" },',
      '  "blank": "Blank",',
      '  "@blank": {}',
      "}",
      "",
    ].join("\n");
    const list: LocaleEntry[] = [
      { key: "title", message: "Hi", order: 0 },
      { key: "gone", message: "Gone", order: 1, orphaned: true },
      { key: "blank", message: "", order: 2 },
    ];
    const out = write("en", list, original);
    expect(out).toBe('{\n  "title": "Hi",\n  "@title": {},\n  "@stray": { "description": "no key" },\n  "@blank": {}\n}\n');
    expectFixedPoint("en", list, out);
  });

  it("`@@*`·`@@x-*`는 원본 위치와 순서를 지킨다 — 앞 키가 빠지면 그 앞의 출력 키(없으면 맨 앞)에 붙는다", () => {
    const original = [
      "{",
      '  "@@locale": "en",',
      '  "@@x-template": "app_en.arb",',
      '  "a": "A",',
      '  "@@last_modified": "2020-01-01T00:00:00Z",',
      '  "b": "B"',
      "}",
      "",
    ].join("\n");
    const both = entries([["a", "A1"], ["b", "B1"]]);
    const out = write("en", both, original);
    expect(out).toBe(original.replace('"A"', '"A1"').replace('"B"', '"B1"'));
    expectFixedPoint("en", both, out);

    const onlyB: LocaleEntry[] = [{ key: "a", message: "", order: 0 }, { key: "b", message: "B1", order: 1 }];
    expect(write("en", onlyB, original)).toBe([
      "{",
      '  "@@locale": "en",',
      '  "@@x-template": "app_en.arb",',
      '  "@@last_modified": "2020-01-01T00:00:00Z",',
      '  "b": "B1"',
      "}",
      "",
    ].join("\n"));
  });

  it("`@@locale`은 원본에 있을 때만, 값은 경로의 코드로 낸다 — 원본 값과 견주지 않는다", () => {
    const list = entries([["a", "가"]]);
    expect(write("ko", list, '{\n  "a": "A"\n}\n')).toBe('{\n  "a": "가"\n}\n');
    const fixed = write("ko", list, '{\n  "@@locale": "ko-KR",\n  "a": "A"\n}\n');
    expect(fixed).toBe('{\n  "@@locale": "ko",\n  "a": "가"\n}\n');
    expectFixedPoint("ko", list, fixed);
  });

  it("새 파일은 `representationSource`의 표현을 입고 `@@locale`을 맨 앞에 둔다 — 출처의 `@key`·`@@*`·값은 싣지 않는다", () => {
    const source = '{\n    "@@locale": "en",\n    "@@x-template": "T",\n    "a": "BASE_A",\n    "@a": {\n        "description": "base meta"\n    }\n}\n';
    const list = entries([["a", "가"]]);
    const created = write("ko", list, undefined, { representationSource: source });
    expect(created).toBe('{\n    "@@locale": "ko",\n    "a": "가"\n}\n');
    expectFixedPoint("ko", list, created);
    // 표현 출처도 없으면 기본 표현(2칸)이고 `@@locale`은 그대로 있다.
    expect(write("fr", list)).toBe('{\n  "@@locale": "fr",\n  "a": "가"\n}\n');
  });

  it("문자열이 아닌 엔트리 값은 원본 구간 그대로 남는다 — 같은 이름의 엔트리를 내면 엔트리가 이긴다", () => {
    const original = '{\n  "a": "A",\n  "n": 3,\n  "z": null\n}\n';
    const out = write("en", entries([["a", "A1"]]), original);
    expect(out).toBe('{\n  "a": "A1",\n  "n": 3,\n  "z": null\n}\n');
    expect(write("en", entries([["a", "A1"], ["z", "Z1"]]), original)).toBe('{\n  "a": "A1",\n  "n": 3,\n  "z": "Z1"\n}\n');
  });

  it("CRLF 원본은 구조와 나른 구간 모두 CRLF로 남고 고정점이다", () => {
    const original = '{\r\n  "@@locale": "en",\r\n  "a": "A",\r\n  "@a": {\r\n    "description": "D"\r\n  }\r\n}\r\n';
    const list = entries([["a", "A1"], ["b", "B1"]]);
    const out = write("en", list, original);
    expect(out).toBe('{\r\n  "@@locale": "en",\r\n  "a": "A1",\r\n  "@a": {\r\n    "description": "D"\r\n  },\r\n  "b": "B1"\r\n}\r\n');
    expect(out!.replaceAll("\r\n", "")).not.toContain("\n");
    expectFixedPoint("en", list, out);
  });

  it("낼 값이 0개면 원본의 `@@*`만 남은 객체다 — `{}`·`@@locale`만 남은 파일도 다음 read·write로 왕복한다", () => {
    // 남은 키가 orphaned뿐이다 — 미번역(빈 값)이면 살아 있는 키라 `@a`가 남는다(위 fix1 테스트).
    const none: LocaleEntry[] = [{ key: "a", message: "A", orphaned: true }];
    const bare = write("en", none, '{\n  "a": "A",\n  "@a": {}\n}\n');
    expect(bare).toBe("{}\n");
    expect(read("en", bare!).errors).toEqual([]);
    expectFixedPoint("en", none, bare);

    const localeOnly = write("en", none, '{\n  "@@locale": "en",\n  "a": "A",\n  "@a": {}\n}\n');
    expect(localeOnly).toBe('{\n  "@@locale": "en"\n}\n');
    expect(read("en", localeOnly!).errors).toEqual([]);
    expectFixedPoint("en", none, localeOnly);
    // 퇴화 원본에 값이 다시 생겨도 정상 파일로 돌아온다.
    expect(write("en", entries([["a", "A"]]), localeOnly!)).toBe('{\n  "@@locale": "en",\n  "a": "A"\n}\n');
    // 원본이 없으면 null — 빈 새 파일은 없던 언어를 지원한다고 말한다.
    expect(write("en", none)).toBeNull();
  });
});

describe("arb-catalog — base 파일의 원본에만 있는 키 (B3.4)", () => {
  it("원본에만 있는 키는 `@key`와 함께 남고, DB에만 있는 키는 base에 쓰지 않는다", () => {
    const base = [
      "{",
      '  "@@locale": "en",',
      '  "keep": "S_keep",',
      '  "@keep": { "description": "keep" },',
      '  "added": "ADDED",',
      '  "@added": {',
      '    "placeholders": { "n": {} }',
      "  }",
      "}",
      "",
    ].join("\n");
    const keys: RenderKey[] = [
      { id: "k1", key: "keep", sourceText: "S_keep", orphaned: false, cells: { en: { value: "DB_keep" } } },
      { id: "k2", key: "deleted", sourceText: "S_deleted", orphaned: false, cells: { en: { value: "DB_deleted" } } },
    ];
    const fmt: DetectedFormat = { adapter: "arb-catalog", pathTemplate: TEMPLATE, locales: ["en"] };
    const [out] = renderLocaleFiles(fmt, "per-locale", [{ path: pathOf("en"), locale: "en" }], keys, "en", new Map([[pathOf("en"), base]]));
    expect(out?.content).toBe(base.replace('"S_keep"', '"DB_keep"'));
  });
});

/**
 * **살아 있는 키의 `@key`는 그 로케일만 값이 없어도 남는다** (2026-10-19 사용자 결정 — fix1). Weblate류가 비-base 파일마다 `@key`를 복제해
 * 두는 리포(fluffychat 5,251개)에서 첫 Publish가 수천 줄을 지웠다. 버리는 것은 orphaned 키와 표면에 없는 키의 `@key`뿐이다.
 * 진입점은 pull 렌더(`renderLocaleFiles`)다 — writer 단위만 보면 렌더가 그 키 집합을 넘기는지 모른다.
 */
describe("arb-catalog — 미번역 살아 있는 키의 `@key` (렌더 경로)", () => {
  const keys: RenderKey[] = [
    { id: "k1", key: "a", sourceText: "A", sortIndex: 0, orphaned: false, cells: { en: { value: "A" }, fr: { value: "A_fr" } } },
    { id: "k2", key: "b", sourceText: "B", sortIndex: 1, orphaned: false, cells: { en: { value: "B" } } },
    { id: "k3", key: "c", sourceText: "C", sortIndex: 2, orphaned: false, cells: { en: { value: "C" }, fr: { value: "C_fr" } } },
    { id: "k4", key: "gone", sourceText: "G", sortIndex: 3, orphaned: true, cells: { en: { value: "G" }, fr: { value: "G_fr" } } },
  ];
  const fmt: DetectedFormat = { adapter: "arb-catalog", pathTemplate: TEMPLATE, locales: ["en", "fr"] };
  const base = '{\n  "a": "A",\n  "@a": {},\n  "b": "B",\n  "@b": {\n    "description": "bee"\n  },\n  "c": "C"\n}\n';
  // fr 원본: 미번역 `b`의 `@b`가 맨 앞에 있고, orphaned `gone`과 표면에 없는 `stray`의 `@key`가 섞여 있다.
  const fr = [
    "{",
    '  "@b": {',
    '    "description": "bee"',
    "  },",
    '  "a": "A_old",',
    '  "@a": {},',
    '  "@gone": { "description": "orphan" },',
    '  "@stray": { "description": "not a key" },',
    '  "c": "C_old"',
    "}",
    "",
  ].join("\n");
  const render = (current: ReadonlyMap<string, string>) =>
    renderLocaleFiles(fmt, "per-locale", [{ path: pathOf("en"), locale: "en" }, { path: pathOf("fr"), locale: "fr" }], keys, "en", current);

  it("미번역 키의 `@key`는 그 키가 설 자리(base 순서)에 바이트 그대로 남고, orphaned 키의 `@key`만 버린다", () => {
    const out = render(new Map([[pathOf("en"), base], [pathOf("fr"), fr]])).find((f) => f.locale === "fr")?.content;
    expect(out).toBe([
      "{",
      '  "a": "A_fr",',
      '  "@a": {},',
      // 표면에 없는 키의 `@stray`는 주석이다 — 원본에서 바로 앞이던 출력 키(`a`) 뒤에 남는다. orphaned `gone`의 `@gone`만 빠진다.
      '  "@stray": { "description": "not a key" },',
      '  "@b": {',
      '    "description": "bee"',
      "  },",
      '  "c": "C_fr"',
      "}",
      "",
    ].join("\n"));
  });

  it("2차 Publish는 고정점이다", () => {
    const first = render(new Map([[pathOf("en"), base], [pathOf("fr"), fr]]));
    const again = render(new Map(first.map((f) => [f.path, f.content!])));
    expect(again.map((f) => f.content)).toEqual(first.map((f) => f.content));
  });
});

/** 짝 키 없는 `@x`를 구획 주석으로 쓰는 리포(openfoodfacts/smooth-app — base·번역 127파일 모두). 첫 Publish가 지우면 안 된다(fix1 지휘자 결정 A). */
describe("arb-catalog — 구획 주석 `@x` (렌더 경로)", () => {
  const keys: RenderKey[] = [
    { id: "k1", key: "a", sourceText: "A", sortIndex: 0, orphaned: false, cells: { en: { value: "A" }, fr: { value: "A_fr" } } },
    { id: "k2", key: "b", sourceText: "B", sortIndex: 1, orphaned: false, cells: { en: { value: "B" } } },
  ];
  const fmt: DetectedFormat = { adapter: "arb-catalog", pathTemplate: TEMPLATE, locales: ["en", "fr"] };
  const body = (a: string, b?: string) => [
    "{",
    '  "@@locale": "LOCALE",',
    '  "@Introduction screen": {},',
    `  "a": "${a}",`,
    '  "@user_management": {},',
    ...(b === undefined ? [] : [`  "b": "${b}",`]),
    '  "@b": {}',
    "}",
    "",
  ].join("\n");
  const base = body("A", "B").replace("LOCALE", "en");
  const fr = body("A_old").replace("LOCALE", "fr");
  const render = (current: ReadonlyMap<string, string>) =>
    renderLocaleFiles(fmt, "per-locale", [{ path: pathOf("en"), locale: "en" }, { path: pathOf("fr"), locale: "fr" }], keys, "en", current);

  it("base와 번역 파일 모두 주석이 원본 위치에 남고 2차 Publish는 고정점이다", () => {
    const first = render(new Map([[pathOf("en"), base], [pathOf("fr"), fr]]));
    expect(first.find((f) => f.locale === "en")?.content).toBe(base);
    expect(first.find((f) => f.locale === "fr")?.content).toBe(body("A_fr").replace("LOCALE", "fr"));
    const again = render(new Map(first.map((f) => [f.path, f.content!])));
    expect(again.map((f) => f.content)).toEqual(first.map((f) => f.content));
  });
});

describe("arb-catalog — 언어 추가 렌더 (locale-add)", () => {
  it("새 언어 파일은 기준 언어 파일의 표현만 빌리고 `@@locale`을 그 언어 코드로 낸다", () => {
    const base = '{\n    "@@locale": "en",\n    "keep": "S_keep",\n    "@keep": {\n        "description": "base meta"\n    }\n}\n';
    const keys: RenderKey[] = [{ id: "k1", key: "keep", sourceText: "S_keep", orphaned: false, cells: { en: { value: "DB_keep" }, fr: { value: "Garder" } } }];
    const fmt: DetectedFormat = { adapter: "arb-catalog", pathTemplate: TEMPLATE, locales: ["en", "fr"] };
    const files = renderLocaleFiles(fmt, "per-locale", [{ path: pathOf("en"), locale: "en" }, { path: pathOf("fr"), locale: "fr" }], keys, "en",
      new Map([[pathOf("en"), base]]), { locales: new Set(["fr"]), source: base });
    expect(files.find((f) => f.locale === "fr")?.content).toBe('{\n    "@@locale": "fr",\n    "keep": "Garder"\n}\n');
  });
});

describe("arb-catalog detect", () => {
  const arb = '{"@@locale":"en","ok":"OK"}';

  it("`app_{locale}.arb`·`{locale}.arb`를 낸다", () => {
    expect(arbCatalog.detectCandidates(["lib/l10n/app_en.arb", "lib/l10n/app_ko.arb", "lib/l10n/app_zh_CN.arb"]))
      .toEqual([{ adapter: "arb-catalog", pathTemplate: "lib/l10n/app_{locale}.arb", locales: ["en", "ko", "zh_CN"] }]);
    expect(arbCatalog.detectCandidates(["assets/l10n/en.arb", "assets/l10n/ko.arb"]).map((c) => c.pathTemplate))
      .toEqual(["assets/l10n/{locale}.arb"]);
    expect(arbCatalog.detectCandidates(["lib/l10n/intl_messages.arb", "pubspec.yaml"])).toEqual([]);
  });

  it("probe가 카탈로그가 아니라고 하면 후보에서 뺀다", () => {
    const paths = ["lib/l10n/app_en.arb", "lib/l10n/app_ko.arb"];
    expect(arbCatalog.detectCandidates(paths, () => "[1]")).toEqual([]);
    expect(arbCatalog.detectCandidates(paths, () => arb)).toHaveLength(1);
  });

  const many = ["packages/kit/lib/l10n/app_en.arb", "packages/kit/lib/l10n/app_ko.arb", "packages/kit/lib/l10n/app_ja.arb"];
  const app = ["lib/l10n/app_en.arb", "lib/l10n/app_ko.arb"];

  it("`l10n.yaml`의 `arb-dir`·`template-arb-file`이 후보를 좁힌다 — 진입점(`detectCandidatesAcross`)의 1순위로 확인한다", () => {
    const paths = [...many, ...app, "l10n.yaml"];
    const files: Record<string, string> = { "l10n.yaml": "arb-dir: lib/l10n\ntemplate-arb-file: app_en.arb\noutput-localization-file: app_localizations.dart\n" };
    const probe: FileProbe = (p) => files[p] ?? (p.endsWith(".arb") ? arb : undefined);
    // 설정이 없으면 로케일이 많은 쪽이 이긴다 — 설정이 그것을 뒤집는다.
    expect(detectCandidatesAcross([...many, ...app], probe)[0]?.pathTemplate).toBe("packages/kit/lib/l10n/app_{locale}.arb");
    expect(detectCandidatesAcross(paths, probe).map((c) => c.pathTemplate)).toEqual(["lib/l10n/app_{locale}.arb", "packages/kit/lib/l10n/app_{locale}.arb"]);
  });

  /**
   * ⚠️ **좁히기는 순서이지 거르기가 아니다** (code-review 🔴1). 걸러 내면 설정이 가리키지 않는 ARB를 둘째 소스로 연결한 표면의 CI
   * (`--path-template` 고정)가 탐지 목록에서 자기 템플릿을 못 찾아 exit 1로 영구 red가 된다(`scripts/format.ts` `requestedFormat`).
   */
  it("`l10n.yaml`이 가리키지 않는 ARB 후보도 목록에 남는다 — 다른 어댑터와의 순위는 그대로다", () => {
    const json = ["web/i18n/en.json", "web/i18n/ko.json", "web/i18n/ja.json", "web/i18n/fr.json"];
    const paths = [...many, ...app, ...json, "l10n.yaml"];
    const probe: FileProbe = (p) => (p === "l10n.yaml" ? "arb-dir: lib/l10n\n" : p.endsWith(".json") ? '{"a":"A"}' : arb);
    expect(detectCandidatesAcross(paths, probe).map((c) => `${c.adapter} ${c.pathTemplate}`)).toEqual([
      "json-catalog web/i18n/{locale}.json",
      "arb-catalog lib/l10n/app_{locale}.arb",
      "arb-catalog packages/kit/lib/l10n/app_{locale}.arb",
    ]);
  });

  it("`l10n.yaml`이 가리키는 후보가 없으면 좁히지 않는다 — 설정 하나로 탐지가 0이 되지 않는다", () => {
    const probe: FileProbe = (p) => (p === "l10n.yaml" ? "arb-dir: res/arb\n" : arb);
    expect(detectCandidatesAcross([...app, "l10n.yaml"], probe).map((c) => c.pathTemplate)).toEqual(["lib/l10n/app_{locale}.arb"]);
  });

  it("예제 디렉터리(`aside`)는 로케일이 더 많아도 뒤다", () => {
    const paths = ["example/lib/l10n/app_en.arb", "example/lib/l10n/app_ko.arb", "example/lib/l10n/app_ja.arb", ...app];
    expect(detectCandidatesAcross(paths, () => arb).map((c) => c.pathTemplate))
      .toEqual(["lib/l10n/app_{locale}.arb", "example/lib/l10n/app_{locale}.arb"]);
  });

  it("`arbProbePaths`가 루트 `l10n.yaml`을 내려받을 파일로 고른다", () => {
    expect(arbProbePaths(["l10n.yaml", "lib/l10n/app_en.arb"])).toEqual(["l10n.yaml"]);
    expect(arbProbePaths(["packages/x/l10n.yaml", "lib/l10n/app_en.arb"])).toEqual([]);
  });
});
