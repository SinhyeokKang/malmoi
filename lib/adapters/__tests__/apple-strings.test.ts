import { describe, expect, it } from "vitest";

import { appleStrings, decodeStringsLiteral, encodeStringsLiteral, tokenizeStrings } from "../apple-strings";
import { detectCandidatesAcross } from "../index";
import type { DetectedFormat, LocaleEntry } from "../types";
import { planClearability } from "@/lib/keys/save";

/**
 * Apple `.strings` (apple-strings design §2.1·§3·§4·§5).
 *
 * 수술적 치환이다 — 값 리터럴의 범위만 바꾸고 주석·빈 줄·키 순서·비정규 이스케이프는 원본 바이트 그대로다. 비-base 파일의 누락 키만 삽입한다.
 */

const TEMPLATE = "App/{locale}.lproj/Localizable.strings";
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
    const samples = ["", "plain", 'q"uote', "back\\slash", "line\nbreak", "tab\there", "cr\rx", "\u0001\u001f", "😀 é 한글", "﻿x", "%@ %1$s %%", "'single'"];
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
      expect(encodeStringsLiteral(decodeStringsLiteral(literal))).toBe(literal);
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

  it("중복 키 — 나중 값이 엔트리이고 duplicate-key를 알린다", () => {
    const result = readOne("en", '"a" = "first";\n"a" = "second";\n');
    expect(result.locales[0]?.entries).toEqual([{ key: "a", message: "second", order: 0 }]);
    expect(result.errors).toEqual([{ path: pathOf("en"), code: "duplicate-key", key: "a" }]);
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
    expect(entriesOf("en", '﻿"a" = "A";\n')).toEqual({ a: "A" });
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

  it("0바이트 파일에도 넣고, 그 출력이 다음 read·write의 입력으로 고정점이다", () => {
    const entries = [{ key: "a", message: "A", order: 0 }, { key: "b", message: 'B "q"', order: 1 }];
    const out = writeOne("ko", "", entries).content!;
    expect(out).toBe('"a" = "A";\n"b" = "B \\"q\\"";\n');
    expect(entriesOf("ko", out)).toEqual({ a: "A", b: 'B "q"' });
    expect(writeOne("ko", out, entries).content).toBe(out);
  });

  it("UTF-8 BOM 파일에서도 같은 자리에 넣는다", () => {
    expect(writeOne("ko", '﻿"a" = "A";\n', [{ key: "a", message: "A", order: 0 }, { key: "b", message: "B", order: 1 }]).content).toBe('﻿"a" = "A";\n"b" = "B";\n');
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
    expect(create('﻿"a" = "A";\r\n', [{ key: "a", message: "Un" }]).content).toBe('﻿"a" = "Un";\r\n');
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
