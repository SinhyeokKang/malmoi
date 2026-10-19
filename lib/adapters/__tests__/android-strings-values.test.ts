import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { androidStrings, androidValueTags, decodeAndroidValue, dialectOf, encodeAndroidValue, tokenizeAndroid } from "../android-strings";
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
/** 값 → 플랫폼이 보이는 글(태그를 걷고 `&lt;`·`&amp;`를 푼다). 한 번에 훑는다 — 태그를 먼저 걷으면 `&<b></b>lt;`가 `<`로 읽힌다. */
const textOf = (value: string) => value.replace(/<[^>]*>|&(lt|amp);/g, (_, e: string | undefined) => (e === undefined ? "" : e === "lt" ? "<" : "&"));
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
    ["<b\u00a0>x</b>", "이름 뒤 NBSP(XML S 밖 — 리뷰 R2-3)"],
    ['<b\u00a0a="x">x</b>', "속성 앞 NBSP"],
    ['<b a\u00a0=\u00a0"x">x</b>', "등호 주위 NBSP"],
    ["<b\u2028>x</b>", "이름 뒤 줄 구분자"],
    ['<b a="x"\u3000/>', "self-closing 앞 전각 공백"],
  ])("%j → 쓸 수 없다 (%s)", (value) => {
    expect(androidValueTags(value)).toBeUndefined();
    expect(encodeAndroidValue(value)).toBeUndefined();
  });

  const TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
  const KO = '<resources>\n    <string name="a">가</string>\n</resources>\n';
  const format: DetectedFormat = { adapter: "android-strings", pathTemplate: TEMPLATE, locales: ["ko"], currentFiles: [{ path: "app/src/main/res/values-ko/strings.xml", content: KO }] };

  it.each([
    ['<b a="x">x</b>', ['<b a="x">', "</b>"]],
    ['<b \t\r\n a \t= \n"x"\n>x</b \t>', ['<b \t\r\n a \t= \n"x"\n>', "</b \t>"]],
    ['<br\n/>', ["<br\n/>"]],
  ])("XML 공백(스페이스·탭·CR·LF)은 태그 안 어디서나 받는다 — %j", (value, tags) => {
    expect(androidValueTags(value)).toEqual(tags);
    const raw = encodeAndroidValue(value);
    expect(raw !== undefined && tokenizeAndroid(`<resources><string name="v">${raw}</string></resources>`).ok).toBe(true);
  });

  it.each(['<b a="&">x</b>', '<b a="x" a="y">x</b>', '<b>x</b a="y">', "<b\u00a0>x</b>", '<b a\u00a0=\u00a0"x">x</b>'])("write: %j는 그 파일의 write-parse-failed(키 포함)이고 원본 그대로다", (bad) => {
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

describe("R2-1 — 값 의미는 `values-*/strings.xml` 바로 앞 리소스 디렉터리가 정한다", () => {
  // 조상 어딘가의 이름이 아니라 마지막 리소스 디렉터리다 — 두 중첩 방향을 다 본다.
  const RES = { template: "composeResources/app/src/main/res/values-{locale}/strings.xml", ko: "composeResources/app/src/main/res/values-ko/strings.xml", base: "composeResources/app/src/main/res/values/strings.xml" };
  const COMPOSE = { template: "res/shared/composeResources/values-{locale}/strings.xml", ko: "res/shared/composeResources/values-ko/strings.xml", base: "res/shared/composeResources/values/strings.xml" };
  const QUOTED = '<resources>\n    <string name="a">"  x  "</string>\n</resources>\n';
  const format = (dir: typeof RES, content: string): DetectedFormat => ({ adapter: "android-strings", pathTemplate: dir.template, locales: ["ko"], currentFiles: [{ path: dir.ko, content }] });

  it("dialectOf", () => {
    expect(dialectOf(RES.template)).toBe("aapt2");
    expect(dialectOf(COMPOSE.template)).toBe("compose");
    expect(dialectOf("app/src/main/res/values-{locale}/strings.xml")).toBe("aapt2");
    expect(dialectOf("shared/src/commonMain/composeResources/values-{locale}/strings.xml")).toBe("compose");
    expect(dialectOf("composeResources/values-{locale}/strings.xml")).toBe("compose");
    expect(dialectOf("res/values-{locale}/strings.xml")).toBe("aapt2");
  });

  it("read: `…/composeResources/…/res/`는 aapt2 — 따옴표는 구간이고, `…/res/…/composeResources/`는 Compose — 따옴표는 글자다", () => {
    const read = (dir: typeof RES) => androidStrings.read(format(dir, QUOTED), [{ path: dir.ko, content: QUOTED }]).locales[0]?.entries.map((e) => e.message);
    expect(read(RES)).toEqual(["  x  "]);
    expect(read(COMPOSE)).toEqual(['"  x  "']);
  });

  it("write: 같은 값을 방언마다 다르게 쓴다", () => {
    const KO = '<resources>\n    <string name="a">가</string>\n</resources>\n';
    const write = (dir: typeof RES) => androidStrings.write(format(dir, KO), { locale: "ko", entries: [{ key: "a", message: "  it's  " }] });
    expect(write(RES)).toBe('<resources>\n    <string name="a">"  it\\\'s  "</string>\n</resources>\n');
    expect(write(COMPOSE)).toBe('<resources>\n    <string name="a">  it\'s  </string>\n</resources>\n');
  });

  it("create: 같은 값을 방언마다 다르게 쓴다", () => {
    const BASE = '<resources>\n    <string name="a">A</string>\n</resources>\n';
    const create = (dir: typeof RES) => androidStrings.create!({ adapter: "android-strings", pathTemplate: dir.template, locales: [], representationSource: BASE }, { locale: "ko", baseLocale: "en", entries: [{ key: "a", message: "  it's  " }] }).content;
    expect(create(RES)).toBe('<resources>\n    <string name="a">"  it\\\'s  "</string>\n</resources>\n');
    expect(create(COMPOSE)).toBe('<resources>\n    <string name="a">  it\'s  </string>\n</resources>\n');
  });

  it("탐지: 두 방향 모두 후보이고 템플릿이 그 리소스 디렉터리를 가리킨다", () => {
    for (const dir of [RES, COMPOSE]) {
      const found = androidStrings.detectCandidates!([dir.base, dir.ko], (path) => (path === dir.base ? QUOTED : undefined));
      expect(found.map((f) => [f.pathTemplate, f.basePath])).toEqual([[dir.template, dir.base]]);
    }
  });
});

/**
 * 리뷰 R2-2 — 태그가 섞인 값의 왕복. 생성한 값마다 **플랫폼이 보이는 글**(aapt2: 본문·스팬 / Compose: 아래 `composeDisplay` — 채록한 변환기의 정의를
 * 그대로 옮긴 독립 구현)과 **태그 보존**(`decode(encode(v)) === v`)을 따로 단언한다.
 */
describe("R2-2 — 태그가 섞인 값의 왕복 (두 방언)", () => {
  /** Compose 변환기: DOM `textContent`(태그를 걷고 엔티티·CDATA를 푼 글) → `handleSpecialCharacters`. */
  function composeDisplay(raw: string): string {
    const text = raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<[^>]*>|&(lt|gt|amp|quot|apos);/g, (_, cdata: string | undefined, e: string | undefined) =>
        cdata ?? (e === undefined ? "" : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[e]!));
    const doubles = new Set([...text.matchAll(/\\\\/g)].map((m) => m.index));
    return text
      .replace(/\\u[a-fA-F0-9]{4}|\\n|\\t/g, (m: string, at: number) => (doubles.has(at - 1) ? m : m === "\\n" ? "\n" : m === "\\t" ? "\t" : String.fromCharCode(parseInt(m.slice(2), 16))))
      .replace(/\\\\/g, "\\");
  }

  it.each([
    "\\<b>n</b>",
    "\\<b>u0041</b>",
    "\\<b>t</b>",
    "<b>\\</b>n",
    "\\<b>\\</b>n",
    "a\\\\<i>n</i>\\<b>u00e9</b>",
    '\\<a href="x">n</a> <br/>\\n',
  ])("Compose %j — 표시 글과 태그 위치가 그대로다", (value) => {
    const raw = encodeAndroidValue(value, {}, "compose")!;
    expect(composeDisplay(raw)).toBe(textOf(value));
    expect(decodeAndroidValue(raw, "compose")).toBe(value);
  });

  const TEXT = [" ", "  ", "\n", "\t", '"', "'", "\\", "\\\\", "n", "t", "u", "0041", "@", "&", "<", ">", "a", "é", "😀", "lt;", "amp;"];
  const OPEN = [["<b>", "</b>"], ["<i>", "</i>"], ['<a href="x&amp;y">', "</a>"], ['<xliff:g id="n">', "</xliff:g>"]] as const;
  /** 무작위 값 — 글 조각 사이에 짝 맞는 태그·`<br/>`를 끼운다. */
  function values(seed: number, n: number): string[] {
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    const out: string[] = [];
    for (let k = 0; k < n; k += 1) {
      // 태그 사이 글은 이어 붙인 뒤 값 문법으로 옮긴다 — 조각마다 옮기면 `&` + `amp;`가 정규형이 아닌 값이 된다.
      let value = "";
      let text = "";
      const tag = (raw: string) => {
        value += dbOf(text) + raw;
        text = "";
      };
      const open: string[] = [];
      for (let i = next() % 10; i > 0; i -= 1) {
        const r = next() % 10;
        if (r < 6) text += TEXT[next() % TEXT.length]!;
        else if (r < 8) {
          const [o, c] = OPEN[next() % OPEN.length]!;
          tag(o);
          open.push(c);
        } else if (r < 9 && open.length > 0) tag(open.pop()!);
        else tag("<br/>");
      }
      tag(open.reverse().join(""));
      out.push(value);
    }
    return out;
  }

  it("Compose: 생성 값 2,000건 — 표시 글(변환기 정의) · 태그 보존", () => {
    const all = values(23, 2000);
    expect(all.filter((v) => v.includes("<")).length).toBeGreaterThan(1000);
    for (const value of all) {
      const raw = encodeAndroidValue(value, {}, "compose");
      expect(raw === undefined ? undefined : composeDisplay(raw), JSON.stringify(value)).toBe(textOf(value));
      expect(raw === undefined ? undefined : decodeAndroidValue(raw, "compose"), `${JSON.stringify(value)} → ${JSON.stringify(raw)}`).toBe(value);
    }
  });

  it("aapt2: 생성 값 2,000건 — 본문·스팬 · 태그 보존", () => {
    for (const value of values(29, 2000)) {
      const raw = encodeAndroidValue(value);
      const decoded = raw === undefined ? undefined : decodeAndroidValue(raw);
      expect(decoded === undefined ? undefined : [textOf(decoded), spansOf(decoded)], JSON.stringify(value)).toEqual([textOf(value), spansOf(value)]);
      expect(decoded, `${JSON.stringify(value)} → ${JSON.stringify(raw)}`).toBe(value);
    }
  });
});
