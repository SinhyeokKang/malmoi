import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { androidStrings, decodeAndroidValue, encodeAndroidValue, isAndroidLocale, tokenizeAndroid } from "../android-strings";
import { detectCandidatesAcross } from "../index";
import { adapterErrorKind, type DetectedFormat, type LocaleEntry, type WriteInput } from "../types";
import { planClearability } from "@/lib/keys/save";

/**
 * Android `res/values*​/strings.xml` (android-strings design §2·§3·§4·§5).
 *
 * 수술적 치환이다 — `<string>` 안쪽 범위만 바꾸고 XML 선언·주석·들여쓰기·`translatable="false"`·`<plurals>`·`<string-array>`는 원본 바이트 그대로다.
 * 값은 aapt2가 읽는 의미로 푼 문자열이고 자식 태그(`<b>`·`<xliff:g>`)는 태그 문자열 그대로다(design §3).
 *
 * **값 문법(orch 결정 14)** — DB·화면 값에서 `<`는 언제나 실제 자식 태그의 시작이다. 글자 `<`는 `&lt;`로 남는다. 그래야 파일의 `&lt;b&gt;`(Html.fromHtml이
 * 읽는 글)와 실제 태그 `<b>`가 같은 값이 되지 않아, 편집한 셀이 Publish에서 글↔태그로 뒤집히지 않는다. 글자 `&`는 `&`이고, 바로 뒤가 `lt;`·`amp;`일 때만
 * `&amp;`로 쓴다(파일 `&amp;lt;`와 `&lt;`가 다른 값이 되게). 그 밖의 엔티티·문자 참조는 푼다.
 */

/** aapt2가 읽은 글 → DB 값(결정 14). 글자 `<`는 `&lt;`, `lt;`·`amp;` 앞의 `&`는 `&amp;`. */
const dbOf = (text: string) => text.replace(/&(?=lt;|amp;)/g, "&amp;").replaceAll("<", "&lt;");

const TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
const BASE_PATH = "app/src/main/res/values/strings.xml";
const BOM = String.fromCharCode(0xfeff);
const pathOf = (locale: string) => TEMPLATE.replace("{locale}", locale);
const formatWith = (locale: string, content: string): DetectedFormat => ({
  adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, templateLocale: "en", locales: ["en", locale], currentFiles: [{ path: pathOf(locale), content }],
});
const readOne = (locale: string, content: string) => androidStrings.read(formatWith(locale, content), [{ path: pathOf(locale), content }]);
const entriesOf = (locale: string, content: string) => Object.fromEntries((readOne(locale, content).locales[0]?.entries ?? []).map((e) => [e.key, e.message]));
const writeOne = (locale: string, content: string, entries: LocaleEntry[], extra: Partial<WriteInput> = {}) =>
  androidStrings.writeWithErrors!(formatWith(locale, content), { locale, entries, ...extra });
const xml = (...lines: string[]) => ['<?xml version="1.0" encoding="utf-8"?>', "<resources>", ...lines, "</resources>", ""].join("\n");
const slotOf = (raw: string) => `<resources><string name="k">${raw}</string></resources>`;

describe("T3.0d 파서 실측 — offset·BOM·CRLF·주석·CDATA·self-closing", () => {
  it("범위는 JS 문자열 인덱스다 — 서로게이트 쌍(이모지)이 두 칸이다", () => {
    const text = '<resources><string name="e">😀😀</string><string name="f">x</string></resources>';
    const result = tokenizeAndroid(text);
    if (!result.ok) throw new Error(result.detail);
    expect(result.slots.map((s) => [s.key, text.slice(s.content!.start, s.content!.end)])).toEqual([["e", "😀😀"], ["f", "x"]]);
    expect(text.slice(result.slots[0]!.element.start, result.slots[0]!.element.end)).toBe('<string name="e">😀😀</string>');
  });

  it("UTF-8 BOM은 파서가 받지 않는다 — 건너뛰고 원본 좌표(BOM 포함)로 범위를 낸다", () => {
    const text = `${BOM}<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="a">Hi</string>\n</resources>\n`;
    const result = tokenizeAndroid(text);
    if (!result.ok) throw new Error(result.detail);
    expect(text.slice(result.slots[0]!.content!.start, result.slots[0]!.content!.end)).toBe("Hi");
  });

  it("CRLF는 범위 안팎에서 그대로다", () => {
    const text = '<?xml version="1.0" encoding="utf-8"?>\r\n<resources>\r\n  <string name="a">Hi\r\nthere</string>\r\n</resources>\r\n';
    const result = tokenizeAndroid(text);
    if (!result.ok) throw new Error(result.detail);
    expect(text.slice(result.slots[0]!.content!.start, result.slots[0]!.content!.end)).toBe("Hi\r\nthere");
    expect(result.slots[0]!.value).toBe("Hi there");
  });

  it("주석 안의 `<string>`은 엔트리가 아니고, CDATA는 안쪽 범위에 그대로 든다", () => {
    const text = '<resources>\n  <!-- <string name="c">x</string> -->\n  <string name="d"><![CDATA[<b>bold</b>]]></string>\n</resources>';
    const result = tokenizeAndroid(text);
    if (!result.ok) throw new Error(result.detail);
    // CDATA 안의 `<b>`는 태그가 아니라 글이다 — 값에서 `&lt;`로 남는다(결정 14).
    expect(result.slots.map((s) => [s.key, text.slice(s.content!.start, s.content!.end), s.value])).toEqual([["d", "<![CDATA[<b>bold</b>]]>", "&lt;b>bold&lt;/b>"]]);
  });

  it("self-closing `<string/>`은 빈 값 엔트리이고 안쪽 범위가 없다", () => {
    const result = tokenizeAndroid('<resources><string name="s"/><string name="t" /></resources>');
    if (!result.ok) throw new Error(result.detail);
    expect(result.slots.map((s) => [s.key, s.value, s.content])).toEqual([["s", "", undefined], ["t", "", undefined]]);
  });

  it("`<resources/>`·빈 루트는 0엔트리다", () => {
    for (const text of ["<resources/>", '<?xml version="1.0"?>\n<resources>\n</resources>\n']) {
      const result = tokenizeAndroid(text);
      expect(result.ok && result.slots).toEqual([]);
    }
  });

  it.each([
    ['<resources><string name="a">x</resources>', "닫히지 않은 요소"],
    ['<resources><string name="a">x & y</string></resources>', "이스케이프 안 된 &"],
    ['<resources><string name="a">x</strong></resources>', "닫는 태그 이름이 다르다(파서가 통과시킨다)"],
    ['<resources><string name="a" name="b">x</string></resources>', "같은 속성 둘"],
    ["not xml", "XML이 아니다"],
    ["\n<?xml version=\"1.0\"?><resources/>", "XML 선언 앞의 공백"],
    ['<manifest><string name="a">x</string></manifest>', "루트가 resources가 아니다"],
    ['<resources><string>x</string></resources>', "name 속성 없음(aapt2 오류)"],
    ['<resources><string name="a">a&#1;b</string></resources>', "XML에 담을 수 없는 문자 참조(aapt2 오류)"],
  ])("%j → 실패 (%s)", (text) => {
    expect(tokenizeAndroid(text).ok).toBe(false);
  });
});

describe("값 디코드 — aapt2 채록 픽스처", () => {
  /** `aapt2 compile` + `dump apc`로 채록했다(aapt2 2.20-15978811 · Maven `com.android.tools.build:aapt2:9.4.1-15978811`). 경위는 fixtures README. */
  const AAPT2: { raw: string; aapt2: string }[] = JSON.parse(readFileSync(join(__dirname, "fixtures/android-strings/aapt2-values.json"), "utf8"));

  it("채록 표가 비어 있지 않다", () => {
    expect(AAPT2.length).toBeGreaterThan(60);
  });

  it.each(AAPT2.map((c) => [c.raw, c.aapt2] as const))("%j", (raw, expected) => {
    expect(decodeAndroidValue(raw)).toBe(dbOf(expected));
  });

  it("글자 `<`·`&`의 값 표현(결정 14) — `&lt;`·`&#60;`·CDATA·`\\u003c`는 `&lt;`, `&amp;lt;`는 `&amp;lt;`, 그 밖의 `&`는 `&`", () => {
    expect(decodeAndroidValue("a &lt; b")).toBe("a &lt; b");
    expect(decodeAndroidValue("&#60;b&#x3C;")).toBe("&lt;b&lt;");
    expect(decodeAndroidValue("\\u003cb>")).toBe("&lt;b>");
    expect(decodeAndroidValue("&lt;b&gt;bold&lt;/b&gt;")).toBe("&lt;b>bold&lt;/b>");
    expect(decodeAndroidValue("<b>bold</b>")).toBe("<b>bold</b>");
    expect(decodeAndroidValue("Terms &amp; Conditions")).toBe("Terms & Conditions");
    expect(decodeAndroidValue("&amp;lt;")).toBe("&amp;lt;");
    expect(decodeAndroidValue("&amp;amp;")).toBe("&amp;amp;");
    expect(decodeAndroidValue("&amp;gt;")).toBe("&gt;");
  });

  /**
   * 자식 태그는 태그 문자열 그대로 둔다(design §3) — 태그를 걷어 낸 글이 aapt2의 styled string 본문과 같다. 스팬(`<b>`) 경계에서는 공백 접기가
   * 다시 시작되고 앞뒤를 자르지 않는다. `<xliff:g>`는 스팬이 아니라 접기가 이어지고 앞뒤를 자른다.
   */
  it.each([
    ['Hi <b>bold</b> <xliff:g id="n" example="Bob">%1$s</xliff:g>', 'Hi <b>bold</b> <xliff:g id="n" example="Bob">%1$s</xliff:g>', "Hi bold %1$s"],
    ["a <b>x</b> b", "a <b>x</b> b", "a x b"],
    ["  <b>x</b>  ", " <b>x</b> ", " x "],
    ["<b> x </b> y ", "<b> x </b> y ", " x  y "],
    [' Hi <xliff:g id="n">%1$s</xliff:g> ', 'Hi <xliff:g id="n">%1$s</xliff:g>', "Hi %1$s"],
    ['Hi  <xliff:g id="n"> %1$s </xliff:g>  there', 'Hi <xliff:g id="n">%1$s </xliff:g>there', "Hi %1$s there"],
    ["a <b>b <i>c</i></b>", "a <b>b <i>c</i></b>", "a b c"],
    ['x <a href="http://x?a=1&amp;b=2">link</a>', 'x <a href="http://x?a=1&amp;b=2">link</a>', "x link"],
    ["a<br/>b", "a<br/>b", "ab"],
    ["Don\\'t <b>stop</b>", "Don't <b>stop</b>", "Don't stop"],
  ])("태그 %j → %j (aapt2 본문 %j)", (raw, decoded, text) => {
    expect(decodeAndroidValue(raw)).toBe(decoded);
    expect(decoded.replace(/<[^>]+>/g, "")).toBe(text);
  });

  it("이스케이프 안 된 `'`(aapt2 오류 원본)도 읽는다 — 글자 그대로다", () => {
    expect(decodeAndroidValue("it's")).toBe("it's");
  });

  it("잘못된 \\u 이스케이프는 디코드 불가다(aapt2 오류)", () => {
    expect(decodeAndroidValue("\\uZZZZ")).toBeUndefined();
    expect(decodeAndroidValue("\\u12x")).toBeUndefined();
  });

  it("서로게이트 \\u 이스케이프는 aapt2처럼 버린다", () => {
    expect(decodeAndroidValue("x\\uD83D\\uDE00y")).toBe("xy");
  });
});

describe("값 인코드 — 정규형과 왕복", () => {
  it.each([
    ["Hello", "Hello"],
    ["Don't", "Don\\'t"],
    ['say "hi"', 'say \\"hi\\"'],
    ["a\nb\tc", "a\\nb\\tc"],
    ["a\\b", "a\\\\b"],
    ["@home", "\\@home"],
    ["?mark", "\\?mark"],
    ["a@b?c", "a@b?c"],
    ["a & b &lt; c", "a &amp; b &lt; c"],
    ["&amp;lt;", "&amp;lt;"],
    ["a > b", "a > b"],
    ["100%%", "100%%"],
    ["…", "…"],
    [" lead", '" lead"'],
    ["trail ", '"trail "'],
    ["two  spaces", '"two  spaces"'],
    ["", ""],
  ])("%j → %j", (value, raw) => {
    expect(encodeAndroidValue(value)).toBe(raw);
    expect(decodeAndroidValue(raw)).toBe(value);
  });

  it("decode(encode(v)) === v — 무작위 글(공백·따옴표·역슬래시·제어문자·`<`·`&`·이모지)을 값 문법(결정 14)으로 옮긴 것", () => {
    const alphabet = [" ", "  ", "\n", "\t", "\r", '"', "'", "\\", "@", "?", "&", "<", ">", "]]>", "a", "Z", "1", "%", "é", "😀", "\u0007", "\u000b", " ", "#", "lt;", "amp;"];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let n = 0; n < 2000; n += 1) {
      let value = "";
      for (let i = next() % 9; i > 0; i -= 1) value += alphabet[next() % alphabet.length];
      value = dbOf(value);
      for (const form of [{}, { cdata: true }, { quoted: true }] as const) {
        const raw = encodeAndroidValue(value, form);
        expect(raw !== undefined && decodeAndroidValue(raw), `${JSON.stringify(value)} ${JSON.stringify(form)} → ${JSON.stringify(raw)}`).toBe(value);
      }
    }
  });

  it("encode(decode(정규형)) === 정규형", () => {
    for (const raw of ["Hello", "Don\\'t", "a\\nb", '"  two  "', "\\@x", "a &amp; b", "x\\\\y", '\\"q\\"', "a &lt;b> c", "&amp;lt;", 'Hi <b>x</b> <xliff:g id="n">%1$s</xliff:g>']) {
      expect(encodeAndroidValue(decodeAndroidValue(raw)!, { quoted: raw.startsWith('"') })).toBe(raw);
    }
  });

  it("원본 형을 지킨다 — 따옴표로 감싼 값은 감싼 채, CDATA는 CDATA로", () => {
    expect(encodeAndroidValue("plain", { quoted: true })).toBe('"plain"');
    expect(encodeAndroidValue("&lt;b>x&lt;/b> & y", { cdata: true })).toBe("<![CDATA[<b>x</b> & y]]>");
    // `]]>`·실제 태그는 CDATA에 담을 수 없다 — 엔티티 형으로 내려간다.
    expect(encodeAndroidValue("a]]>b", { cdata: true })).toBe("a]]&gt;b");
    expect(encodeAndroidValue("<b>x</b>", { cdata: true })).toBe("<b>x</b>");
  });

  it("값의 `<`는 태그다 — 글 `&lt;`와 태그 `<b>`가 서로 뒤집히지 않는다(결정 14)", () => {
    expect(encodeAndroidValue("Hi <b>you</b>")).toBe("Hi <b>you</b>");
    expect(encodeAndroidValue("Hi &lt;b>you&lt;/b>")).toBe("Hi &lt;b>you&lt;/b>");
    const tagged = 'Wait <xliff:g id="n" example="5">%1$d</xliff:g> min';
    expect(decodeAndroidValue(encodeAndroidValue(tagged)!)).toBe(tagged);
  });

  it.each(["Hi <b>you", "a < b", "x </b>", "<b>x</i>", "<1>"])("태그를 시작하지 않거나 짝이 맞지 않는 `<` %j는 인코드할 수 없다(undefined)", (value) => {
    expect(encodeAndroidValue(value)).toBeUndefined();
  });
});

describe("isAndroidLocale — values-{qualifier}의 언어·지역 한정자만", () => {
  it.each(["ko", "en", "fil", "zh-rCN", "pt-rBR", "iw", "in"])("%s → 로케일", (code) => expect(isAndroidLocale(code)).toBe(true));
  it.each(["night", "car", "land", "v21", "en-rGB-v21", "b+sr+Latn", "sw600dp", "pt-BR", "zh-CN", "ko-night", "mcc310", "hdpi", "dark"])("%s → 아니다", (code) =>
    expect(isAndroidLocale(code)).toBe(false));
});

describe("read", () => {
  it("값은 aapt2 의미로 푼 문자열이고 자식 태그·placeholder는 그대로다", () => {
    expect(entriesOf("ko", xml('    <string name="greet">Don\\\'t <b>%1$s</b> &#8230; &lt;i&gt;</string>', '    <string name="pct">100%%</string>'))).toEqual({
      greet: "Don't <b>%1$s</b> … &lt;i>",
      pct: "100%%",
    });
  });

  it("`translatable=\"false\"`는 엔트리가 아니다 — 알리지 않는다. `<plurals>`·`<string-array>`는 unmanaged로 알린다", () => {
    const result = readOne("ko", xml(
      '    <string name="id" translatable="false">com.x</string>',
      '    <plurals name="items"><item quantity="one">%d item</item></plurals>',
      '    <string-array name="days"><item>Mon</item></string-array>',
      '    <string name="ok">OK</string>',
    ));
    expect(result.locales[0]?.entries.map((e) => e.key)).toEqual(["ok"]);
    expect(result.errors.map((e) => [e.code, e.key, adapterErrorKind(e.code)])).toEqual([
      ["value-not-string", "items", "unmanaged"],
      ["value-not-string", "days", "unmanaged"],
    ]);
  });

  it("리소스 참조(`@string/x`)는 번역할 글이 아니다 — unmanaged로 알린다. `\\@`는 글이다", () => {
    const result = readOne("ko", xml('    <string name="alias">@string/app_name</string>', '    <string name="at">\\@home</string>'));
    expect(result.locales[0]?.entries.map((e) => [e.key, e.message])).toEqual([["at", "@home"]]);
    expect(result.errors.map((e) => [e.code, e.key])).toEqual([["value-not-string", "alias"]]);
  });

  it("중복 `name`은 aapt2 빌드 오류다 — duplicate-key(failure)이고 그 키를 적재하지 않는다(orch 결정 8)", () => {
    const result = readOne("ko", xml('    <string name="a">x</string>', '    <string name="a" translatable="false">y</string>', '    <string name="b">z</string>'));
    expect(result.locales[0]?.entries.map((e) => e.key)).toEqual(["b"]);
    expect(result.errors.map((e) => [e.code, e.key, adapterErrorKind(e.code)])).toEqual([["duplicate-key", "a", "failure"]]);
  });

  it('name="__proto__"가 own 키로 남는다', () => {
    const entries = readOne("ko", xml('    <string name="__proto__">P</string>')).locales[0]?.entries ?? [];
    expect(entries).toEqual([{ key: "__proto__", message: "P", order: 0 }]);
  });

  it("엔트리는 키 순으로 정렬하되 파일 위치를 order로 낸다 — 비기준 파일의 삽입 자리 기준이다", () => {
    const entries = readOne("ko", xml('    <string name="z">Z</string>', '    <string name="a">A</string>')).locales[0]?.entries;
    expect(entries).toEqual([{ key: "a", message: "A", order: 1 }, { key: "z", message: "Z", order: 0 }]);
  });

  it("`tools:` 속성·self-closing·`<resources/>`를 받는다", () => {
    expect(entriesOf("ko", xml('    <string name="t" tools:ignore="MissingTranslation">T</string>', '    <string name="e"/>'))).toEqual({ t: "T", e: "" });
    expect(readOne("ko", "<resources/>").locales).toEqual([{ locale: "ko", entries: [] }]);
  });

  it("basePath 파일의 언어는 `templateLocale`이다 — 없으면 그 파일을 읽지 않는다", () => {
    const base = xml('    <string name="a">A</string>');
    const format: DetectedFormat = { adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, templateLocale: "en", locales: ["en"] };
    expect(androidStrings.read(format, [{ path: BASE_PATH, content: base }]).locales).toEqual([{ locale: "en", entries: [{ key: "a", message: "A", order: 0 }] }]);
    const { templateLocale: _, ...unknown } = format;
    expect(androidStrings.read(unknown, [{ path: BASE_PATH, content: base }]).locales).toEqual([]);
  });

  it("`zh-rCN` 디렉터리의 코드는 그대로다", () => {
    const content = xml('    <string name="a">A</string>');
    expect(androidStrings.read(formatWith("zh-rCN", content), [{ path: pathOf("zh-rCN"), content }]).locales.map((l) => l.locale)).toEqual(["zh-rCN"]);
  });

  it("문법 오류는 parse-failed이고 그 로케일을 내지 않는다", () => {
    const result = readOne("ko", "<resources><string name=\"a\">x</resources>");
    expect(result.locales).toEqual([]);
    expect(result.errors.map((e) => e.code)).toEqual(["parse-failed"]);
  });
});

describe("write — 수술적 치환", () => {
  const SOURCE = xml(
    "    <!-- Home -->",
    '    <string name="app_id" translatable="false">com.example</string>',
    '    <string name="title">Home</string>',
    "",
    '    <plurals name="items">',
    '        <item quantity="one">%d item</item>',
    "    </plurals>",
    '    <string name="greet" formatted="false">Hi <b>%1$s</b></string>',
    '    <string name="quoted">"  spaced  "</string>',
    '    <string name="odd">it\'s</string>',
    '    <string name="cdata"><![CDATA[<i>raw</i>]]></string>',
    '    <string name="empty"/>',
  );

  it("값 범위만 바꾸고 주석·빈 줄·translatable=false·plurals는 그대로다", () => {
    const out = writeOne("ko", SOURCE, [{ key: "title", message: "홈" }]);
    expect(out).toEqual({ content: SOURCE.replace(">Home<", ">홈<"), errors: [] });
  });

  it("값이 같으면 원본 바이트 그대로다 — 비정규 원본(이스케이프 안 된 `'`)도", () => {
    const same = ["title", "greet", "quoted", "odd", "cdata"].map((key) => ({ key, message: entriesOf("ko", SOURCE)[key]! }));
    expect(writeOne("ko", SOURCE, same).content).toBe(SOURCE);
  });

  it("비정규 원본은 그 셀이 바뀔 때만 정규형으로 다시 쓴다", () => {
    expect(writeOne("ko", SOURCE, [{ key: "odd", message: "it's ok" }]).content).toBe(SOURCE.replace(">it's<", ">it\\'s ok<"));
  });

  it("형을 지킨다 — 따옴표 감싼 값·CDATA·자식 태그", () => {
    const out = writeOne("ko", SOURCE, [
      { key: "quoted", message: "가" },
      { key: "cdata", message: "&lt;i>날것&lt;/i>" },
      { key: "greet", message: "안녕 <b>%1$s</b>" },
    ]).content!;
    expect(out).toContain('<string name="quoted">"가"</string>');
    expect(out).toContain('<string name="cdata"><![CDATA[<i>날것</i>]]></string>');
    expect(out).toContain('<string name="greet" formatted="false">안녕 <b>%1$s</b></string>');
  });

  it("self-closing 슬롯에 값을 넣는다", () => {
    expect(writeOne("ko", SOURCE, [{ key: "empty", message: "값" }]).content).toBe(SOURCE.replace('<string name="empty"/>', '<string name="empty">값</string>'));
  });

  it("빈 값은 치환하지 않는다 — 원본이 남고 저장은 cannot-clear다(불변식 3)", () => {
    expect(writeOne("ko", SOURCE, [{ key: "title", message: "" }]).content).toBe(SOURCE);
    expect(planClearability({ writeStrategy: androidStrings.writeStrategy, isBase: false, value: "", sourceText: "Home" })).toBe("cannot-clear");
  });

  it("orphaned 키는 원본 값이 남는다", () => {
    expect(writeOne("ko", SOURCE, [{ key: "title", message: "X", orphaned: true }]).content).toBe(SOURCE);
  });

  it("중복 키(aapt2 오류)는 어느 사본도 고치지 않는다", () => {
    const dup = xml('    <string name="a">x</string>', '    <string name="a">y</string>');
    expect(writeOne("ko", dup, [{ key: "a", message: "z" }]).content).toBe(dup);
  });

  it("인코드할 수 없는 값(`<`가 태그를 시작하지 않는다)은 그 파일의 명시 실패다 — 원본 그대로 + write-parse-failed(결정 14)", () => {
    expect(writeOne("ko", SOURCE, [{ key: "title", message: "a < b" }, { key: "quoted", message: "가" }])).toMatchObject({
      content: SOURCE, errors: [{ code: "write-parse-failed", key: "title" }],
    });
  });

  it("문법 오류 원본은 그대로 두고 write-parse-failed를 알린다", () => {
    const broken = "<resources><string name=\"a\">x</resources>";
    expect(writeOne("ko", broken, [{ key: "a", message: "y" }])).toMatchObject({ content: broken, errors: [{ code: "write-parse-failed" }] });
  });

  it("CRLF·BOM 원본은 그대로이고 삽입 줄도 CRLF다", () => {
    const text = `${BOM}<?xml version="1.0" encoding="utf-8"?>\r\n<resources>\r\n    <string name="a">A</string>\r\n</resources>\r\n`;
    const out = writeOne("ko", text, [{ key: "a", message: "가", order: 0 }, { key: "b", message: "나", order: 1 }]).content;
    expect(out).toBe(`${BOM}<?xml version="1.0" encoding="utf-8"?>\r\n<resources>\r\n    <string name="a">가</string>\r\n    <string name="b">나</string>\r\n</resources>\r\n`);
  });
});

describe("write — 비기준 파일의 누락 키 삽입 (design §2.1)", () => {
  const KO = xml('    <string name="a">가</string>', "", '    <string name="c">다</string> <!-- note -->');

  it("기준 순서상 바로 앞 키 뒤에 이웃 들여쓰기로 넣는다", () => {
    const out = writeOne("ko", KO, [{ key: "a", message: "가", order: 0 }, { key: "b", message: "나", order: 1 }, { key: "c", message: "다", order: 2 }, { key: "d", message: "라", order: 3 }]).content;
    expect(out).toBe(xml('    <string name="a">가</string>', '    <string name="b">나</string>', "", '    <string name="c">다</string> <!-- note -->', '    <string name="d">라</string>'));
  });

  it("앞 키가 파일에 없으면 `</resources>` 앞이다 — 이 로케일만 값이 없는 키(untranslated)도 앞 키가 된다", () => {
    const out = writeOne("ko", KO, [{ key: "z", message: "처음", order: 0 }]).content;
    expect(out).toBe(xml('    <string name="a">가</string>', "", '    <string name="c">다</string> <!-- note -->', '    <string name="z">처음</string>'));
    const after = writeOne("ko", KO, [{ key: "b", message: "나", order: 2 }], { untranslated: [{ key: "a", order: 1 }] }).content;
    expect(after).toBe(xml('    <string name="a">가</string>', '    <string name="b">나</string>', "", '    <string name="c">다</string> <!-- note -->'));
  });

  it("이름은 XML 속성으로 이스케이프하고 값은 정규형이다", () => {
    const out = writeOne("ko", KO, [{ key: 'q"&<', message: "it's <b>x</b>", order: 9 }]).content!;
    expect(out).toContain('    <string name="q&quot;&amp;&lt;">it\\\'s <b>x</b></string>\n</resources>');
    expect(entriesOf("ko", out)['q"&<']).toBe("it's <b>x</b>");
  });

  it("퇴화 원본(`<resources/>`)에도 넣고, 그 출력이 다음 write의 고정점이다", () => {
    const first = writeOne("ko", "<resources/>\n", [{ key: "a", message: "가", order: 0 }]).content!;
    expect(first).toBe('<resources>\n    <string name="a">가</string>\n</resources>\n');
    expect(writeOne("ko", first, [{ key: "a", message: "가", order: 0 }]).content).toBe(first);
  });

  it("닫는 태그가 마지막 요소와 같은 줄이어도 앞 키 뒤 줄이 먼저, 앞 키 없는 줄이 `</resources>` 바로 앞이다 — 같은 offset을 두 번 쓰지 않는다", () => {
    const one = '<resources>\n    <string name="a">가</string></resources>\n';
    const entries = [{ key: "z", message: "끝", order: 0 }, { key: "a", message: "가", order: 1 }, { key: "b", message: "나", order: 2 }];
    const out = writeOne("ko", one, entries).content;
    expect(out).toBe('<resources>\n    <string name="a">가</string>\n    <string name="b">나</string>\n    <string name="z">끝</string>\n</resources>\n');
    // 입력 순서와 무관하다.
    expect(writeOne("ko", one, [...entries].reverse()).content).toBe(out);
  });

  it("basePath 파일(기준 언어)에는 삽입하지 않는다", () => {
    const base = xml('    <string name="a">A</string>');
    const format: DetectedFormat = { adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, templateLocale: "en", locales: ["en"], currentFiles: [{ path: BASE_PATH, content: base }] };
    const out = androidStrings.writeWithErrors!(format, { locale: "en", entries: [{ key: "a", message: "A2", order: 0 }, { key: "new", message: "N", order: 1 }] });
    expect(out).toEqual({ content: base.replace(">A<", ">A2<"), errors: [] });
  });

  it("다른 언어 원본을 앞에 실어도 자기 경로의 파일만 고친다", () => {
    const format = { ...formatWith("ko", KO), currentFiles: [{ path: pathOf("ja"), content: xml('    <string name="a">あ</string>') }, { path: pathOf("ko"), content: KO }] };
    expect(androidStrings.write(format, { locale: "ko", entries: [{ key: "a", message: "가2" }] })).toBe(KO.replace("가", "가2"));
  });
});

describe("create — 뼈대만 (design §2)", () => {
  const BASE = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<!-- Copyright -->",
    '<resources xmlns:tools="http://schemas.android.com/tools" xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2" tools:ignore="MissingTranslation">',
    "  <!-- section -->",
    '  <string name="app_id" translatable="false">com.x</string>',
    '  <string name="greet">Hi <xliff:g id="n">%1$s</xliff:g></string>',
    '  <string name="html"><![CDATA[<b>x</b>]]></string>',
    '  <plurals name="p"><item quantity="one">x</item></plurals>',
    '  <string name="bye">Bye</string>',
    "</resources>",
    "",
  ].join("\n");
  const create = (entries: LocaleEntry[], source = BASE) =>
    androidStrings.create!({ adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, templateLocale: "en", locales: ["en", "fr"], representationSource: source }, { locale: "fr", baseLocale: "en", entries });

  it("XML 선언·루트와 네임스페이스 속성·값 있는 키만 — 주석·translatable=false·plurals·기준 값은 싣지 않는다", () => {
    const out = create([{ key: "bye", message: "Salut", order: 2 }, { key: "greet", message: 'Bonjour <xliff:g id="n">%1$s</xliff:g>', order: 0 }, { key: "html", message: "", order: 1 }]);
    expect(out).toEqual({
      content: [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<resources xmlns:tools="http://schemas.android.com/tools" xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">',
        '  <string name="greet">Bonjour <xliff:g id="n">%1$s</xliff:g></string>',
        '  <string name="bye">Salut</string>',
        "</resources>",
        "",
      ].join("\n"),
      errors: [],
    });
  });

  it("기준 파일의 CDATA 형을 따른다", () => {
    expect(create([{ key: "html", message: "&lt;b>y&lt;/b>", order: 0 }]).content).toContain('<string name="html"><![CDATA[<b>y</b>]]></string>');
  });

  it("값 있는 키가 없으면 파일을 만들지 않고, 기준 파일이 없으면 blocking 오류다", () => {
    expect(create([{ key: "bye", message: "" }])).toEqual({ content: null, errors: [] });
    expect(androidStrings.create!({ adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, locales: ["fr"] }, { locale: "fr", baseLocale: "en", entries: [{ key: "a", message: "A" }] }))
      .toMatchObject({ content: null, errors: [{ code: "write-create-unsupported" }] });
  });

  it("만든 파일에 다른 키를 번역하면 write가 삽입한다 — 두 번째 Publish의 입력", () => {
    const created = create([{ key: "bye", message: "Salut", order: 2 }]).content!;
    const next = androidStrings.writeWithErrors!({ ...formatWith("fr", created) }, { locale: "fr", entries: [{ key: "greet", message: "Bonjour", order: 0 }, { key: "bye", message: "Salut", order: 2 }] });
    expect(next.errors).toEqual([]);
    // greet는 기준 순서상 앞 키가 파일에 없다 — `</resources>` 앞이다(design §2.1).
    expect(next.content).toContain('  <string name="bye">Salut</string>\n  <string name="greet">Bonjour</string>\n</resources>');
  });
});

describe("탐지 (design §2.2·§5) — 진입점 detectCandidatesAcross", () => {
  const xmlProbe = (paths: readonly string[]) => (path: string) => (paths.includes(path) ? '<resources><string name="a">A</string></resources>' : undefined);
  const detect = (paths: string[]) => detectCandidatesAcross(paths, xmlProbe(paths));

  it("`values/`가 basePath이고 디렉터리 이름 그대로가 코드다 — 지역 외 한정자·b+ 형식은 뺀다", () => {
    const paths = [
      "app/src/main/res/values/strings.xml",
      "app/src/main/res/values-ko/strings.xml",
      "app/src/main/res/values-zh-rCN/strings.xml",
      "app/src/main/res/values-b+sr+Latn/strings.xml",
      "app/src/main/res/values-night/strings.xml",
      "app/src/main/res/values-car/strings.xml",
      "app/src/main/res/values-en-rGB-v21/strings.xml",
      "app/src/main/res/values-sw600dp/strings.xml",
      "app/src/main/res/values-ko/colors.xml",
    ];
    expect(detect(paths)).toEqual([{ adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, locales: ["ko", "zh-rCN"] }]);
  });

  it("단일 언어(`values/`만)도 후보다 — 언어 목록이 비어 있다", () => {
    expect(detect(["app/src/main/res/values/strings.xml"])).toEqual([{ adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, locales: [] }]);
  });

  it("`values/`가 없는 디렉터리는 후보가 아니다 — 리소스 기본값이 없는 변형 오버레이다", () => {
    expect(detect(["app/src/debug/res/values-de/strings.xml"])).toEqual([]);
  });

  it("내용이 `<resources>`가 아니면 떨어진다", () => {
    const paths = ["app/src/main/res/values/strings.xml", "app/src/main/res/values-ko/strings.xml"];
    expect(detectCandidatesAcross(paths, () => "<manifest/>")).toEqual([]);
  });

  it("flavor·테스트 소스셋보다 main이 앞이다 — 로케일 수가 같아도(NFCReader의 app/src/debug)", () => {
    const paths = ["main", "debug", "androidTest"].flatMap((set) => ["values", "values-de", "values-ko"].map((v) => `app/src/${set}/res/${v}/strings.xml`));
    expect(detect(paths).map((c) => c.pathTemplate)).toEqual([
      "app/src/main/res/values-{locale}/strings.xml",
      "app/src/debug/res/values-{locale}/strings.xml",
      "app/src/androidTest/res/values-{locale}/strings.xml",
    ]);
  });

  it("다른 신호가 같으면 경로를 세그먼트로 견준다 — `dokit/`이 `dokit-autotest/`보다 앞이다(DoKit — 문자 순이면 `-`가 `/`보다 앞이다)", () => {
    const paths = ["dokit-autotest", "dokit", "dokit-mc"].flatMap((m) => ["values", "values-zh-rCN"].map((v) => `Android/${m}/src/main/res/${v}/strings.xml`));
    expect(detect(paths).map((c) => c.pathTemplate)).toEqual([
      "Android/dokit/src/main/res/values-{locale}/strings.xml",
      "Android/dokit-autotest/src/main/res/values-{locale}/strings.xml",
      "Android/dokit-mc/src/main/res/values-{locale}/strings.xml",
    ]);
  });

  it("Compose Multiplatform `composeResources/`와 `src/main` 없는 `<모듈>/res`도 후보다", () => {
    const paths = [
      "core/resources/src/commonMain/composeResources/values/strings.xml",
      "core/resources/src/commonMain/composeResources/values-de/strings.xml",
      "paymentsheet/res/values/strings.xml",
      "paymentsheet/res/values-de/strings.xml",
    ];
    expect(detect(paths).map((c) => [c.pathTemplate, c.basePath])).toEqual([
      ["paymentsheet/res/values-{locale}/strings.xml", "paymentsheet/res/values/strings.xml"],
      ["core/resources/src/commonMain/composeResources/values-{locale}/strings.xml", "core/resources/src/commonMain/composeResources/values/strings.xml"],
    ]);
  });

  it("`build/` 산출물은 후보가 아니다", () => {
    expect(detect(["app/build/intermediates/res/values/strings.xml", "app/build/intermediates/res/values-ko/strings.xml"])).toEqual([]);
  });

  it("어댑터 간 순위는 기준 언어 파일을 한 언어로 센다 — 다른 포맷과 로케일 수가 같으면 그 규칙(깊이·경로)이 정한다", () => {
    const paths = ["app/src/main/res/values/strings.xml", "app/src/main/res/values-ko/strings.xml", "web/text/en.json", "web/text/ko.json", "web/text/ja.json"];
    const probe = (p: string) => (p.endsWith(".xml") ? '<resources><string name="a">A</string></resources>' : '{"a":"A"}');
    expect(detectCandidatesAcross(paths, probe).map((c) => c.adapter)).toEqual(["json-catalog", "android-strings"]);
    const four = [...paths, "app/src/main/res/values-ja/strings.xml", "app/src/main/res/values-de/strings.xml"];
    expect(detectCandidatesAcross(four, probe).map((c) => c.adapter)).toEqual(["android-strings", "json-catalog"]);
  });

  it("Flutter 앱의 Android 셸(`android/` + 루트 pubspec.yaml)은 맨 뒤다 — ARB 정답을 빼앗지 않는다(orch 결정 7)", () => {
    const paths = ["pubspec.yaml", "lib/l10n/app_en.arb", "android/app/src/main/res/values/strings.xml", "android/app/src/main/res/values-ko/strings.xml", "android/app/src/main/res/values-ja/strings.xml"];
    const probe = (p: string) => (p.endsWith(".xml") ? '<resources><string name="app_name">x</string></resources>' : '{"a":"A"}');
    expect(detectCandidatesAcross(paths, probe).map((c) => c.adapter)).toEqual(["arb-catalog", "android-strings"]);
    // 대조: pubspec이 없으면 강등하지 않는다.
    expect(detectCandidatesAcross(paths.slice(1), probe).map((c) => c.adapter)).toEqual(["android-strings", "arb-catalog"]);
  });
});
