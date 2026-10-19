import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appleXcstrings, xcstringsProbePaths } from "../apple-xcstrings";
import { detectCandidatesAcross } from "../index";
import { adapterErrorKind, type AdapterError, type DetectedFormat, type LocaleEntry } from "../types";
import { planClearability } from "@/lib/keys/save";
import { buildPushPayload } from "@/lib/push/payload";
import { PushPayload } from "@/lib/push/plan";
import { supportsLocaleChanges } from "@/lib/locales/add-plan";

/**
 * Apple String Catalog `.xcstrings` (apple-strings design §2.3·§3·§4·§5).
 *
 * 모든 언어가 든 JSON 하나다 — multi-locale + 수술적 치환. 값 문자열의 범위만 바꾸고, 파일에 있는 키의 **없는 언어 셀만** Xcode 서식으로 삽입한다.
 * 키는 삽입하지 않는다(키 존재는 코드가 정한다). 원문 셀이 없는 키는 키 문자열이 원문이다.
 *
 * ⚠️ 이 파일은 역슬래시를 `B`로 조립한다 — 편집 도구가 역슬래시-u 열을 글자로 풀어 버린다(apple-strings fix1 함정).
 */

const B = "\\";
const PATH = "App/Localizable.xcstrings";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/apple-xcstrings/${name}`, import.meta.url), "utf8");

const formatOf = (content: string, locales: string[] = ["en"]): DetectedFormat => ({
  adapter: "apple-xcstrings", pathTemplate: PATH, locales, currentFiles: [{ path: PATH, content }],
});
const readOf = (content: string) => appleXcstrings.read(formatOf(content), [{ path: PATH, content }]);
/** 로케일 → 키 → 값. */
const valuesOf = (content: string): Record<string, Record<string, string>> =>
  Object.fromEntries(readOf(content).locales.map((l) => [l.locale, Object.fromEntries(l.entries.map((e) => [e.key, e.message]))]));
const writeOne = (content: string, locale: string, entries: LocaleEntry[]) =>
  appleXcstrings.writeWithErrors!(formatOf(content), { locale, entries });
/**
 * 렌더(`renderLocaleFiles`의 multi-locale 갈래)와 같이 로케일마다 부르고 **직전 결과를 다음 원본으로** 넘긴다. 값은 읽은 것 위에 덮는다 —
 * 바꾸지 않은 셀도 DB에 있는 그대로 다시 넘긴다(실제 Publish가 그렇다).
 */
function writeAll(content: string, edits: Record<string, Record<string, string>>): { content: string; errors: AdapterError[] } {
  const current = valuesOf(content);
  const locales = [...new Set([...Object.keys(current), ...Object.keys(edits)])].sort();
  let out = content;
  const errors: AdapterError[] = [];
  for (const locale of locales) {
    const merged = { ...current[locale], ...edits[locale] };
    const res = writeOne(out, locale, Object.entries(merged).map(([key, message]) => ({ key, message })));
    errors.push(...res.errors);
    if (res.content !== null) out = res.content;
  }
  return { content: out, errors };
}
/** 공백 없는 JSON 하나 — `JSON.stringify`라 `__proto__` 같은 키도 own 키로 나간다(`Object.fromEntries`). */
const unit = (value: string, state = "translated") => ({ stringUnit: { state, value } });
const catalog = (strings: Record<string, unknown>, sourceLanguage = "en") => JSON.stringify({ sourceLanguage, strings, version: "1.0" });
const parseFailed = (content: string) => readOf(content).errors.map((e) => e.code);

describe("JSON 의미 — RFC 8259를 그대로 따른다", () => {
  it("문자열 이스케이프를 푼다 — 따옴표·역슬래시·슬래시·제어·유니코드·서로게이트 쌍", () => {
    const raw = `{"sourceLanguage":"en","strings":{"k":{"localizations":{"de":{"stringUnit":{"state":"translated","value":"${B}"${B}${B}${B}/${B}b${B}f${B}n${B}r${B}t${B}u00e9${B}ud83d${B}ude00${B}uD83D${B}uDE00"}}}}},"version":"1.0"}`;
    expect(readOf(raw).errors).toEqual([]);
    expect(valuesOf(raw).de?.k).toBe('"\\/\b\f\n\r\té😀😀');
  });

  it("키 이스케이프도 같은 디코더를 지난다", () => {
    const raw = `{"sourceLanguage":"en","strings":{"a${B}u0042":{}},"version":"1.0"}`;
    expect(valuesOf(raw).en).toEqual({ aB: "aB" });
  });

  /** Xcode 26.6 `xcstringstool`도 이 파일을 읽지 못한다(README) — 대체 문자로 바꿔 적재하지 않는다. */
  it.each([
    ["값의 짝 없는 high", `${B}ud800`],
    ["값의 짝 없는 low", `${B}udfff`],
    ["뒤집힌 쌍", `${B}ude00${B}ud83d`],
  ])("짝 없는 서로게이트는 파일 실패다 — %s", (_label, escape) => {
    const raw = `{"sourceLanguage":"en","strings":{"k":{"localizations":{"de":{"stringUnit":{"state":"translated","value":"a${escape}b"}}}}},"version":"1.0"}`;
    expect(parseFailed(raw)).toEqual(["parse-failed"]);
    expect(readOf(raw).locales).toEqual([]);
  });

  it("키의 짝 없는 서로게이트도 파일 실패다", () => {
    expect(parseFailed(`{"sourceLanguage":"en","strings":{"${B}ud800":{}},"version":"1.0"}`)).toEqual(["parse-failed"]);
  });

  /**
   * **같은 이름이 둘이면 Xcode처럼 앞의 것이다**(지휘자 결정 14). `JSON.parse`는 뒤의 것을 읽는다 — Xcode 26.6 `xcstringstool`은 앞의 것을 읽고 다시 저장할 때
   * 뒤의 사본을 지운다(`xcode-duplicate-*` 채록). 실제 정답 리포 HealthGPT의 카탈로그에 옛 Xcode가 쓴 중복 키가 있어 막지 않는다 — 잃는 값이 없으므로
   * code-dict·ts-dict·apple-strings와 같은 경고(`duplicate-property`)다.
   */
  it("같은 이름은 앞의 것을 읽는다 — Xcode가 다시 저장한 파일과 값이 같다", () => {
    const input = fixture("xcode-duplicate-input.xcstrings");
    const output = fixture("xcode-duplicate-output.xcstrings");
    expect(valuesOf(input)).toEqual(valuesOf(output));
    expect(valuesOf(input)).toEqual({ de: { Greeting: "Hallo", Save: "Sichern" }, en: { Greeting: "Greeting", "LLM Settings": "LLM Settings", Save: "Save" } });
    expect(readOf(input).errors).toEqual([
      { path: PATH, code: "duplicate-property", key: "Greeting" },
      { path: PATH, code: "duplicate-property", key: "LLM Settings" },
      { path: PATH, code: "duplicate-property", key: "Save" },
    ]);
    expect(adapterErrorKind("duplicate-property")).toBe("warning");
    expect(readOf(output).errors).toEqual([]);
  });

  it("앞 사본만 고치고 가려진 사본은 바이트 그대로다 — 키·언어 셀·필드 모두", () => {
    const input = fixture("xcode-duplicate-input.xcstrings");
    const res = writeAll(input, { de: { Greeting: "Guten Tag", Save: "Speichern!", "LLM Settings": "LLM-Einstellungen" } });
    expect(res.errors).toEqual([]);
    const out = res.content;
    expect(out).toContain('"value" : "Servus"');
    expect(out).toContain('"value" : "Speichern"');
    expect(out).toContain('    "LLM Settings" : {\n\n    },');
    expect(valuesOf(out)).toMatchObject({ de: { Greeting: "Guten Tag", Save: "Speichern!", "LLM Settings": "LLM-Einstellungen" } });
    // 바뀐 것은 앞 사본의 두 값과 앞 키에 넣은 셀뿐이다.
    const back = out.replace('"Guten Tag"', '"Hallo"').replace('"Speichern!"', '"Sichern"')
      .replace(/"de" : \{\n {10}"stringUnit" : \{\n {12}"state" : "translated",\n {12}"value" : "LLM-Einstellungen"\n {10}\}\n {8}\},\n {8}/, "");
    expect(back).toBe(input);
  });

  it("루트의 같은 이름도 앞의 것이고 키 없는 경고다", () => {
    const raw = '{"sourceLanguage":"en","sourceLanguage":"de","strings":{"k":{}},"version":"1.0"}';
    expect(valuesOf(raw)).toEqual({ en: { k: "k" } });
    expect(readOf(raw).errors).toEqual([{ path: PATH, code: "duplicate-property" }]);
  });

  it.each([
    ["빈 파일", ""],
    ["공백만", " \n"],
    ["닫히지 않은 객체", '{"sourceLanguage":"en"'],
    ["끝 쉼표", '{"sourceLanguage":"en","strings":{},}'],
    ["주석", '{"sourceLanguage":"en", /* c */ "strings":{}}'],
    ["작은따옴표", "{'sourceLanguage':'en','strings':{}}"],
    ["뒤에 남은 글자", '{"sourceLanguage":"en","strings":{}} x'],
    ["잘못된 이스케이프", `{"sourceLanguage":"en","strings":{"a${B}x":{}}}`],
    ["짧은 유니코드 이스케이프", `{"sourceLanguage":"en","strings":{"a${B}u12":{}}}`],
    ["문자열 안의 날 개행", '{"sourceLanguage":"en","strings":{"a\nb":{}}}'],
    ["문자열 안의 날 탭", '{"sourceLanguage":"en","strings":{"a\tb":{}}}'],
    ["잘못된 숫자", '{"sourceLanguage":"en","strings":{},"version":01}'],
    ["따옴표 없는 이름", '{sourceLanguage:"en","strings":{}}'],
  ])("JSON이 아니면 parse-failed — %s", (_label, raw) => {
    expect(parseFailed(raw)).toEqual(["parse-failed"]);
  });

  it("숫자·불린·null·배열은 읽지 않는 자리에서 받는다", () => {
    const raw = '{"sourceLanguage":"en","strings":{"k":{"extra":[1,-2.5e3,true,false,null,{"x":[]}]}},"version":1.0}';
    expect(readOf(raw).errors).toEqual([]);
    expect(valuesOf(raw).en).toEqual({ k: "k" });
  });

  it("깊은 중첩은 던지지 않고 parse-failed다", () => {
    const raw = `{"sourceLanguage":"en","strings":{"k":{"x":${"[".repeat(5000)}${"]".repeat(5000)}}}}`;
    expect(parseFailed(raw)).toEqual(["parse-failed"]);
  });

  it("루트가 객체가 아니면 root-not-object", () => {
    expect(parseFailed("[]")).toEqual(["root-not-object"]);
    expect(parseFailed('"x"')).toEqual(["root-not-object"]);
  });

  it.each([
    ["sourceLanguage 없음", '{"strings":{},"version":"1.0"}'],
    ["sourceLanguage가 문자열이 아님", '{"sourceLanguage":1,"strings":{},"version":"1.0"}'],
    ["strings 없음", '{"sourceLanguage":"en","version":"1.0"}'],
    ["strings가 객체가 아님", '{"sourceLanguage":"en","strings":[],"version":"1.0"}'],
    ["키의 값이 객체가 아님", '{"sourceLanguage":"en","strings":{"k":"v"},"version":"1.0"}'],
    ["localizations가 객체가 아님", '{"sourceLanguage":"en","strings":{"k":{"localizations":[]}},"version":"1.0"}'],
    ["언어 셀이 객체가 아님", '{"sourceLanguage":"en","strings":{"k":{"localizations":{"de":"x"}}},"version":"1.0"}'],
  ])("카탈로그 모양이 아니면 parse-failed — %s", (_label, raw) => {
    expect(parseFailed(raw)).toEqual(["parse-failed"]);
  });

  it("UTF-8 BOM을 받고 원본 바이트로 남긴다", () => {
    const raw = `${String.fromCharCode(0xfeff)}${catalog({ k: { localizations: { de: unit("a") } } })}`;
    expect(valuesOf(raw).de).toEqual({ k: "a" });
    expect(writeOne(raw, "de", [{ key: "k", message: "a" }]).content).toBe(raw);
    expect(writeOne(raw, "de", [{ key: "k", message: "b" }]).content).toBe(raw.replace('"a"', '"b"'));
  });
});

describe("read — 기준 언어·로케일·엔트리", () => {
  it("로케일은 셀 언어의 합집합 + sourceLanguage이고, 원문 셀이 없는 키는 키 문자열이 원문이다", () => {
    const raw = catalog({
      "Hello": { localizations: { en: unit("Hello there"), fr: unit("Bonjour") } },
      "Save": { localizations: { de: unit("Sichern") } },
      "Bare": {},
    });
    const result = readOf(raw);
    expect(result.errors).toEqual([]);
    expect(result.nested).toBe(false);
    expect(result.locales.map((l) => l.locale)).toEqual(["de", "en", "fr"]);
    expect(valuesOf(raw)).toEqual({ de: { Save: "Sichern" }, en: { Bare: "Bare", Hello: "Hello there", Save: "Save" }, fr: { Hello: "Bonjour" } });
  });

  it("sourceLanguage가 en이 아니어도 그 언어가 원문이다", () => {
    expect(valuesOf(catalog({ "Hallo": { localizations: { en: unit("Hello") } } }, "de"))).toEqual({ de: { Hallo: "Hallo" }, en: { Hallo: "Hello" } });
  });

  it("엔트리는 키 코드 유닛 순이고 order를 싣지 않는다(수술적 — 키를 삽입하지 않는다)", () => {
    const entries = readOf(catalog({ b: {}, a: {}, B: {}, "é": {}, _x: {} })).locales[0]!.entries;
    expect(entries.map((e) => e.key)).toEqual(["B", "_x", "a", "b", "é"]);
    expect(entries.every((e) => e.order === undefined)).toBe(true);
  });

  it("shouldTranslate:false인 키는 어느 언어의 엔트리도 아니고 오류도 아니다", () => {
    const raw = catalog({ Brand: { shouldTranslate: false, localizations: { de: unit("Marke") } }, Ok: {} });
    expect(readOf(raw).errors).toEqual([]);
    expect(valuesOf(raw)).toEqual({ de: {}, en: { Ok: "Ok" } });
  });

  it("shouldTranslate:true는 평범한 키다", () => {
    expect(valuesOf(catalog({ Ok: { shouldTranslate: true } })).en).toEqual({ Ok: "Ok" });
  });

  /** 복수형·기기별 `variations`는 읽지 않고 보존만 한다(PRODUCT §4.2) — 수술적 writer가 남기므로 실패가 아니라 unmanaged다. */
  it("원문 셀이 variations면 키 전체가 엔트리가 아니고 value-not-string(unmanaged)을 한 번 낸다", () => {
    const raw = catalog({
      "%lld items": { localizations: { en: { variations: { plural: { one: unit("%lld item"), other: unit("%lld items") } } }, de: unit("%lld Elemente") } },
      Ok: {},
    });
    const result = readOf(raw);
    expect(result.errors).toEqual([{ path: PATH, code: "value-not-string", key: "%lld items" }]);
    expect(adapterErrorKind("value-not-string")).toBe("unmanaged");
    expect(valuesOf(raw)).toEqual({ de: {}, en: { Ok: "Ok" } });
  });

  it("번역 셀만 variations면 그 셀만 빠지고 같은 오류를 키당 한 번 낸다", () => {
    const plural = { variations: { plural: { one: unit("x"), other: unit("y") } } };
    const raw = catalog({ "%lld": { localizations: { en: unit("%lld"), de: plural, fr: plural, ja: unit("%lld 件") } } });
    const result = readOf(raw);
    expect(result.errors).toEqual([{ path: PATH, code: "value-not-string", key: "%lld" }]);
    expect(valuesOf(raw)).toEqual({ de: {}, en: { "%lld": "%lld" }, fr: {}, ja: { "%lld": "%lld 件" } });
  });

  it("stringUnit 옆의 substitutions는 보존 대상이고 엔트리는 stringUnit 값이다", () => {
    const raw = catalog({ "%@ of %lld": { localizations: { de: { stringUnit: { state: "translated", value: "%1$@ von %2$#@n@" }, substitutions: { n: { argNum: 2 } } } } } });
    expect(readOf(raw).errors).toEqual([]);
    expect(valuesOf(raw).de).toEqual({ "%@ of %lld": "%1$@ von %2$#@n@" });
  });

  it("extractionState는 해석하지 않는다 — stale 키도 파일에 있으면 엔트리다", () => {
    expect(valuesOf(catalog({ Old: { extractionState: "stale" } })).en).toEqual({ Old: "Old" });
  });

  it("경로·로케일로 쓸 수 없는 언어 코드는 엔트리로 싣지 않는다(적재 경계가 페이로드 전체를 거부한다)", () => {
    const raw = catalog({ k: { localizations: { "de": unit("a"), "x y": unit("b"), "../e": unit("c") } } });
    expect(readOf(raw).locales.map((l) => l.locale)).toEqual(["de", "en"]);
  });

  it("__proto__·constructor 키도 own 엔트리이고 Object.prototype을 건드리지 않는다", () => {
    const before = Object.getOwnPropertyNames(Object.prototype).length;
    const raw = catalog(Object.fromEntries([["__proto__", { localizations: { de: unit("P") } }], ["constructor", {}]]));
    expect(valuesOf(raw)).toEqual({ de: Object.fromEntries([["__proto__", "P"]]), en: Object.fromEntries([["__proto__", "__proto__"], ["constructor", "constructor"]]) });
    expect(Object.getOwnPropertyNames(Object.prototype).length).toBe(before);
  });
});

describe("코퍼스 골든 — 바이트 그대로", () => {
  it.each(["healthgpt.xcstrings", "swiftuikit.xcstrings", "shotnix-excerpt.xcstrings", "xcode-before.xcstrings", "xcode-after.xcstrings"])(
    "%s: 읽은 값을 그대로 다시 쓰면 원본 바이트다",
    (name) => {
      const raw = fixture(name);
      expect(readOf(raw).locales.length).toBeGreaterThan(0);
      const result = writeAll(raw, {});
      expect(result.errors).toEqual([]);
      expect(result.content).toBe(raw);
    },
  );

  it("HealthGPT: 55키가 en 하나로 적재되고 옛 Xcode가 쓴 중복 키(`LLM Settings`)는 앞 사본을 읽고 경고한다", () => {
    const raw = fixture("healthgpt.xcstrings");
    expect(readOf(raw).errors).toEqual([{ path: PATH, code: "duplicate-property", key: "LLM Settings" }]);
    const values = valuesOf(raw);
    expect(Object.keys(values)).toEqual(["en"]);
    expect(Object.keys(values.en!)).toHaveLength(55);
    expect(values.en!["LLM Settings"]).toBe("LLM Settings");
    expect(values.en!.API_KEY_TITLE).toBe("OpenAI API Key");
  });

  it("SwiftUIKit: localizations가 없는 키뿐 — 키가 원문이고 빈 키는 엔트리가 아니다", () => {
    expect(valuesOf(fixture("swiftuikit.xcstrings"))).toEqual({ en: { " ": " ", "%@": "%@", "%lld": "%lld", "1": "1", "Settings": "Settings" } });
  });

  it("Shotnix 발췌: 원문 셀 없는 키 · variations · 6개 언어 · 개행 이스케이프", () => {
    const raw = fixture("shotnix-excerpt.xcstrings");
    const result = readOf(raw);
    expect(result.locales.map((l) => l.locale)).toEqual(["de", "en", "fr", "ja", "ru", "uk", "zh-Hans"]);
    expect(result.errors.map((e) => [e.code, e.key])).toEqual([
      ["value-not-string", "%lld annotations"],
      ["value-not-string", "%lld annotations, %@ selected"],
      ["value-not-string", "%lld selected"],
    ]);
    const values = valuesOf(raw);
    expect(values.en!["%@ (original)"]).toBe("%@ (original)");
    expect(values.ja!["%@ (%@)"]).toBe("%@（%@）");
    expect(values.en!["Shotnix could not write the file to:\n%@"]).toBe("Shotnix could not write the file to:\n%@");
  });
});

/**
 * **읽은 것이 적재 계약을 지난다** (code-review 🔴1). `Text("")`가 만드는 빈 키 `""`가 실제 카탈로그 6개 중 3개(SwiftUIKit·Shotnix·Applite)에 있는데,
 * `IncomingKey.key`가 `min(1)`이라 하나만 실어도 첫 적재(`lib/onboarding/ingest.ts`)와 `/api/push`가 **페이로드 전체**를 거부한다. survey·어댑터 왕복은
 * 계약 스키마를 지나지 않아 못 본다 — 그래서 실제 `buildPushPayload` → `PushPayload`로 잰다.
 */
describe("적재 계약 — 코퍼스 카탈로그가 PushPayload를 지난다", () => {
  it.each(["healthgpt.xcstrings", "swiftuikit.xcstrings", "shotnix-excerpt.xcstrings", "xcode-before.xcstrings", "xcode-duplicate-input.xcstrings"])("%s", (name) => {
    const content = fixture(name);
    const format = appleXcstrings.detect([PATH], () => content);
    if (format === undefined) throw new Error("not detected");
    const { payload } = buildPushPayload({
      projectSlug: "p", surfaceSlug: "app", executionId: null, commitSha: "1".repeat(40), commitAt: "2026-10-19T00:00:00.000Z",
      format, read: appleXcstrings.read(format, [{ path: PATH, content }]), baseLocale: format.templateLocale!, scanRefs: [],
    });
    const parsed = PushPayload.safeParse(payload);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
  });

  it("빈 키는 엔트리가 아니고 파일에 그대로 남는다 — 쓰기도 건드리지 않는다", () => {
    const raw = catalog({ "": { localizations: { de: unit("x") } }, k: {} });
    expect(valuesOf(raw)).toEqual({ de: {}, en: { k: "k" } });
    expect(readOf(raw).errors).toEqual([]);
    expect(writeAll(raw, { de: { "": "y" }, fr: { "": "z" } }).content).toBe(raw);
  });
});

describe("write — 값 범위 치환", () => {
  const raw = fixture("xcode-before.xcstrings");

  it("값 문자열만 바뀌고 state는 그대로다(needs_review를 Malmoi가 풀지 않는다)", () => {
    const res = writeOne(raw, "en", [{ key: "Escapes", message: "Escapes!" }]);
    expect(res.errors).toEqual([]);
    expect(res.content).toBe(raw.replace('"value" : "Escapes"', '"value" : "Escapes!"'));
    expect(res.content).toContain('"state" : "needs_review"');
  });

  it("인코더는 Xcode와 같다 — 따옴표·역슬래시·C0는 이스케이프, `/`·U+007F·비ASCII는 그대로", () => {
    const value = `q"b${B}n\nt\t${String.fromCharCode(1)}${String.fromCharCode(0x7f)}/é😀`;
    const res = writeOne(raw, "de", [{ key: "Escapes", message: value }]);
    const literal = `"q${B}"b${B}${B}n${B}nt${B}t${B}u0001${String.fromCharCode(0x7f)}/é😀"`;
    expect(res.content).toBe(raw.replace('"value" : "old"', `"value" : ${literal}`));
    expect(valuesOf(res.content!).de!.Escapes).toBe(value);
  });

  it("값이 같으면 원본 바이트 그대로다 — 비정규 이스케이프(`\\/`·대문자 16진)도 다시 쓰지 않는다", () => {
    const odd = catalog({ k: { localizations: { de: unit("x") } } }).replace('"x"', `"a${B}/b${B}u00E9"`);
    expect(writeOne(odd, "de", [{ key: "k", message: "a/bé" }]).content).toBe(odd);
    expect(writeOne(odd, "de", [{ key: "k", message: "a/bé!" }]).content).toBe(odd.replace(`"a${B}/b${B}u00E9"`, '"a/bé!"'));
  });

  it("파일에 없는 키는 쓰지 않는다 — 키는 코드가 정한다(삽입은 셀만)", () => {
    const res = writeOne(raw, "de", [{ key: "Not in file", message: "X" }]);
    expect(res).toEqual({ content: raw, errors: [] });
  });

  it("orphaned·빈 값은 원본 값을 남긴다 — 비울 수 없다(불변식 3)", () => {
    expect(writeOne(raw, "de", [{ key: "Greeting", message: "", writeEmpty: true }]).content).toBe(raw);
    expect(writeOne(raw, "de", [{ key: "Greeting", message: "LEAK", orphaned: true }]).content).toBe(raw);
    expect(planClearability({ writeStrategy: appleXcstrings.writeStrategy, isBase: false, value: "", sourceText: "Greeting" })).toBe("cannot-clear");
  });

  it("variations 셀에 값을 쓰려 하면 write-slot-not-scalar이고 그 셀을 바꾸지 않는다", () => {
    const res = writeOne(raw, "de", [{ key: "Plural %lld", message: "X" }, { key: "Greeting", message: "Hi" }]);
    expect(res.errors).toEqual([{ path: PATH, code: "write-slot-not-scalar", key: "Plural %lld" }]);
    expect(adapterErrorKind("write-slot-not-scalar")).toBe("failure");
    expect(res.content).toBe(raw.replace('"value" : "Hallo"', '"value" : "Hi"'));
  });

  it("shouldTranslate:false 키는 쓰지 않는다", () => {
    expect(writeOne(raw, "de", [{ key: "Skip", message: "X" }])).toEqual({ content: raw, errors: [] });
  });

  it("원본이 없으면 null — 치환할 대상이 없다", () => {
    expect(appleXcstrings.write({ ...formatOf(raw), currentFiles: undefined }, { locale: "de", entries: [{ key: "Greeting", message: "x" }] })).toBeNull();
  });

  it("파싱 실패는 원본을 돌려주고 write-parse-failed를 알린다", () => {
    const broken = '{"sourceLanguage":"en","strings":{"k":{},}}';
    const res = writeOne(broken, "de", [{ key: "k", message: "x" }]);
    expect(res.content).toBe(broken);
    expect(res.errors).toEqual([expect.objectContaining({ path: PATH, code: "write-parse-failed" })]);
  });
});

describe("write — 없는 셀 삽입 (Xcode 서식)", () => {
  /**
   * `xcode-before`에 같은 편집을 하면 Xcode 26.6이 직렬화한 `xcode-after`와 **바이트가 같다**(README — `xcstringstool sync` 채록). 위치(코드 유닛 순)·
   * 2칸 들여쓰기·`" : "`·콤마·빈 객체 `{\n\n    }`의 채움·`comment`·`extractionState` 뒤의 `localizations` 생성이 한 번에 걸린다.
   */
  it("Xcode가 같은 의미로 저장한 파일과 바이트가 같다", () => {
    const res = writeAll(fixture("xcode-before.xcstrings"), {
      ar: { Greeting: "مرحبا" },
      de: { Empty: "Leer", Commented: "Kommentiert", Escapes: `q"b${B}n\nt\t${String.fromCharCode(1)}${String.fromCharCode(0x7f)}/é😀` },
      en: { "Edited source": "Edited source text" },
      fr: { Greeting: "Bonjour", "Key as source": "Clé", Empty: "Vide" },
    });
    expect(res.errors).toEqual([]);
    expect(res.content).toBe(fixture("xcode-after.xcstrings"));
  });

  it("삽입한 셀은 다음 read가 읽고, 같은 DB로 다시 쓰면 고정점이다", () => {
    const after = fixture("xcode-after.xcstrings");
    expect(valuesOf(after)).toMatchObject({ ar: { Greeting: "مرحبا" }, en: { "Edited source": "Edited source text", "Key as source": "Key as source" }, fr: { Empty: "Vide" } });
    expect(writeAll(after, {}).content).toBe(after);
  });

  it("새 셀의 state는 translated다", () => {
    const res = writeOne(catalog({ k: { localizations: { de: unit("a", "needs_review") } } }), "fr", [{ key: "k", message: "b" }]);
    expect(JSON.parse(res.content!).strings.k.localizations).toEqual({ de: unit("a", "needs_review"), fr: unit("b") });
  });

  /** 키 = 원문(design §2.3, 2026-10-19 사용자): 원문 셀이 없을 때 DB 원문이 키와 같으면 쓰지 않고(첫 Publish diff 0), 다르면 원문 셀을 넣는다. */
  it("원문 셀이 없는 키: 원문 = 키면 원문 셀을 쓰지 않는다", () => {
    const raw = fixture("xcode-before.xcstrings");
    expect(writeOne(raw, "en", [{ key: "Key as source", message: "Key as source" }, { key: "Empty", message: "Empty" }]).content).toBe(raw);
  });

  it("원문 셀이 없는 키: 원문 ≠ 키면 원문 셀을 넣고, 다음 read는 그 값을 원문으로 읽는다", () => {
    const raw = fixture("xcode-before.xcstrings");
    const out = writeOne(raw, "en", [{ key: "Key as source", message: "Key, edited" }]).content!;
    expect(JSON.parse(out).strings["Key as source"].localizations.en).toEqual(unit("Key, edited"));
    expect(valuesOf(out).en!["Key as source"]).toBe("Key, edited");
    // 원문을 키와 같은 값으로 되돌리면 넣은 셀의 값을 바꾼다 — 셀을 지우지 않는다(지우는 길이 없다).
    expect(valuesOf(writeOne(out, "en", [{ key: "Key as source", message: "Key as source" }]).content!).en!["Key as source"]).toBe("Key as source");
  });

  it("한 객체의 앞·중간·뒤 삽입이 한 번의 write에서 겹치지 않는다", () => {
    const raw = fixture("xcode-before.xcstrings");
    const res = writeOne(raw, "zz", [{ key: "Greeting", message: "Z" }]);
    const locales = Object.keys(JSON.parse(res.content!).strings.Greeting.localizations);
    expect(locales).toEqual(["de", "en", "zz"]);
    const both = writeAll(raw, { ar: { Greeting: "A" }, es: { Greeting: "E" }, zz: { Greeting: "Z" } }).content;
    expect(Object.keys(JSON.parse(both).strings.Greeting.localizations)).toEqual(["ar", "de", "en", "es", "zz"]);
  });

  it("입력 순서에 의존하지 않고 같은 입력은 같은 바이트다", () => {
    const raw = fixture("xcode-before.xcstrings");
    const entries: LocaleEntry[] = [{ key: "Greeting", message: "Bonjour" }, { key: "Empty", message: "Vide" }, { key: "Key as source", message: "Clé" }];
    const one = writeOne(raw, "fr", entries).content;
    expect(writeOne(raw, "fr", [...entries].reverse()).content).toBe(one);
    expect(writeOne(raw, "fr", entries).content).toBe(one);
  });

  it("기존 키 순서가 대소문자 무시 순(옛 Xcode)이어도 키를 다시 정렬하지 않는다", () => {
    const raw = fixture("healthgpt.xcstrings");
    const out = writeOne(raw, "de", [{ key: "OPEN_AI_MODEL_SAVE_ACTION", message: "Speichern" }]).content!;
    const keys = Object.keys(JSON.parse(raw).strings);
    expect(Object.keys(JSON.parse(out).strings)).toEqual(keys);
    // 바뀐 것은 그 키의 블록 안, en 앞에 들어간 셀뿐이다.
    expect(out.replace(/"de" : \{\n {10}"stringUnit" : \{\n {12}"state" : "translated",\n {12}"value" : "Speichern"\n {10}\}\n {8}\},\n {8}/, "")).toBe(raw);
  });

  it("도구가 쓴 `{}` 빈 객체에도 Xcode 들여쓰기로 localizations를 만든다", () => {
    const raw = fixture("shotnix-excerpt.xcstrings");
    const out = writeOne(raw, "de", [{ key: "%@ %@", message: "%1$@ %2$@" }]).content!;
    expect(out).toBe(raw.replace('    "%@ %@" : {},', [
      '    "%@ %@" : {',
      '      "localizations" : {',
      '        "de" : {',
      '          "stringUnit" : {',
      '            "state" : "translated",',
      '            "value" : "%1$@ %2$@"',
      "          }",
      "        }",
      "      }",
      "    },",
    ].join("\n")));
  });

  it("4칸·CRLF 파일은 그 들여쓰기와 줄바꿈으로 넣는다", () => {
    const raw = JSON.stringify({ sourceLanguage: "en", strings: { k: { localizations: { de: unit("a") } } }, version: "1.0" }, null, 4).replace(/\n/g, "\r\n");
    const out = writeOne(raw, "fr", [{ key: "k", message: "b" }]).content!;
    const sp = (n: number) => " ".repeat(n);
    const closeDe = `"value": "a"\r\n${sp(20)}}\r\n${sp(16)}}`;
    const fr = [`,\r\n${sp(16)}"fr": {`, `${sp(20)}"stringUnit": {`, `${sp(24)}"state": "translated",`, `${sp(24)}"value": "b"`, `${sp(20)}}`, `${sp(16)}}`].join("\r\n");
    expect(out).toBe(raw.replace(closeDe, `${closeDe}${fr}`));
    expect(writeOne(out, "fr", [{ key: "k", message: "b" }]).content).toBe(out);
  });

  it("공백 없는 파일은 공백 없이 넣는다", () => {
    const raw = catalog({ k: { localizations: { de: unit("a") } }, e: {} });
    const out = writeAll(raw, { fr: { k: "b", e: "c" } }).content;
    expect(out).toBe(catalog({ k: { localizations: { de: unit("a"), fr: unit("b") } }, e: { localizations: { fr: unit("c") } } }));
  });

  it("__proto__ 키의 셀도 쓰고 넣는다", () => {
    const raw = catalog(Object.fromEntries([["__proto__", { localizations: { de: unit("P") } }], ["constructor", {}]]));
    const out = writeAll(raw, { de: Object.fromEntries([["__proto__", "Q"], ["constructor", "K"]]) }).content;
    expect(valuesOf(out).de).toEqual(Object.fromEntries([["__proto__", "Q"], ["constructor", "K"]]));
  });
});

describe("어댑터 성질 — 언어 추가·제거 비지원, 셀 삽입", () => {
  it("multi-locale · 수술적 · create 없음 · 셀 삽입", () => {
    expect(appleXcstrings).toMatchObject({ name: "apple-xcstrings", layout: "multi-locale", writeStrategy: "surgical", insertsMissingCells: true });
    expect(appleXcstrings.create).toBeUndefined();
  });

  it("언어 추가·제거를 지원하지 않는다 — 화면 분기는 이 판정에서 파생된다", () => {
    expect(supportsLocaleChanges("apple-xcstrings")).toBe(false);
  });
});

describe("탐지", () => {
  const content = catalog({ Hello: { localizations: { en: unit("Hello"), ko: unit("안녕"), "zh-Hans": unit("你好") } } });

  it("경로만으로는 후보를 내지 않는다 — 내용이 있어야 로케일을 안다", () => {
    expect(appleXcstrings.detectCandidates(["App/Localizable.xcstrings"])).toEqual([]);
    expect(appleXcstrings.detect(["App/Localizable.xcstrings"])).toBeUndefined();
  });

  it("후보는 파일 하나이고 템플릿은 그 경로, 로케일은 셀 언어, 기준 언어 힌트는 sourceLanguage다", () => {
    const found = appleXcstrings.detectCandidates(["App/Localizable.xcstrings"], () => content);
    expect(found).toEqual([{ adapter: "apple-xcstrings", pathTemplate: "App/Localizable.xcstrings", locales: ["en", "ko", "zh-Hans"], templateLocale: "en" }]);
    expect(appleXcstrings.detect(["App/Localizable.xcstrings"], () => content)).toEqual(found[0]);
  });

  it("sourceLanguage가 en이 아니면 그 언어가 기준 언어 힌트다", () => {
    const found = appleXcstrings.detectCandidates(["A/Localizable.xcstrings"], () => catalog({ x: {} }, "ja"));
    expect(found[0]).toMatchObject({ locales: ["ja"], templateLocale: "ja" });
  });

  it.each([
    ["JSON이 아님", "not json"],
    ["카탈로그가 아닌 JSON", '{"a":1}'],
    ["로케일이 아닌 sourceLanguage", catalog({}, "../x")],
  ])("내용이 카탈로그가 아니면 후보가 아니다 — %s", (_label, body) => {
    expect(appleXcstrings.detectCandidates(["App/Localizable.xcstrings"], () => body)).toEqual([]);
  });

  it("빈 카탈로그(키 0개)도 후보다 — 기준 언어 하나", () => {
    expect(appleXcstrings.detectCandidates(["App/Localizable.xcstrings"], () => catalog({}))[0]).toMatchObject({ locales: ["en"] });
  });

  it("Pods·build·fastlane·번들(.framework·.app) 안은 후보가 아니다", () => {
    const paths = ["Pods/X/Localizable.xcstrings", "build/Y.xcstrings", "fastlane/a.xcstrings", "Vendor/S.framework/R/Localizable.xcstrings", "Out/My.app/Localizable.xcstrings"];
    expect(appleXcstrings.detectCandidates(paths, () => content)).toEqual([]);
    expect(xcstringsProbePaths(paths)).toEqual([]);
  });

  /**
   * probe 예산(design §5) — 온보딩 1패스는 경로만 보므로 이 어댑터의 후보가 0이고, `xcstringsProbePaths`가 내려받을 파일을 고른다(ts-dict 씨앗과 같은 자리).
   * 리포에 카탈로그가 많으면(iTerm2 60여 개 — 스토리보드마다 `mul.lproj/*.xcstrings`) `Localizable`이 앞이고 예제·테스트가 뒤다.
   */
  it("씨앗은 둘이고 `Localizable.xcstrings` → 예제·테스트 아닌 것 → 얕은 경로 → 경로순이다", () => {
    const paths = [
      "App/mul.lproj/Main.xcstrings",
      "App/InfoPlist.xcstrings",
      "Examples/Demo/Localizable.xcstrings",
      "App/Sources/Resources/Localizable.xcstrings",
      "Localizable.xcstrings",
      "README.md",
    ];
    expect(xcstringsProbePaths(paths)).toEqual(["Localizable.xcstrings", "App/Sources/Resources/Localizable.xcstrings"]);
    expect(xcstringsProbePaths([...paths].reverse())).toEqual(xcstringsProbePaths(paths));
  });

  it("후보 순서도 같은 규칙이다", () => {
    const paths = ["App/InfoPlist.xcstrings", "App/Sources/Localizable.xcstrings", "Tests/Localizable.xcstrings"];
    expect(appleXcstrings.detectCandidates(paths, () => content).map((c) => c.pathTemplate)).toEqual([
      "App/Sources/Localizable.xcstrings", "App/InfoPlist.xcstrings", "Tests/Localizable.xcstrings",
    ]);
  });

  it("`{locale}`·`*`가 든 경로는 템플릿이 될 수 없어 후보가 아니다", () => {
    expect(appleXcstrings.detectCandidates(["A/{locale}.xcstrings", "B/*.xcstrings"], () => content)).toEqual([]);
  });

  describe("어댑터 간 순위", () => {
    const strings = '"a" = "A";\n';
    it("xcstrings가 로케일이 더 많으면 같은 앱의 `.strings` 테이블을 이긴다", () => {
      const paths = ["Loop/Localizable.xcstrings", "Loop/en.lproj/InfoPlist.strings", "Loop/de.lproj/InfoPlist.strings"];
      const found = detectCandidatesAcross(paths, (p) => (p.endsWith(".xcstrings") ? content : strings));
      expect(found.map((c) => c.adapter)).toEqual(["apple-xcstrings", "apple-strings"]);
    });

    it("Flutter 앱(pubspec.yaml)의 `ios/`·`macos/` 카탈로그는 ARB 뒤로 간다", () => {
      const paths = ["pubspec.yaml", "lib/l10n/app_en.arb", "ios/Runner/Localizable.xcstrings"];
      const found = detectCandidatesAcross(paths, (p) => (p.endsWith(".xcstrings") ? content : p.endsWith(".arb") ? '{"a":"A"}' : "name: app\n"));
      expect(found.map((c) => c.adapter)).toEqual(["arb-catalog", "apple-xcstrings"]);
    });

    it("대조: pubspec.yaml이 없으면 `ios/` 카탈로그가 셸이 아니다", () => {
      const paths = ["lib/l10n/app_en.arb", "ios/Runner/Localizable.xcstrings"];
      const found = detectCandidatesAcross(paths, (p) => (p.endsWith(".xcstrings") ? content : '{"a":"A"}'));
      expect(found[0]?.adapter).toBe("apple-xcstrings");
    });
  });
});
