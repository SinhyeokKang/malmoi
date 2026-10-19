import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { androidStrings, androidValueTags, decodeAndroidValue, encodeAndroidValue, tokenizeAndroid } from "../android-strings";
import type { DetectedFormat, LocaleEntry } from "../types";

/**
 * Android 값의 플랫폼 의미 — 리뷰 R1(스팬 경계 공백) · R2(쓰는 태그의 XML 문법) · Y2(Compose 리소스 변환기) · 결정 18(`formatted`).
 *
 * 기대값은 손으로 정하지 않고 플랫폼 도구에서 채록했다(경위는 `fixtures/android-strings/README.md`):
 * - `aapt2-styled.json` — aapt2 2.20의 styled string 본문과 스팬 범위
 * - `compose-values.json` — Compose Multiplatform 1.12.2 gradle 플러그인의 변환(`DOM textContent → handleSpecialCharacters`)
 * - `aapt2-encoded.json`·`compose-encoded.json` — 인코더가 낸 원문을 각 도구가 다시 읽은 값(새 값이 Publish 뒤 DB 값 그대로 읽히는가)
 */
const FIXTURES = join(__dirname, "fixtures/android-strings");
const load = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

/** 글 → 값 문법(결정 14). */
const dbOf = (text: string) => text.replace(/&(?=lt;|amp;)/g, "&amp;").replaceAll("<", "&lt;");
/** 값 → 플랫폼이 보이는 글(태그를 걷고 `&lt;`·`&amp;`를 푼다). */
const textOf = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&(lt|amp);/g, (_, e: string) => (e === "lt" ? "<" : "&"));
/**
 * 값 → aapt2 dump의 스팬 표기(`b:2,2 i:4,4` — 시작 순서, 시작·끝 포함, 빈 스팬은 끝이 시작-1, 속성은 `a;href=값`). `<xliff:g>`는 스팬이 아니다.
 */
function spansOf(value: string): string {
  const out: { start: number; text: string }[] = [];
  const open: { label: string; at: number }[] = [];
  let at = 0;
  const label = (name: string, attrs: string) =>
    [name, ...[...attrs.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => `${m[1]}=${(m[2] ?? m[3] ?? "").replace(/&amp;/g, "&")}`)].join(";");
  for (const m of value.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|&(?:lt|amp);|[\s\S]/gu)) {
    const [whole, close, name, attrs = "", self] = m;
    if (name === undefined) {
      at += whole === "&lt;" || whole === "&amp;" ? 1 : whole.length;
      continue;
    }
    if (name === "xliff:g") continue;
    if (self === "/") out.push({ start: at, text: `${label(name, attrs)}:${at},${at - 1}` });
    else if (close === "/") {
      const o = open.pop()!;
      out.push({ start: o.at, text: `${o.label}:${o.at},${at - 1}` });
    } else open.push({ label: label(name, attrs), at });
  }
  return out.sort((a, b) => a.start - b.start).map((o) => o.text).join(" ");
}

describe("R1 — 스팬 경계의 공백·따옴표 (aapt2 채록)", () => {
  const STYLED = load<{ raw: string; styled: boolean; text: string; spans: string }[]>("aapt2-styled.json");

  it("채록 표가 따옴표 안팎·앞뒤·연속 공백 스팬 경우를 담는다", () => {
    expect(STYLED.length).toBeGreaterThan(30);
    expect(STYLED.map((c) => c.raw)).toEqual(expect.arrayContaining(['"  <b>x</b>  "', "a  <b>  x  </b>  b", '"a  <b>  x  </b>  b"']));
  });

  it.each(STYLED.map((c) => [c.raw, c.text, c.spans] as const))("%j → 본문 %j · 스팬 %j", (raw, text, spans) => {
    const value = decodeAndroidValue(raw);
    expect(value === undefined ? undefined : textOf(value)).toBe(text);
    expect(spansOf(value!)).toBe(spans);
  });

  it("스팬 경계에서 따옴표 구간이 닫힌다 — `\"  <b>x</b>  \"`는 aapt2가 `  x `로 읽는다", () => {
    expect(decodeAndroidValue('"  <b>x</b>  "')).toBe("  <b>x</b> ");
  });

  it("새 값은 스팬 사이 구간마다 필요한 만큼만 감싼다 — 값 전체를 감싸면 스팬 경계에서 따옴표가 풀려 공백을 잃는다", () => {
    expect(encodeAndroidValue("  <b>x</b>  ")).toBe('"  "<b>x</b>"  "');
    expect(encodeAndroidValue(" <b>x</b> ")).toBe(" <b>x</b> ");
    expect(encodeAndroidValue("a  <b>  x  </b>  b")).toBe('"a  "<b>"  x  "</b>"  b"');
    // 스팬이 없으면(`<xliff:g>`만) 지금처럼 값 전체를 감싼다 — 앞뒤 공백을 자르고 따옴표가 태그를 건너 이어진다.
    expect(encodeAndroidValue(' x <xliff:g id="n">%1$s</xliff:g>')).toBe('" x <xliff:g id="n">%1$s</xliff:g>"');
  });

  it("인코더 출력을 aapt2가 다시 읽으면 값의 글·스팬 그대로다 (aapt2-encoded.json)", () => {
    const ENCODED = load<{ value: string; raw: string; text: string; spans: string }[]>("aapt2-encoded.json");
    expect(ENCODED.length).toBeGreaterThan(20);
    for (const c of ENCODED) {
      expect(encodeAndroidValue(c.value), JSON.stringify(c.value)).toBe(c.raw);
      expect(textOf(c.value), JSON.stringify(c.value)).toBe(c.text);
      expect(spansOf(c.value), JSON.stringify(c.value)).toBe(c.spans);
      expect(decodeAndroidValue(c.raw), JSON.stringify(c.value)).toBe(c.value);
    }
  });
});

describe("R2 — 쓰는 태그의 XML 문법 (`androidValueTags`)", () => {
  it.each([
    ["Hi <b>you</b>", ["<b>", "</b>"]],
    ['x <a href="http://x?a=1&amp;b=2">l</a>', ['<a href="http://x?a=1&amp;b=2">', "</a>"]],
    ["a<br/>b", ["<br/>"]],
    ['<xliff:g id="n" example="&#x41;&#66;">%1$s</xliff:g>', ['<xliff:g id="n" example="&#x41;&#66;">', "</xliff:g>"]],
    ["&lt;b> 글", []],
    ["", []],
  ])("%j → 태그 %j", (value, tags) => {
    expect(androidValueTags(value)).toEqual(tags);
  });

  it.each([
    ['<b a="&">x</b>', "속성 값의 맨 &"],
    ['<b a="&foo;">x</b>', "모르는 엔티티"],
    ['<b a="&#12abc;">x</b>', "문자 참조 뒤 쓰레기(parseInt 부분 성공)"],
    ['<b a="&#x;">x</b>', "숫자 없는 16진 참조"],
    ['<b a="&#1;">x</b>', "XML에 담을 수 없는 문자 참조"],
    ['<b a="x" a="y">x</b>', "같은 속성 둘"],
    ['<b>x</b a="y">', "닫는 태그의 속성"],
    ["<b>x</i>", "짝이 다른 닫는 태그"],
    ["<b>x", "닫히지 않은 태그"],
    ["a < b", "태그를 시작하지 않는 <"],
    ["<1>", "이름이 아닌 태그"],
  ])("%j → 쓸 수 없다 (%s)", (value) => {
    expect(androidValueTags(value)).toBeUndefined();
    expect(encodeAndroidValue(value)).toBeUndefined();
  });

  const TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
  const KO = '<resources>\n    <string name="a">가</string>\n</resources>\n';
  const format: DetectedFormat = { adapter: "android-strings", pathTemplate: TEMPLATE, locales: ["ko"], currentFiles: [{ path: "app/src/main/res/values-ko/strings.xml", content: KO }] };

  it.each(['<b a="&">x</b>', '<b a="x" a="y">x</b>', '<b>x</b a="y">'])("write: %j는 그 파일의 write-parse-failed(키 포함)이고 원본 그대로다", (bad) => {
    expect(androidStrings.writeWithErrors!(format, { locale: "ko", entries: [{ key: "a", message: bad }] })).toEqual({
      content: KO, errors: [expect.objectContaining({ code: "write-parse-failed", key: "a" })],
    });
    expect(androidStrings.writeWithErrors!(format, { locale: "ko", entries: [{ key: "b", message: bad, order: 1 }] })).toEqual({
      content: KO, errors: [expect.objectContaining({ code: "write-parse-failed", key: "b" })],
    });
  });

  it("create: 쓸 수 없는 태그는 파일을 만들지 않고 write-parse-failed(키 포함)다", () => {
    const created = androidStrings.create!({ ...format, currentFiles: undefined, representationSource: KO }, { locale: "fr", baseLocale: "en", entries: [{ key: "a", message: '<b a="&">x</b>' }] });
    expect(created).toEqual({ content: null, errors: [expect.objectContaining({ code: "write-parse-failed", key: "a" })] });
  });

  it("엔티티 읽기도 문자 참조의 전체 형식만 받는다 — `&#12abc;`는 parse-failed다", () => {
    expect(tokenizeAndroid('<resources><string name="a">&#12abc;</string></resources>').ok).toBe(false);
    expect(tokenizeAndroid('<resources><string name="a" tools:x="&#12abc;">x</string></resources>').ok).toBe(false);
  });
});

describe("Y2 — Compose Multiplatform 리소스 (composeResources 경로)", () => {
  const COMPOSE = load<{ raw: string; compose: string }[]>("compose-values.json");
  const TEMPLATE = "shared/src/commonMain/composeResources/values-{locale}/strings.xml";
  const format = (content: string): DetectedFormat => ({ adapter: "android-strings", pathTemplate: TEMPLATE, locales: ["ko"], currentFiles: [{ path: "shared/src/commonMain/composeResources/values-ko/strings.xml", content }] });

  it("채록 표가 비어 있지 않다", () => expect(COMPOSE.length).toBeGreaterThan(30));

  /** 태그는 Compose가 걷는다(`textContent`) — 값에는 태그 원문이 남고, 태그를 걷은 글이 Compose 값이다. */
  it.each(COMPOSE.map((c) => [c.raw, c.compose] as const))("%j → %j", (raw, compose) => {
    const value = decodeAndroidValue(raw, "compose");
    expect(value === undefined ? undefined : textOf(value)).toBe(compose);
  });

  it("aapt2와 다른 곳 — 따옴표·공백은 글자 그대로, `\\'`·`\\@`는 역슬래시째, 서로게이트 쌍은 이모지", () => {
    expect(decodeAndroidValue('"[Remote] %1$s"', "compose")).toBe('"[Remote] %1$s"');
    expect(decodeAndroidValue("  a  b  ", "compose")).toBe("  a  b  ");
    expect(decodeAndroidValue("Don\\'t \\@x", "compose")).toBe("Don\\'t \\@x");
    expect(decodeAndroidValue("\\uD83D\\uDE00", "compose")).toBe("😀");
    expect(decodeAndroidValue("Hi <b>x</b>", "compose")).toBe("Hi <b>x</b>");
  });

  it("decode(encode(v)) === v — 무작위 글(역슬래시·n·u·t·따옴표·공백·제어문자·`<`·`&`)", () => {
    const alphabet = [" ", "  ", "\n", "\t", "\r", '"', "'", "\\", "\\\\", "n", "t", "u", "0041", "@", "?", "&", "<", ">", "]]>", "a", "é", "😀", "\u0007", "lt;", "amp;"];
    let seed = 11;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let n = 0; n < 2000; n += 1) {
      let text = "";
      for (let i = next() % 9; i > 0; i -= 1) text += alphabet[next() % alphabet.length];
      const value = dbOf(text);
      for (const form of [{}, { cdata: true }, { quoted: true }] as const) {
        const raw = encodeAndroidValue(value, form, "compose");
        expect(raw !== undefined && decodeAndroidValue(raw, "compose"), `${JSON.stringify(value)} → ${JSON.stringify(raw)}`).toBe(value);
      }
    }
  });

  it("인코더 출력을 Compose 변환기가 다시 읽으면 값의 글 그대로다 (compose-encoded.json)", () => {
    const ENCODED = load<{ value: string; raw: string; compose: string }[]>("compose-encoded.json");
    expect(ENCODED.length).toBeGreaterThan(20);
    for (const c of ENCODED) {
      expect(encodeAndroidValue(c.value, {}, "compose"), JSON.stringify(c.value)).toBe(c.raw);
      expect(textOf(c.value), JSON.stringify(c.value)).toBe(c.compose);
    }
  });

  it("어댑터가 composeResources 경로에서 Compose 의미로 읽고 쓴다 — 따옴표 감싼 원본도 따옴표가 글자다", () => {
    const content = '<resources>\n    <string name="r">"[Remote] %1$s"</string>\n    <string name="d">Don\'t</string>\n</resources>\n';
    const read = androidStrings.read(format(content), [{ path: "shared/src/commonMain/composeResources/values-ko/strings.xml", content }]);
    expect(read.locales[0]?.entries.map((e) => [e.key, e.message])).toEqual([["d", "Don't"], ["r", '"[Remote] %1$s"']]);
    const out = androidStrings.write(format(content), { locale: "ko", entries: [{ key: "r", message: '"[원격] %1$s"  ' }, { key: "d", message: "it's \\ ok" }] });
    expect(out).toBe('<resources>\n    <string name="r">"[원격] %1$s"  </string>\n    <string name="d">it\'s \\\\ ok</string>\n</resources>\n');
  });
});

describe("결정 18 — 기준 `<string>`의 `formatted` 속성을 새 엔트리에 나른다", () => {
  const TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
  const BASE = [
    "<resources>",
    '    <string name="fmt" formatted="false">%s %d</string>',
    "    <string name='q' formatted='false'>%s or %s</string>",
    '    <string name="plain">Hi</string>',
    "</resources>",
    "",
  ].join("\n");
  const entries: LocaleEntry[] = [{ key: "fmt", message: "%s · %d", order: 0 }, { key: "q", message: "%s 또는 %s", order: 1 }, { key: "plain", message: "안녕", order: 2 }];

  it("create: 값은 DB에서, `formatted`는 기준 파일의 속성 원문 그대로다", () => {
    const created = androidStrings.create!({ adapter: "android-strings", pathTemplate: TEMPLATE, locales: ["ko"], representationSource: BASE }, { locale: "ko", baseLocale: "en", entries });
    expect(created).toEqual({
      content: [
        "<resources>",
        '    <string name="fmt" formatted="false">%s · %d</string>',
        "    <string name=\"q\" formatted='false'>%s 또는 %s</string>",
        '    <string name="plain">안녕</string>',
        "</resources>",
        "",
      ].join("\n"),
      errors: [],
    });
  });

  it("비기준 파일의 누락 키 삽입도 기준 파일(representationSource)의 `formatted`를 나른다 — 원본 슬롯이 있는 키는 그 슬롯 그대로다", () => {
    const KO = '<resources>\n    <string name="plain">안녕</string>\n</resources>\n';
    const format: DetectedFormat = { adapter: "android-strings", pathTemplate: TEMPLATE, locales: ["ko"], currentFiles: [{ path: "app/src/main/res/values-ko/strings.xml", content: KO }], representationSource: BASE };
    expect(androidStrings.write(format, { locale: "ko", entries })).toBe(
      '<resources>\n    <string name="plain">안녕</string>\n    <string name="fmt" formatted="false">%s · %d</string>\n    <string name="q" formatted=\'false\'>%s 또는 %s</string>\n</resources>\n',
    );
    // 기준 파일이 없으면 속성 없이 넣는다(지금까지의 동작).
    expect(androidStrings.write({ ...format, representationSource: undefined }, { locale: "ko", entries: [entries[0]!] })).toContain('<string name="fmt">%s · %d</string>');
  });
});
