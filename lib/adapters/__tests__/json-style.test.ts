import { describe, expect, it } from "vitest";
import { DEFAULT_JSON_STYLE, indentOf, observeJsonStyle, pathKey, serializeJson } from "../json-style";
import { chromeLocales } from "../chrome-locales";
import { jsonCatalog } from "../json-catalog";

/**
 * **원본 포맷 보존 태스크 1a — 들여쓰기 축** (ARCHITECTURE §1.1).
 *
 * 옛 `serialize`가 표현을 2칸으로 고정한 것이 학습 코퍼스의 최대 잔여 diff 원인이다
 * (재생성 리포 71개 중 **30개**, `ARCHITECTURE §1.9` §11.3). 4칸 파일에 2칸을 쓰면 값 편집이
 * 0건이어도 **모든 줄이 바뀐다.**
 *
 * ⚠️ **이 태스크는 직렬화기를 직접 짜지 않는다.** `JSON.stringify`의 `space`가 문자열을 받고
 * 명세상 `space: 2`와 `space: "  "`가 동일하므로, 들여쓰기 축은 인자 교체만으로 닫힌다 —
 * 서로게이트 쌍·제어문자 이스케이프 위험을 아예 지나지 않는다. 한 줄 컨테이너·비ASCII
 * 이스케이프는 태스크 1b다.
 */

const V = { b: "둘", a: { deep: "깊다", arr: ["x", "y"] }, emoji: "🎉", quote: 'a"b\\c' };

describe("serializeJson — 기본 경로가 지금과 바이트 동일하다", () => {
  // 원본이 없을 때의 기본 경로(신규 로케일 파일) — 2칸 + 끝 개행 1개. 이게 깨지면 clean 고정 집합의 0.000이 무너진다.
  it("스타일을 안 주면 2칸 + 끝 개행 1개다", () => {
    expect(serializeJson(V)).toBe(`${JSON.stringify(V, null, 2)}\n`);
  });

  it("DEFAULT_JSON_STYLE을 줘도 같다", () => {
    expect(serializeJson(V, DEFAULT_JSON_STYLE)).toBe(serializeJson(V));
  });

  it("끝 개행이 정확히 1개다 — 원본과 무관한 불변식이다", () => {
    const out = serializeJson(V, { ...DEFAULT_JSON_STYLE, indent: "    " });
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});

describe("observeJsonStyle — 원본에서 들여쓰기를 읽는다", () => {
  const four = '{\n    "a": "하나",\n    "b": {\n        "c": "둘"\n    }\n}\n';
  const tab = '{\n\t"a": "하나"\n}\n';
  const three = '{\n   "a": "하나"\n}\n';

  it("4칸·탭·3칸을 그대로 읽는다", () => {
    expect(observeJsonStyle(four).indent).toBe("    ");
    expect(observeJsonStyle(tab).indent).toBe("\t");
    expect(observeJsonStyle(three).indent).toBe("   ");
  });

  it("깊은 층의 배수에 안 흔들린다 — 첫 들여쓴 줄만 본다", () => {
    expect(observeJsonStyle(four).indent).toBe("    ");
  });

  it("한 줄 파일·들여쓴 줄 없음·빈 입력은 DEFAULT다", () => {
    expect(observeJsonStyle('{"a":"하나"}\n')).toEqual(DEFAULT_JSON_STYLE);
    expect(observeJsonStyle("")).toEqual(DEFAULT_JSON_STYLE);
    expect(observeJsonStyle(undefined)).toEqual(DEFAULT_JSON_STYLE);
  });

  it("깨진 JSON에도 던지지 않는다 — 관측 실패는 DEFAULT다", () => {
    expect(() => observeJsonStyle("{ this is not json")).not.toThrow();
  });
});

describe("serializeJson — 관측한 폭으로 낸다", () => {
  it("4칸 원본 → 4칸 출력", () => {
    const out = serializeJson({ a: "하나", b: { c: "둘" } }, observeJsonStyle('{\n    "x": 1\n}\n'));
    expect(out).toBe('{\n    "a": "하나",\n    "b": {\n        "c": "둘"\n    }\n}\n');
  });

  it("탭 원본 → 탭 출력", () => {
    expect(serializeJson({ a: "하나" }, observeJsonStyle('{\n\t"x": 1\n}\n'))).toBe('{\n\t"a": "하나"\n}\n');
  });
});

describe("고정점 — 우리가 낸 파일을 다시 관측하면 같은 스타일이다", () => {
  /** 이 성질이 바이트 고정점(완료 조건 ⑤)의 근거다. 깨지면 야간 cron이 매일 빈 커밋을 쌓는다. */
  for (const [name, src] of [
    ["4칸", '{\n    "x": 1\n}\n'],
    ["탭", '{\n\t"x": 1\n}\n'],
    ["3칸", '{\n   "x": 1\n}\n'],
    ["2칸", '{\n  "x": 1\n}\n'],
  ] as const) {
    it(`${name}: observe(serializeJson(v, s)) === s`, () => {
      const s = observeJsonStyle(src);
      expect(observeJsonStyle(serializeJson(V, s))).toEqual(s);
    });
  }

  it("혼합 들여쓰기는 첫 층으로 정규화되고 그다음이 고정점이다 (알려진 근사)", () => {
    const mixed = '{\n    "a": 1,\n  "b": 2\n}\n';
    const s = observeJsonStyle(mixed);
    expect(s.indent).toBe("    ");
    const out = serializeJson(V, s);
    expect(observeJsonStyle(out)).toEqual(s);
  });

  it("관측 불가 원본은 DEFAULT로 한 번 정규화되고 그다음이 고정점이다", () => {
    const s = observeJsonStyle('{"a":1}\n');
    expect(s).toEqual(DEFAULT_JSON_STYLE);
    expect(observeJsonStyle(serializeJson(V, s))).toEqual(s);
  });
});

describe("indentOf — survey와 같은 함수를 쓴다", () => {
  it("문자열이 아니라 IndentStyle을 낸다 (지표가 쓰는 모양)", () => {
    expect(indentOf('{\n    "a": 1\n}')).toEqual({ char: "space", width: 4 });
    expect(indentOf('{\n\t"a": 1\n}')).toEqual({ char: "tab", width: 1 });
    expect(indentOf('{"a":1}')).toEqual({ char: "none", width: 0 });
  });
});

// ── 태스크 1b: 한 줄 컨테이너 + 비ASCII 이스케이프 ──────────────────────────

describe("observeJsonStyle — 한 줄 컨테이너", () => {
  const src = [
    "{",
    '  "hero": {',
    '    "subcopy": ["하나", "둘"],',
    '    "cta": "시작"',
    "  },",
    '  "wide": {',
    '    "a": "에이"',
    "  }",
    "}",
    "",
  ].join("\n");

  it("한 줄에 담긴 컨테이너의 경로만 모은다", () => {
    const s = observeJsonStyle(src);
    expect(s.compactPaths.has(pathKey(["hero", "subcopy"]))).toBe(true);
    expect(s.compactPaths.has(pathKey(["hero"]))).toBe(false);
    expect(s.compactPaths.has(pathKey(["wide"]))).toBe(false);
  });

  it("루트는 담지 않는다 — 담으면 우리가 한 줄짜리 파일을 낸다", () => {
    expect(observeJsonStyle('{"a": "하나", "b": "둘"}\n').compactPaths.has(pathKey([]))).toBe(false);
  });

  it("빈 컨테이너는 담지 않는다", () => {
    const s = observeJsonStyle('{\n  "empty": {},\n  "none": []\n}\n');
    expect(s.compactPaths.has(pathKey(["empty"]))).toBe(false);
    expect(s.compactPaths.has(pathKey(["none"]))).toBe(false);
  });

  it("경로 키가 세그먼트 배열이다 — `.` 조인이면 점 든 키와 중첩이 구별되지 않는다", () => {
    // `{"a.b": [...]}`(단일 키)와 `{"a": {"b": [...]}}`(중첩)가 같은 경로 문자열이 되면
    // 엉뚱한 컨테이너가 한 줄로 나간다 (ARCHITECTURE §1.35의 별칭 버그를 표현 축에서 재현).
    const dotted = observeJsonStyle('{\n  "a.b": ["x"]\n}\n');
    expect(dotted.compactPaths.has(pathKey(["a.b"]))).toBe(true);
    expect(dotted.compactPaths.has(pathKey(["a", "b"]))).toBe(false);
  });
});

describe("serializeJson — 한 줄 컨테이너를 되돌린다", () => {
  it("집합에 있는 경로만 한 줄로 낸다", () => {
    const style = observeJsonStyle('{\n  "hero": {\n    "list": ["하나", "둘"]\n  }\n}\n');
    const out = serializeJson({ hero: { list: ["하나", "둘"], cta: "시작" } }, style);
    expect(out).toBe('{\n  "hero": {\n    "list": ["하나", "둘"],\n    "cta": "시작"\n  }\n}\n');
  });

  it("집합에 없으면 펼친다", () => {
    expect(serializeJson({ a: ["하나"] })).toBe('{\n  "a": [\n    "하나"\n  ]\n}\n');
  });

  it("집합에 있는 경로가 출력에 없으면 그냥 안 쓰인다 — 진동하지 않는다", () => {
    const style = observeJsonStyle('{\n  "gone": ["x"]\n}\n');
    expect(serializeJson({ a: "하나" }, style)).toBe('{\n  "a": "하나"\n}\n');
  });
});

describe("observeJsonStyle — 비ASCII 이스케이프", () => {
  it("문자열 안의 `\\uXXXX`가 ASCII 밖이면 true다", () => {
    expect(observeJsonStyle('{\n  "a": "\\ud55c"\n}\n').escapeNonAscii).toBe(true);
  });

  it("`\\u0041`(A)는 세지 않는다 — ASCII라 write가 풀어도 diff가 아니다", () => {
    expect(observeJsonStyle('{\n  "a": "\\u0041"\n}\n').escapeNonAscii).toBe(false);
  });

  it("**값이 리터럴 백슬래시-u를 담고 있으면 세지 않는다** — 고정점이 여기서 깨졌다", () => {
    // 문자열 문맥을 안 보는 전역 정규식이면 `"\\u00e9"`(값이 6글자)를 이스케이프로 오독하고,
    // 재관측이 false → true로 뒤집혀 2차 write가 1차와 달라진다.
    expect(observeJsonStyle('{\n  "a": "\\\\u00e9"\n}\n').escapeNonAscii).toBe(false);
  });
});

describe("serializeJson — 이스케이프를 되돌린다", () => {
  const escaped = { ...DEFAULT_JSON_STYLE, escapeNonAscii: true };

  it("비ASCII를 `\\uXXXX`로 낸다", () => {
    expect(serializeJson({ a: "한" }, escaped)).toBe('{\n  "a": "\\ud55c"\n}\n');
  });

  it("ASCII는 그대로 둔다", () => {
    expect(serializeJson({ a: "AB" }, escaped)).toBe('{\n  "a": "AB"\n}\n');
  });

  it("서로게이트 쌍(이모지)이 두 개로 나가고 JSON.parse가 원값을 되돌린다", () => {
    const out = serializeJson({ a: "🎉" }, escaped);
    expect(out).toBe('{\n  "a": "\\ud83c\\udf89"\n}\n');
    expect(JSON.parse(out)).toEqual({ a: "🎉" });
  });

  it("이스케이프가 필요한 제어문자·따옴표는 JSON.stringify가 맡는다", () => {
    const v = { a: 'q"b\\c\nd\te' };
    expect(JSON.parse(serializeJson(v, escaped))).toEqual(v);
    expect(JSON.parse(serializeJson(v))).toEqual(v);
  });
});

describe("serializeJson — placeholders는 임의 JSON이다", () => {
  it("객체·배열·숫자·불린·null을 다루고 키 순서를 원본대로 둔다", () => {
    const v = { k: { message: "M", placeholders: { u: { content: "$1", example: 3 }, z: [true, null] } } };
    const out = serializeJson(v);
    expect(JSON.parse(out)).toEqual(v);
    expect(out.indexOf('"content"')).toBeLessThan(out.indexOf('"example"'));
    expect(out).toBe(`${JSON.stringify(v, null, 2)}\n`);
  });
});

describe("고정점 — 1b의 두 축", () => {
  it("한 줄 컨테이너: observe(write(v, s)) === s", () => {
    const s = observeJsonStyle('{\n  "hero": {\n    "list": ["하나", "둘"]\n  }\n}\n');
    const v = { hero: { list: ["하나", "둘"], cta: "시작" } };
    expect(observeJsonStyle(serializeJson(v, s))).toEqual(s);
  });

  it("이스케이프: 부분 이스케이프 원본은 한 번 정규화되고 그다음이 고정점이다", () => {
    const s = observeJsonStyle('{\n  "a": "\\ud55c",\n  "b": "글"\n}\n');
    expect(s.escapeNonAscii).toBe(true);
    const first = serializeJson({ a: "한", b: "글" }, s);
    const s2 = observeJsonStyle(first);
    expect(s2).toEqual(s);
    expect(serializeJson({ a: "한", b: "글" }, s2)).toBe(first);
  });
});

// ── 슬래시 이스케이프 (10차 측정이 드러낸 네 번째 축) ────────────────────────
// Midnight-Lizard 실측: 필드 순서를 고친 뒤에도 0.109가 남았고 전부 `\/`였다.
// 합법이지만 선택적인 JSON 이스케이프라 `JSON.stringify`는 절대 내지 않는다.

describe("observeJsonStyle — 슬래시 이스케이프", () => {
  it("문자열 안의 `\\/`를 관측한다", () => {
    expect(observeJsonStyle('{\n  "a": "tooltip\\/hint"\n}\n').escapeSlash).toBe(true);
  });

  it("맨 슬래시는 세지 않는다", () => {
    expect(observeJsonStyle('{\n  "a": "tooltip/hint"\n}\n').escapeSlash).toBe(false);
  });

  it("**값이 리터럴 백슬래시-슬래시를 담고 있으면 세지 않는다** — 이스케이프 축과 같은 함정이다", () => {
    expect(observeJsonStyle('{\n  "a": "\\\\/x"\n}\n').escapeSlash).toBe(false);
  });
});

describe("serializeJson — 슬래시를 되돌린다", () => {
  const slash = { ...DEFAULT_JSON_STYLE, escapeSlash: true };

  it("모든 `/`를 `\\/`로 낸다", () => {
    expect(serializeJson({ a: "a/b" }, slash)).toBe('{\n  "a": "a\\/b"\n}\n');
  });

  it("리터럴 백슬래시가 앞에 있어도 값이 보존된다", () => {
    const v = { a: "x\\/y" };
    expect(JSON.parse(serializeJson(v, slash))).toEqual(v);
  });

  it("기본값은 그대로다 — `JSON.stringify`는 슬래시를 이스케이프하지 않는다", () => {
    expect(serializeJson({ a: "a/b" })).toBe('{\n  "a": "a/b"\n}\n');
  });

  it("고정점: observe(write(v, s)) === s", () => {
    const s = observeJsonStyle('{\n  "a": "x\\/y",\n  "b": "plain"\n}\n');
    expect(s.escapeSlash).toBe(true);
    const first = serializeJson({ a: "x/y", b: "plain" }, s);
    const s2 = observeJsonStyle(first);
    expect(s2).toEqual(s);
    expect(serializeJson({ a: "x/y", b: "plain" }, s2)).toBe(first);
  });
});


describe("원본 끝 개행이 없어도 출력은 정확히 1개다 — 원본과 무관한 불변식", () => {
  // Midnight-Lizard 실측(ARCHITECTURE §1.9): 그 파일의 유일한 잔여 diff가 이 줄이었다.
  // 픽스처는 전부 개행이 있어서 이 축이 한 번도 검증되지 않았다 (2026-09-04 audit #25).
  it("한 번 정규화되고 그다음이 고정점이다", () => {
    const noNewline = '{\n  "a": "하나"\n}';
    const s = observeJsonStyle(noNewline);
    const first = serializeJson({ a: "하나" }, s);
    expect(first.endsWith("}\n")).toBe(true);
    expect(first.endsWith("\n\n")).toBe(false);
    expect(serializeJson({ a: "하나" }, observeJsonStyle(first))).toBe(first);
  });
});

/**
 * **줄바꿈 축** (launch-readiness L4.5). yaml·code-dict는 CRLF 원본을 보존하는데(`yaml-catalog.test.ts`·`code-dict.test.ts`)
 * JSON 재생성 어댑터는 `JsonStyle`에 개행 필드가 없어 CRLF 파일을 LF로 다시 썼다 — 값이 하나도 안 바뀌어도 **모든 줄이
 * 바뀌고** blob SHA가 매번 달라 야간 pull이 빈 PR을 낸다(ARCHITECTURE §0 결정성).
 */
describe("JSON 재생성 어댑터 — CRLF 원본", () => {
  const cases = [
    { adapter: jsonCatalog, pathTemplate: "i18n/{locale}.json", body: (nl: string) => `{${nl}  "a": "A",${nl}  "b": "B"${nl}}${nl}`, entries: [{ key: "a", message: "A" }, { key: "b", message: "B" }] },
    { adapter: chromeLocales, pathTemplate: "_locales/{locale}/messages.json", body: (nl: string) => `{${nl}  "a": {${nl}    "message": "A"${nl}  }${nl}}${nl}`, entries: [{ key: "a", message: "A" }] },
  ];
  for (const c of cases) {
    it.each([["CRLF", "\r\n"], ["LF", "\n"]])(`${c.adapter.name}: %s 원본에 값 무변경 write는 바이트 동일하다`, (_name, nl) => {
      const path = c.pathTemplate.replace("{locale}", "en");
      const original = c.body(nl);
      const out = c.adapter.write({ adapter: c.adapter.name, pathTemplate: c.pathTemplate, locales: ["en"], currentFiles: [{ path, content: original }] }, { locale: "en", entries: c.entries });
      expect(out).toBe(original);
    });
  }
  it("관측: CRLF가 우세하면 CRLF, 아니면 LF", () => {
    expect(observeJsonStyle('{\r\n  "a": "A"\r\n}\r\n').eol).toBe("\r\n");
    expect(observeJsonStyle('{\n  "a": "A"\n}\n').eol).toBe("\n");
    expect(observeJsonStyle(undefined).eol).toBe("\n");
  });
});
