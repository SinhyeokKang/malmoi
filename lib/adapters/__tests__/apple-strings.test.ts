import { describe, expect, it } from "vitest";

import { appleStrings, decodeStringsLiteral, encodeStringsLiteral, tokenizeStrings } from "../apple-strings";
import { detectCandidatesAcross } from "../index";
import { adapterErrorKind, type DetectedFormat, type LocaleEntry } from "../types";
import { planClearability } from "@/lib/keys/save";

/**
 * Apple `.strings` (apple-strings design §2.1·§3·§4·§5).
 *
 * 수술적 치환이다 — 값 리터럴의 범위만 바꾸고 주석·빈 줄·키 순서·비정규 이스케이프는 원본 바이트 그대로다. 비-base 파일의 누락 키만 삽입한다.
 */

const TEMPLATE = "App/{locale}.lproj/Localizable.strings";
/** UTF-8 BOM이 디코드된 첫 글자 — 소스에 보이지 않는 글자를 두지 않는다. */
const BOM = String.fromCharCode(0xfeff);
const pathOf = (locale: string) => TEMPLATE.replace("{locale}", locale);
const formatWith = (locale: string, content: string, locales = [locale]): DetectedFormat => ({
  adapter: "apple-strings", pathTemplate: TEMPLATE, locales, currentFiles: [{ path: pathOf(locale), content }],
});
const readOne = (locale: string, content: string) => appleStrings.read(formatWith(locale, content), [{ path: pathOf(locale), content }]);
const entriesOf = (locale: string, content: string) => Object.fromEntries((readOne(locale, content).locales[0]?.entries ?? []).map((e) => [e.key, e.message]));
const writeOne = (locale: string, content: string, entries: LocaleEntry[], extra: Partial<Parameters<typeof appleStrings.write>[1]> = {}) =>
  appleStrings.writeWithErrors!(formatWith(locale, content), { locale, entries, ...extra });

describe("tokenizeStrings — 엔트리와 값 리터럴의 범위", () => {
  it("값 범위가 따옴표를 포함한 리터럴 그대로다", () => {
    const text = '/* c */\n"greeting" = "Hello";\nplain = "x";\n';
    const result = tokenizeStrings(text);
    if (!result.ok) throw new Error(result.detail);
    expect(result.entries.map((e) => [e.key, text.slice(e.value!.start, e.value!.end)])).toEqual([["greeting", '"Hello"'], ["plain", '"x"']]);
    // 엔트리 끝은 `;` 다음이다.
    expect(text.slice(result.entries[0]!.start, result.entries[0]!.end)).toBe('"greeting" = "Hello";');
  });

  it("주석 안의 엔트리 모양과 `//` 뒤의 `=`는 엔트리가 아니다", () => {
    const text = '/* "a" = "b"; */\n// "c" = "d";\n"k" = "v=w"; // x = y;\n/* multi\n "e" = "f";\n*/\n';
    const result = tokenizeStrings(text);
    if (!result.ok) throw new Error(result.detail);
    expect(result.entries.map((e) => e.key)).toEqual(["k"]);
  });

  it("토큰 사이의 주석·공백을 받는다", () => {
    const result = tokenizeStrings('"a" /* x */ = /* y */ "b" /* z */ ;');
    expect(result.ok && result.entries.map((e) => e.key)).toEqual(["a"]);
  });

  it.each([
    ['"a" = "b"', "세미콜론 없음"],
    ['"a" = "b', "닫히지 않은 문자열"],
    ['"a" "b";', "= 없음"],
    ['/* open', "닫히지 않은 주석"],
    ['{ "a" = "b"; }', "중괄호 딕셔너리"],
  ])("%s → 실패 (%s)", (text) => {
    expect(tokenizeStrings(text).ok).toBe(false);
  });
});

describe("리터럴 이스케이프", () => {
  it("이스케이프를 푼다 — \\\" \\\\ \\n \\t \\r \\U", () => {
    expect(decodeStringsLiteral('"a\\"b\\\\c\\nd\\te\\rf\\U00e9\\UD83D\\UDE00"')).toBe('a"b\\c\nd\te\rfé😀');
  });

  it("decode(encode(v)) === v — 제어문자·따옴표·역슬래시·이모지·BOM 문자", () => {
    const samples = ["", "plain", 'q"uote', "back\\slash", "line\nbreak", "tab\there", "cr\rx", "\u0001\u001f", "😀 é 한글", BOM + "x", "%@ %1$s %%", "'single'"];
    for (const v of samples) {
      expect(decodeStringsLiteral(encodeStringsLiteral(v)), JSON.stringify(v)).toBe(v);
      expect(decodeStringsLiteral(encodeStringsLiteral(v, "'")), JSON.stringify(v)).toBe(v);
    }
    // 무작위 코드 유닛 — 짝 없는 서로게이트는 파일 인코딩 층이 거부하므로 BMP 비서로게이트만 뽑는다.
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647);
    for (let n = 0; n < 300; n += 1) {
      const v = Array.from({ length: next() % 12 }, () => {
        const c = next() % 0xd800;
        return String.fromCharCode(c);
      }).join("");
      expect(decodeStringsLiteral(encodeStringsLiteral(v))).toBe(v);
    }
  });

  it("encode(decode(정규형 리터럴)) === 원본 리터럴", () => {
    for (const literal of ['"Hello"', '"a\\"b"', '"x\\\\y"', '"line\\nnext"', '"tab\\t"', '"%@ items"', '"é😀"']) {
      expect(encodeStringsLiteral(decodeStringsLiteral(literal)!)).toBe(literal);
    }
  });
});

/**
 * **Apple 파서와 같은 의미** (리뷰 R1). 기대값은 이 머신의 `/usr/bin/plutil -convert json -o - -- -`(stdin)에서 2026-10-19에 채록했다 —
 * `"k" = <리터럴>;`의 값과 `<리터럴> = "v";`의 키가 같았다. 자체 encode/decode 상호 비교만으로는 플랫폼과 다른 해석을 못 찾는다.
 * 리터럴의 `~`는 역슬래시다(소스에 역슬래시-u 열을 그대로 두지 않으려고 — 편집 도구가 그것을 풀어 버린다).
 */
describe("리터럴 이스케이프 — plutil 채록 픽스처", () => {
  const L = (body: string, quote = '"') => quote + body.replaceAll("~", "\\") + quote;
  const ch = (...codes: number[]) => String.fromCharCode(...codes);
  const PLUTIL: [string, string][] = [
    ["~u0041", "u0041"], ["~u", "u"], ["~U0041", "A"], ["~U41", "A"], ["~U004", ch(4)], ["~U00411", "A1"], ["~U00e9", "é"], ["~UFFFF", ch(0xffff)],
    ["~U", ch(0)], ["~UZZ", `${ch(0)}ZZ`], ["~Ug", `${ch(0)}g`], ["~U0000", ch(0)], ["~UD83D~UDE00", "😀"],
    ["~101", "A"], ["~12", "\n"], ["~1234", "S4"], ["~0", ch(0)], ["~0000", `${ch(0)}0`], ["~08", `${ch(0)}8`], ["~8", "8"], ["~177", ch(0x7f)],
    // 하위 8비트가 0x80–0xFD면 NeXTSTEP 인코딩 표, 0xFE·0xFF·0x00이면 NUL이다(아래 0o000–0o777 전수 표).
    ["~200", ch(0xa0)], ["~201", ch(0xc0)], ["~241", ch(0xa1)], ["~244", ch(0x2044)], ["~256", ch(0xfb01)], ["~300", ch(0xb9)], ["~350", ch(0x141)],
    ["~375", ch(0xff)], ["~376", ch(0)], ["~377", ch(0)], ["~400", ch(0)], ["~777", ch(0)],
    ["~x", "x"], ["~N", "N"], ["~a~b~f~v~n~t~r", ch(7, 8, 12, 11, 10, 9, 13)], ['~"', '"'], ["~~", "\\"], ["~\nx", "\nx"],
  ];

  it.each(PLUTIL)("값 %j", (body, expected) => {
    expect(decodeStringsLiteral(L(body))).toBe(expected);
    expect(entriesOf("en", `"k" = ${L(body)};\n`)).toEqual({ k: expected });
  });

  it.each(PLUTIL)("키 %j", (body, expected) => {
    expect(readOne("en", `${L(body)} = "v";\n`).locales[0]?.entries.map((e) => e.key)).toEqual([expected]);
  });

  /**
   * 리뷰 R2-1 — 8진 0o000–0o777(세 자리) 전부를 plutil에서 키·값으로 채록한 코드 포인트다(2026-10-19, 둘이 같았다). Apple은 8진 정수를 **하위 8비트**로
   * 줄인 뒤 ASCII/NeXTSTEP으로 읽는다 — `~501` → `A`(`~`는 역슬래시). 0o400 이상을 통째로 NUL로 보면 253개 × 키·값이 달랐다.
   */
  const PLUTIL_OCTAL: readonly number[] = [
    0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007, 0x0008, 0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x000e, 0x000f,
    0x0010, 0x0011, 0x0012, 0x0013, 0x0014, 0x0015, 0x0016, 0x0017, 0x0018, 0x0019, 0x001a, 0x001b, 0x001c, 0x001d, 0x001e, 0x001f,
    0x0020, 0x0021, 0x0022, 0x0023, 0x0024, 0x0025, 0x0026, 0x0027, 0x0028, 0x0029, 0x002a, 0x002b, 0x002c, 0x002d, 0x002e, 0x002f,
    0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037, 0x0038, 0x0039, 0x003a, 0x003b, 0x003c, 0x003d, 0x003e, 0x003f,
    0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047, 0x0048, 0x0049, 0x004a, 0x004b, 0x004c, 0x004d, 0x004e, 0x004f,
    0x0050, 0x0051, 0x0052, 0x0053, 0x0054, 0x0055, 0x0056, 0x0057, 0x0058, 0x0059, 0x005a, 0x005b, 0x005c, 0x005d, 0x005e, 0x005f,
    0x0060, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067, 0x0068, 0x0069, 0x006a, 0x006b, 0x006c, 0x006d, 0x006e, 0x006f,
    0x0070, 0x0071, 0x0072, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077, 0x0078, 0x0079, 0x007a, 0x007b, 0x007c, 0x007d, 0x007e, 0x007f,
    0x00a0, 0x00c0, 0x00c1, 0x00c2, 0x00c3, 0x00c4, 0x00c5, 0x00c7, 0x00c8, 0x00c9, 0x00ca, 0x00cb, 0x00cc, 0x00cd, 0x00ce, 0x00cf,
    0x00d0, 0x00d1, 0x00d2, 0x00d3, 0x00d4, 0x00d5, 0x00d6, 0x00d9, 0x00da, 0x00db, 0x00dc, 0x00dd, 0x00de, 0x00b5, 0x00d7, 0x00f7,
    0x00a9, 0x00a1, 0x00a2, 0x00a3, 0x2044, 0x00a5, 0x0192, 0x00a7, 0x00a4, 0x2019, 0x201c, 0x00ab, 0x2039, 0x203a, 0xfb01, 0xfb02,
    0x00ae, 0x2013, 0x2020, 0x2021, 0x00b7, 0x00a6, 0x00b6, 0x2022, 0x201a, 0x201e, 0x201d, 0x00bb, 0x2026, 0x2030, 0x00ac, 0x00bf,
    0x00b9, 0x02cb, 0x00b4, 0x02c6, 0x02dc, 0x00af, 0x02d8, 0x02d9, 0x00a8, 0x00b2, 0x02da, 0x00b8, 0x00b3, 0x02dd, 0x02db, 0x02c7,
    0x2014, 0x00b1, 0x00bc, 0x00bd, 0x00be, 0x00e0, 0x00e1, 0x00e2, 0x00e3, 0x00e4, 0x00e5, 0x00e7, 0x00e8, 0x00e9, 0x00ea, 0x00eb,
    0x00ec, 0x00c6, 0x00ed, 0x00aa, 0x00ee, 0x00ef, 0x00f0, 0x00f1, 0x0141, 0x00d8, 0x0152, 0x00ba, 0x00f2, 0x00f3, 0x00f4, 0x00f5,
    0x00f6, 0x00e6, 0x00f9, 0x00fa, 0x00fb, 0x0131, 0x00fc, 0x00fd, 0x0142, 0x00f8, 0x0153, 0x00df, 0x00fe, 0x00ff, 0x0000, 0x0000,
    0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007, 0x0008, 0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x000e, 0x000f,
    0x0010, 0x0011, 0x0012, 0x0013, 0x0014, 0x0015, 0x0016, 0x0017, 0x0018, 0x0019, 0x001a, 0x001b, 0x001c, 0x001d, 0x001e, 0x001f,
    0x0020, 0x0021, 0x0022, 0x0023, 0x0024, 0x0025, 0x0026, 0x0027, 0x0028, 0x0029, 0x002a, 0x002b, 0x002c, 0x002d, 0x002e, 0x002f,
    0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037, 0x0038, 0x0039, 0x003a, 0x003b, 0x003c, 0x003d, 0x003e, 0x003f,
    0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047, 0x0048, 0x0049, 0x004a, 0x004b, 0x004c, 0x004d, 0x004e, 0x004f,
    0x0050, 0x0051, 0x0052, 0x0053, 0x0054, 0x0055, 0x0056, 0x0057, 0x0058, 0x0059, 0x005a, 0x005b, 0x005c, 0x005d, 0x005e, 0x005f,
    0x0060, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067, 0x0068, 0x0069, 0x006a, 0x006b, 0x006c, 0x006d, 0x006e, 0x006f,
    0x0070, 0x0071, 0x0072, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077, 0x0078, 0x0079, 0x007a, 0x007b, 0x007c, 0x007d, 0x007e, 0x007f,
    0x00a0, 0x00c0, 0x00c1, 0x00c2, 0x00c3, 0x00c4, 0x00c5, 0x00c7, 0x00c8, 0x00c9, 0x00ca, 0x00cb, 0x00cc, 0x00cd, 0x00ce, 0x00cf,
    0x00d0, 0x00d1, 0x00d2, 0x00d3, 0x00d4, 0x00d5, 0x00d6, 0x00d9, 0x00da, 0x00db, 0x00dc, 0x00dd, 0x00de, 0x00b5, 0x00d7, 0x00f7,
    0x00a9, 0x00a1, 0x00a2, 0x00a3, 0x2044, 0x00a5, 0x0192, 0x00a7, 0x00a4, 0x2019, 0x201c, 0x00ab, 0x2039, 0x203a, 0xfb01, 0xfb02,
    0x00ae, 0x2013, 0x2020, 0x2021, 0x00b7, 0x00a6, 0x00b6, 0x2022, 0x201a, 0x201e, 0x201d, 0x00bb, 0x2026, 0x2030, 0x00ac, 0x00bf,
    0x00b9, 0x02cb, 0x00b4, 0x02c6, 0x02dc, 0x00af, 0x02d8, 0x02d9, 0x00a8, 0x00b2, 0x02da, 0x00b8, 0x00b3, 0x02dd, 0x02db, 0x02c7,
    0x2014, 0x00b1, 0x00bc, 0x00bd, 0x00be, 0x00e0, 0x00e1, 0x00e2, 0x00e3, 0x00e4, 0x00e5, 0x00e7, 0x00e8, 0x00e9, 0x00ea, 0x00eb,
    0x00ec, 0x00c6, 0x00ed, 0x00aa, 0x00ee, 0x00ef, 0x00f0, 0x00f1, 0x0141, 0x00d8, 0x0152, 0x00ba, 0x00f2, 0x00f3, 0x00f4, 0x00f5,
    0x00f6, 0x00e6, 0x00f9, 0x00fa, 0x00fb, 0x0131, 0x00fc, 0x00fd, 0x0142, 0x00f8, 0x0153, 0x00df, 0x00fe, 0x00ff, 0x0000, 0x0000,
  ];

  it("8진 0o000–0o777 전부 — 값과 키가 plutil 채록과 같다", () => {
    expect(PLUTIL_OCTAL).toHaveLength(512);
    const body = PLUTIL_OCTAL.map((_, n) => `"k${n}" = ${L(`~${n.toString(8).padStart(3, "0")}`)};`).join("\n");
    const values = entriesOf("en", body);
    const keys = readOne("en", PLUTIL_OCTAL.map((_, n) => `${L(`~${n.toString(8).padStart(3, "0")}x${n}`)} = "v";`).join("\n")).locales[0]!.entries.map((e) => e.key);
    PLUTIL_OCTAL.forEach((code, n) => {
      expect(values[`k${n}`], n.toString(8)).toBe(ch(code));
      expect(keys, n.toString(8)).toContain(`${ch(code)}x${n}`);
    });
  });

  it("작은따옴표 리터럴의 이스케이프도 같다", () => {
    expect(decodeStringsLiteral(L("~'", "'"))).toBe("'");
    expect(decodeStringsLiteral(L('a~"b', "'"))).toBe('a"b');
  });

  /** 짝 없는 서로게이트는 plutil도 JSON으로 못 낸다 — 조용히 다른 값으로 적재하지 않고 파일을 명시 실패시킨다. */
  it.each(["~UD83D", "~UDE00", "~UD83DA", "~UDE00~UD83D"])("짝 없는 서로게이트 %j → 디코드 불가 · parse-failed · write-parse-failed", (body) => {
    expect(decodeStringsLiteral(L(body))).toBeUndefined();
    for (const text of [`"k" = ${L(body)};\n`, `${L(body)} = "v";\n`]) {
      expect(tokenizeStrings(text).ok).toBe(false);
      expect(readOne("en", text)).toMatchObject({ locales: [], errors: [{ code: "parse-failed" }] });
      expect(writeOne("en", text, [{ key: "k", message: "x" }])).toMatchObject({ content: text, errors: [{ code: "write-parse-failed" }] });
    }
  });

  it("encode는 새 디코더로 왕복한다 — NUL·DEL·C0·BMP 전역·이모지", () => {
    const samples = [ch(0), `${ch(0)}0`, ch(0x7f), ch(1, 0x1f), `${ch(4)}A`, ch(0xa0, 0xfb01, 0xffff), "u0041", "😀"];
    for (const v of samples) {
      expect(decodeStringsLiteral(encodeStringsLiteral(v)), JSON.stringify(v)).toBe(v);
      expect(decodeStringsLiteral(encodeStringsLiteral(v, "'")), JSON.stringify(v)).toBe(v);
    }
    let seed = 11;
    const next = () => (seed = (seed * 48271) % 2147483647);
    for (let n = 0; n < 500; n += 1) {
      const v = Array.from({ length: next() % 16 }, () => {
        const c = next() % 0x10000;
        // 서로게이트 구간은 짝을 지어 넣는다 — DB 값은 정상 UTF-16이다.
        return c >= 0xd800 && c < 0xe000 ? "😀" : ch(c);
      }).join("");
      expect(decodeStringsLiteral(encodeStringsLiteral(v))).toBe(v);
      // 정규형 고정점 — 인코더 출력은 다시 인코딩해도 같다.
      expect(encodeStringsLiteral(decodeStringsLiteral(encodeStringsLiteral(v))!)).toBe(encodeStringsLiteral(v));
    }
  });
});

describe("read", () => {
  it("값은 이스케이프를 푼 문자열이고 placeholder는 그대로다", () => {
    expect(entriesOf("en", '"count" = "%1$@ has %2$d \\"items\\"";\n')).toEqual({ count: '%1$@ has %2$d "items"' });
  });

  it("따옴표 없는 키를 받는다", () => {
    expect(entriesOf("en", "NSCameraUsageDescription = \"Camera\";\n")).toEqual({ NSCameraUsageDescription: "Camera" });
  });

  /** code-dict·ts-dict와 같은 경고다 — 잃는 번역이 없어 대상 리포 CI를 red로 만들지 않는다(지휘자 결정 2026-10-19, design §2.1의 "보고"). */
  it("중복 키 — 나중 값이 엔트리이고 duplicate-property 경고를 알린다", () => {
    const result = readOne("en", '"a" = "first";\n"a" = "second";\n"a" = "third";\n');
    expect(result.locales[0]?.entries).toEqual([{ key: "a", message: "third", order: 0 }]);
    expect(result.errors).toEqual([{ path: pathOf("en"), code: "duplicate-property", key: "a" }]);
    expect(adapterErrorKind("duplicate-property")).toBe("warning");
  });

  it('"__proto__" 키가 own property로 남는다', () => {
    const result = readOne("en", '"__proto__" = "x";\n"constructor" = "y";\n');
    expect(result.locales[0]?.entries).toEqual([{ key: "__proto__", message: "x", order: 0 }, { key: "constructor", message: "y", order: 1 }]);
    expect(Object.prototype).not.toHaveProperty("x");
  });

  it("0바이트·주석만 있는 파일은 엔트리 0개의 로케일이다", () => {
    expect(readOne("ko", "")).toEqual({ locales: [{ locale: "ko", entries: [] }], errors: [], nested: false });
    expect(readOne("ko", "/* nothing */\n").locales).toEqual([{ locale: "ko", entries: [] }]);
  });

  it("엔트리는 키 순으로 정렬하되 파일 위치를 order로 낸다 — 적재가 sortIndex로 옮겨 삽입 자리의 기준이 된다", () => {
    const result = readOne("en", '"b" = "B";\n"a" = "A1";\n"c" = "C";\n"a" = "A2";\n');
    expect(result.locales[0]?.entries).toEqual([{ key: "a", message: "A2", order: 2 }, { key: "b", message: "B", order: 0 }, { key: "c", message: "C", order: 1 }]);
  });

  it("UTF-8 BOM 문자를 건너뛴다", () => {
    expect(entriesOf("en", BOM + '"a" = "A";\n')).toEqual({ a: "A" });
  });

  it("문법 오류는 parse-failed이고 그 로케일을 내지 않는다", () => {
    const result = readOne("en", '"a" = "b"\n');
    expect(result.locales).toEqual([]);
    expect(result.errors).toMatchObject([{ path: pathOf("en"), code: "parse-failed" }]);
  });

  /** 바이너리 plist는 NUL 판별로 UTF-16 후보가 됐다가 디코드에 성공할 수도 있다(design §2.2) — 매직으로 명시 거부한다. */
  it.each([
    ["UTF-8로 읽힌 매직", "bplist00\u0000\u0001junk"],
    ["UTF-16LE로 읽힌 매직", Buffer.from("bplist00\u0001\u0002", "latin1").toString("utf16le")],
    ["UTF-16BE로 읽힌 매직", Buffer.from("bplist00\u0001\u0002", "latin1").swap16().toString("utf16le")],
  ])("bplist00 — %s → parse-failed", (_name, content) => {
    const result = readOne("en", content);
    expect(result.locales).toEqual([]);
    expect(result.errors).toMatchObject([{ code: "parse-failed", detail: expect.stringContaining("binary property list") }]);
    expect(writeOne("en", content, [{ key: "a", message: "A" }])).toMatchObject({ content, errors: [{ code: "write-parse-failed" }] });
  });
});

describe("write — 수술적 치환", () => {
  const SOURCE = [
    "/* Title of the home screen */",
    '"title" = "Home";',
    "",
    "// odd escape kept",
    '"odd" = "\\A";',
    '"keep" = "Keep";',
    "",
  ].join("\n");

  it("값 범위만 바꾸고 주석·빈 줄은 그대로다", () => {
    const out = writeOne("en", SOURCE, [{ key: "title", message: 'Start "here"\nnow' }, { key: "odd", message: "A" }, { key: "keep", message: "Keep" }]);
    expect(out).toEqual({ content: SOURCE.replace('"Home"', '"Start \\"here\\"\\nnow"'), errors: [] });
  });

  it("비정규 리터럴은 값이 바뀌었을 때만 다시 쓴다", () => {
    expect(writeOne("en", SOURCE, [{ key: "odd", message: "A" }]).content).toBe(SOURCE);
    expect(writeOne("en", SOURCE, [{ key: "odd", message: "B" }]).content).toBe(SOURCE.replace('"\\A"', '"B"'));
  });

  it("작은따옴표 리터럴은 그 따옴표로 다시 쓴다", () => {
    expect(writeOne("en", "'a' = 'x';\n", [{ key: "a", message: "it's" }]).content).toBe("'a' = 'it\\'s';\n");
  });

  it("중복 키 — 가려진 앞 리터럴은 고치지 않는다", () => {
    const text = '"a" = "first";\n"a" = "second";\n';
    expect(writeOne("en", text, [{ key: "a", message: "third" }]).content).toBe('"a" = "first";\n"a" = "third";\n');
  });

  it("빈 값은 치환하지 않는다 — 원본이 남고 저장은 cannot-clear다(불변식 3)", () => {
    expect(writeOne("en", SOURCE, [{ key: "title", message: "" }]).content).toBe(SOURCE);
    expect(planClearability({ writeStrategy: appleStrings.writeStrategy, isBase: false, value: "", sourceText: "Home" })).toBe("cannot-clear");
  });

  it("orphaned 키는 원본 값이 남는다", () => {
    expect(writeOne("en", SOURCE, [{ key: "keep", message: "DB", orphaned: true }]).content).toBe(SOURCE);
  });

  it("CRLF 원본은 CRLF로 남고, 삽입 줄도 CRLF다", () => {
    const crlf = '"a" = "A";\r\n"c" = "C";\r\n';
    const out = writeOne("ko", crlf, [{ key: "a", message: "AA", order: 0 }, { key: "b", message: "B", order: 1 }, { key: "c", message: "C", order: 2 }]);
    expect(out.content).toBe('"a" = "AA";\r\n"b" = "B";\r\n"c" = "C";\r\n');
  });

  it("문법 오류 원본은 그대로 두고 write-parse-failed를 알린다", () => {
    expect(writeOne("en", '"a" = ', [{ key: "a", message: "x" }])).toMatchObject({ content: '"a" = ', errors: [{ code: "write-parse-failed" }] });
  });

  it("원본이 없으면 null이다(새 파일은 create만 만든다)", () => {
    expect(appleStrings.write({ adapter: "apple-strings", pathTemplate: TEMPLATE, locales: ["ko"] }, { locale: "ko", entries: [{ key: "a", message: "A" }] })).toBeNull();
  });
});

describe("write — 비기준 파일의 누락 키 삽입", () => {
  it("기준 순서상 바로 앞 키의 엔트리 뒤에 넣고 들여쓰기·`=` 간격을 이웃에서 빌린다", () => {
    const ko = '/* head */\n  "a"="에이"; // trailing\n  "d"="디";\n';
    const out = writeOne("ko", ko, [
      { key: "a", message: "에이", order: 0 },
      { key: "b", message: "비", order: 1 },
      { key: "c", message: "씨", order: 2 },
      { key: "d", message: "디", order: 3 },
    ]);
    expect(out).toEqual({ content: '/* head */\n  "a"="에이"; // trailing\n  "b"="비";\n  "c"="씨";\n  "d"="디";\n', errors: [] });
  });

  it("앞 키가 파일에 없으면 파일 끝에 넣는다 — 값 없는 키(untranslated)도 순서의 기준이다", () => {
    // `x`는 이 언어 값이 DB에 없지만 파일에 자리가 있다 — 그 위치(base 순서 1)가 `c`의 앞 키다. `z`는 순서를 모르는 키라 기준이 아니다.
    const ko = '"x" = "X";\n"z" = "Z";\n';
    const out = writeOne("ko", ko, [{ key: "a", message: "에이", order: 0 }, { key: "c", message: "씨", order: 3 }], {
      untranslated: [{ key: "x", order: 1 }],
    });
    expect(out.content).toBe('"x" = "X";\n"c" = "씨";\n"z" = "Z";\n"a" = "에이";\n');
  });

  it("파일 끝에 개행이 없어도 줄을 잇는다", () => {
    expect(writeOne("ko", '"a" = "A";', [{ key: "a", message: "A", order: 0 }, { key: "b", message: "B", order: 1 }]).content).toBe('"a" = "A";\n"b" = "B";');
  });

  /** 리뷰 Y1 — 줄 주석 뒤 삽입이 LF 자리를 잡아 `\r`이 주석 줄에 남고 새 줄 끝은 LF뿐이었다. */
  it("CRLF × 줄 주석 × 누락 키 — 새 줄은 CR 앞에 들어가고 원본 바이트는 그대로다", () => {
    const ko = '"a" = "A"; // note\r\n"c" = "C";\r\n';
    const out = writeOne("ko", ko, [{ key: "a", message: "A", order: 0 }, { key: "b", message: "B", order: 1 }, { key: "c", message: "C", order: 2 }]);
    expect(out.content).toBe('"a" = "A"; // note\r\n"b" = "B";\r\n"c" = "C";\r\n');
  });

  /**
   * 리뷰 Y2 — 끝 개행이 없는 파일에서 "마지막 엔트리 뒤" 삽입과 "앞 키 없음 → 파일 끝" 삽입이 같은 offset의 편집 둘이었다. 한 편집으로 합치고
   * 순서를 정한다: 앞 키 뒤에 이어지는 줄이 먼저, 파일 끝 대체 줄이 나중이다.
   */
  it.each([
    ["끝 개행 없음", '"b" = "B";', '"b" = "B";\n"c" = "C";\n"a" = "A";'],
    ["EOF 줄 주석", '"b" = "B"; // last', '"b" = "B"; // last\n"c" = "C";\n"a" = "A";'],
    ["CRLF·끝 개행 없음", '"x" = "X";\r\n"b" = "B";', '"x" = "X";\r\n"b" = "B";\r\n"c" = "C";\r\n"a" = "A";'],
  ])("파일 끝 — %s: 앞·뒤 누락 키를 한 편집으로", (_name, ko, expected) => {
    const entries = [{ key: "a", message: "A", order: 0 }, { key: "b", message: "B", order: 1 }, { key: "c", message: "C", order: 2 }];
    expect(writeOne("ko", ko, entries).content).toBe(expected);
    // 그 출력이 다음 write의 입력으로 고정점이다.
    expect(writeOne("ko", expected, entries).content).toBe(expected);
  });

  it("0바이트 파일에도 넣고, 그 출력이 다음 read·write의 입력으로 고정점이다", () => {
    const entries = [{ key: "a", message: "A", order: 0 }, { key: "b", message: 'B "q"', order: 1 }];
    const out = writeOne("ko", "", entries).content!;
    expect(out).toBe('"a" = "A";\n"b" = "B \\"q\\"";\n');
    expect(entriesOf("ko", out)).toEqual({ a: "A", b: 'B "q"' });
    expect(writeOne("ko", out, entries).content).toBe(out);
  });

  it("UTF-8 BOM 파일에서도 같은 자리에 넣는다", () => {
    expect(writeOne("ko", BOM + '"a" = "A";\n', [{ key: "a", message: "A", order: 0 }, { key: "b", message: "B", order: 1 }]).content).toBe(BOM + '"a" = "A";\n"b" = "B";\n');
  });

  it("삽입 값이 같은 위치의 치환과 겹쳐 같은 자리를 두 번 쓰지 않는다", () => {
    const out = writeOne("ko", '"a" = "A";\n', [{ key: "a", message: "AA", order: 0 }, { key: "b", message: "B", order: 1 }]).content!;
    expect(out).toBe('"a" = "AA";\n"b" = "B";\n');
  });
});

describe("create — 새 언어 파일", () => {
  const create = (source: string, entries: LocaleEntry[]) =>
    appleStrings.create!({ adapter: "apple-strings", pathTemplate: TEMPLATE, locales: ["en"], representationSource: source }, { locale: "fr", baseLocale: "en", entries });

  it("주석·기준 값을 복사하지 않고 값 있는 활성 키만 기준 순서로 쓴다", () => {
    const out = create('/* do not copy */\n"b" = "BASE_B";\n"a" = "BASE_A";\n', [
      { key: "a", message: "Un", order: 1 },
      { key: "b", message: "Deux", order: 0 },
      { key: "gone", message: "X", orphaned: true },
      { key: "empty", message: "" },
    ]);
    expect(out).toEqual({ content: '"b" = "Deux";\n"a" = "Un";\n', errors: [] });
  });

  it("기준 파일의 BOM과 줄바꿈만 빌린다", () => {
    expect(create(BOM + '"a" = "A";\r\n', [{ key: "a", message: "Un" }]).content).toBe(BOM + '"a" = "Un";\r\n');
  });

  it("낼 값이 없으면 null이다", () => {
    expect(create('"a" = "A";\n', [{ key: "a", message: "" }])).toEqual({ content: null, errors: [] });
  });

  it("기준 파일이 없으면 write-create-unsupported다", () => {
    const out = appleStrings.create!({ adapter: "apple-strings", pathTemplate: TEMPLATE, locales: ["en"] }, { locale: "fr", baseLocale: "en", entries: [{ key: "a", message: "Un" }] });
    expect(out).toMatchObject({ content: null, errors: [{ code: "write-create-unsupported" }] });
  });
});

describe("detect — `.lproj` 디렉터리 이름이 로케일이다", () => {
  const probe = () => '"a" = "A";\n';

  it("로케일 코드는 디렉터리 이름 그대로이고 `Base`는 뺀다", () => {
    const paths = ["App/Base.lproj/Localizable.strings", "App/en-GB.lproj/Localizable.strings", "App/zh-Hans.lproj/Localizable.strings", "App/pt-BR.lproj/Localizable.strings", "App/en.lproj/Localizable.strings"];
    const [found] = appleStrings.detectCandidates(paths, probe);
    expect(found).toMatchObject({ adapter: "apple-strings", pathTemplate: TEMPLATE });
    expect([...found!.locales].sort()).toEqual(["en", "en-GB", "pt-BR", "zh-Hans"]);
  });

  it("경로만으로 1패스 후보를 낸다 — probe는 내용 검증에만 쓴다", () => {
    expect(appleStrings.detectCandidates(["App/en.lproj/Localizable.strings", "App/ko.lproj/Localizable.strings"])).toHaveLength(1);
    expect(appleStrings.detectCandidates(["App/en.lproj/Localizable.strings", "App/ko.lproj/Localizable.strings"], () => "not strings")).toEqual([]);
  });

  it("`fastlane/`·`Pods/`·`build/` 아래는 후보가 아니다", () => {
    const paths = ["fastlane/screenshots/en.lproj/title.strings", "fastlane/screenshots/ko.lproj/title.strings",
      "Pods/Lib/en.lproj/Lib.strings", "Pods/Lib/ko.lproj/Lib.strings", "build/App.app/en.lproj/Localizable.strings", "build/App.app/ko.lproj/Localizable.strings"];
    expect(appleStrings.detectCandidates(paths, probe)).toEqual([]);
  });

  /** 재측정(T2.3) — iTerm2·Lifeslice가 `Sparkle.framework`·`LifeSlice.app/Contents` 안의 사본을 1순위로 냈다. 빌드 산출물·벤더 프레임워크다. */
  it("`.framework`·`.app` 번들 안은 후보가 아니다", () => {
    const paths = ["en", "ko"].flatMap((l) => [`ThirdParty/Sparkle.framework/Versions/A/Resources/${l}.lproj/Sparkle.strings`, `Dist/My.app/Contents/Resources/${l}.lproj/Localizable.strings`]);
    expect(appleStrings.detectCandidates(paths, probe)).toEqual([]);
  });

  /** 재측정(T2.3) — ResearchKit은 `samples/…/Localizable.strings`가 정답 `ResearchKit/Localized/…/ResearchKit.strings`를 눌렀다. 예제 감점이 먼저다. */
  it("`Localizable` 우선은 예제·픽스처 감점을 넘지 않는다", () => {
    const paths = ["en", "ko"].flatMap((l) => [`samples/Catalog/${l}.lproj/Localizable.strings`, `Kit/Localized/${l}.lproj/Kit.strings`]);
    expect(detectCandidatesAcross(paths, probe).map((c) => c.pathTemplate)).toEqual(["Kit/Localized/{locale}.lproj/Kit.strings", "samples/Catalog/{locale}.lproj/Localizable.strings"]);
  });

  /**
   * 재측정(T2.3) — smooth-app(ARB 128 · `ios/Runner` InfoPlist 129)과 Mono-Dash(위젯 확장)에서 Flutter 앱의 iOS 셸이 ARB 정답을 눌렀다. 같은 루트에
   * `pubspec.yaml`이 있는 `ios/`·`macos/` 아래 후보는 Flutter 앱의 플랫폼 셸이라 어댑터 간 순위의 맨 뒤다(빼지 않는다 — 둘째 소스로 연결할 수 있다).
   */
  it("Flutter 앱의 `ios/`·`macos/` 셸은 다른 후보보다 뒤다 — 로케일이 더 많아도", () => {
    const locales = ["en", "ko", "ja"];
    const paths = [
      "packages/app/pubspec.yaml",
      ...locales.slice(0, 2).map((l) => `packages/app/lib/l10n/app_${l}.arb`),
      ...locales.map((l) => `packages/app/ios/Runner/${l}.lproj/InfoPlist.strings`),
      ...locales.map((l) => `packages/app/macos/Runner/${l}.lproj/InfoPlist.strings`),
    ];
    const files = (path: string) => (path.endsWith(".arb") ? '{"a":"A"}' : '"a" = "A";\n');
    expect(detectCandidatesAcross(paths, files).map((c) => c.adapter)).toEqual(["arb-catalog", "apple-strings", "apple-strings"]);
    // `pubspec.yaml`이 없는 네이티브 iOS 앱의 `ios/`는 셸이 아니다.
    const native = paths.filter((p) => p !== "packages/app/pubspec.yaml");
    expect(detectCandidatesAcross(native, files)[0]?.adapter).toBe("apple-strings");
  });

  it("테이블마다 후보 하나이고 `Localizable`이 앞이다", () => {
    const paths = ["en", "ko"].flatMap((l) => ["InfoPlist", "Localizable", "LaunchScreen"].map((t) => `App/${l}.lproj/${t}.strings`));
    expect(appleStrings.detectCandidates(paths, probe).map((c) => c.pathTemplate)).toEqual([
      "App/{locale}.lproj/Localizable.strings", "App/{locale}.lproj/InfoPlist.strings", "App/{locale}.lproj/LaunchScreen.strings",
    ]);
  });

  it("진입점 `detectCandidatesAcross` 1순위 — 테이블·스토리보드·fastlane이 있는 iOS 트리", () => {
    const tables = ["About", "InfoPlist", "LaunchScreen", "Localizable", "Main", "Settings"];
    const paths = [
      ...["en", "ko", "ja", "Base"].flatMap((l) => tables.map((t) => `App/${l}.lproj/${t}.strings`)),
      ...["en-US", "ko"].map((l) => `fastlane/metadata/${l}/description.txt`),
      "App/Info.plist",
    ];
    expect(detectCandidatesAcross(paths, probe)[0]).toMatchObject({ adapter: "apple-strings", pathTemplate: TEMPLATE });
    expect(detectCandidatesAcross(paths)[0]).toMatchObject({ adapter: "apple-strings", pathTemplate: TEMPLATE });
  });
});
