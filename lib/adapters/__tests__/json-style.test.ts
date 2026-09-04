import { describe, expect, it } from "vitest";
import { DEFAULT_JSON_STYLE, indentOf, observeJsonStyle, serializeJson } from "../json-style";
import { serialize } from "../shared";

/**
 * **원본 포맷 보존 태스크 1a — 들여쓰기 축** (`docs/features/format-preservation/`).
 *
 * `serialize`가 표현을 2칸으로 고정하는 것이 학습 코퍼스의 최대 잔여 diff 원인이다
 * (재생성 리포 71개 중 **30개**, `ADAPTER-COVERAGE.md` §11.3). 4칸 파일에 2칸을 쓰면 값 편집이
 * 0건이어도 **모든 줄이 바뀐다.**
 *
 * ⚠️ **이 태스크는 직렬화기를 직접 짜지 않는다.** `JSON.stringify`의 `space`가 문자열을 받고
 * 명세상 `space: 2`와 `space: "  "`가 동일하므로, 들여쓰기 축은 인자 교체만으로 닫힌다 —
 * 서로게이트 쌍·제어문자 이스케이프 위험을 아예 지나지 않는다. 한 줄 컨테이너·비ASCII
 * 이스케이프는 태스크 1b다.
 */

const V = { b: "둘", a: { deep: "깊다", arr: ["x", "y"] }, emoji: "🎉", quote: 'a"b\\c' };

describe("serializeJson — 기본 경로가 지금과 바이트 동일하다", () => {
  it("스타일을 안 주면 `serialize`와 같다 — 이게 깨지면 clean 고정 집합의 0.000이 무너진다", () => {
    expect(serializeJson(V)).toBe(serialize(V));
  });

  it("DEFAULT_JSON_STYLE을 줘도 같다", () => {
    expect(serializeJson(V, DEFAULT_JSON_STYLE)).toBe(serialize(V));
  });

  it("끝 개행이 정확히 1개다 — 원본과 무관한 불변식이다", () => {
    const out = serializeJson(V, { indent: "    " });
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
