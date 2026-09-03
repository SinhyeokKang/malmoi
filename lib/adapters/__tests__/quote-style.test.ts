import { describe, expect, it } from "vitest";
import { Project, SyntaxKind } from "ts-morph";
import { dominantQuote, quoteLiteral } from "../quote-style";

/**
 * 수술적 치환 어댑터(`code-dict`·`ts-dict`)가 **원본의 인용 부호를 유지**하기 위한 헬퍼.
 *
 * 왜 필요한가: 둘 다 편집된 값을 `JSON.stringify`로 써서 **항상 큰따옴표**가 됐다. 값은 정확하지만
 * 작은따옴표를 쓰는 리포에선 편집한 줄만 스타일이 튄다 — Prettier `singleQuote: true`나 ESLint
 * `quotes`가 걸린 리포에서 **pull PR이 lint를 깨뜨린다.** 수술적 치환의 계약은 "원본 구조 보존"이고
 * 인용 부호는 그 구조의 일부다 (2026-09-03 `i18n-format-check` 실물 PR #2에서 관측).
 *
 * ⚠️ 이스케이프 안전성은 계속 `JSON.stringify`가 책임진다 — `setLiteralValue`는 이스케이프를
 * 하지 않아 백슬래시·개행·따옴표가 재파싱에서 깨진다 (code-dict.ts·ts-dict.ts의 기존 주석).
 * 이 헬퍼는 그 결과를 **다른 인용 부호로 옮기기만** 한다.
 */

/** 만든 리터럴을 실제 파서에 먹여 값이 왕복하는지 본다 — 문자열 비교로는 이스케이프 오류를 놓친다. */
function parseBack(literal: string): string {
  const sf = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    "t.ts",
    `const v = ${literal};`,
    { overwrite: true },
  );
  const node = sf.getFirstDescendantByKindOrThrow(SyntaxKind.StringLiteral);
  return node.getLiteralValue();
}

describe("quoteLiteral — 값을 주어진 인용 부호의 리터럴로 만든다", () => {
  it('큰따옴표는 JSON.stringify와 같다', () => {
    expect(quoteLiteral("확인", '"')).toBe('"확인"');
  });

  it("작은따옴표로 감싼다", () => {
    expect(quoteLiteral("확인", "'")).toBe("'확인'");
  });

  it("작은따옴표 안의 `'`는 이스케이프한다", () => {
    const out = quoteLiteral("À l'instant", "'");
    expect(out).toBe("'À l\\'instant'");
    expect(parseBack(out)).toBe("À l'instant");
  });

  it('작은따옴표 안의 `"`는 이스케이프하지 않는다 — 그 자리에선 평범한 문자다', () => {
    const out = quoteLiteral('say "hi"', "'");
    expect(out).toBe(`'say "hi"'`);
    expect(parseBack(out)).toBe('say "hi"');
  });

  it('큰따옴표 안의 `"`는 이스케이프한다', () => {
    const out = quoteLiteral('say "hi"', '"');
    expect(parseBack(out)).toBe('say "hi"');
  });

  it("백슬래시는 두 인용 부호에서 똑같이 이스케이프된다", () => {
    for (const q of ["'", '"'] as const) {
      expect(parseBack(quoteLiteral("a\\b", q))).toBe("a\\b");
    }
  });

  it("개행은 두 인용 부호에서 똑같이 `\\n`이 된다", () => {
    for (const q of ["'", '"'] as const) {
      const out = quoteLiteral("a\nb", q);
      expect(out).not.toContain("\n"); // 리터럴이 줄을 넘지 않는다 — 넘으면 재파싱이 깨진다
      expect(parseBack(out)).toBe("a\nb");
    }
  });

  it("한글·이모지를 유니코드 이스케이프로 바꾸지 않는다", () => {
    for (const q of ["'", '"'] as const) {
      const out = quoteLiteral("안녕 🎉", q);
      expect(out).toContain("안녕 🎉");
      expect(out).not.toContain("\\u");
    }
  });

  it("두 부호가 모두 들어간 값도 왕복한다", () => {
    const value = `it's a "test" with \\ and
newline`;
    for (const q of ["'", '"'] as const) {
      expect(parseBack(quoteLiteral(value, q))).toBe(value);
    }
  });

  it("빈 문자열", () => {
    expect(quoteLiteral("", "'")).toBe("''");
    expect(quoteLiteral("", '"')).toBe('""');
  });
});

describe("dominantQuote — 파일의 다수 인용 부호", () => {
  it("작은따옴표가 많으면 작은따옴표다", () => {
    expect(dominantQuote(["'a'", "'b'", '"c"'])).toBe("'");
  });

  it("큰따옴표가 많으면 큰따옴표다", () => {
    expect(dominantQuote(['"a"', '"b"', "'c'"])).toBe('"');
  });

  it("동수면 큰따옴표다 — 기존 동작(JSON.stringify)과 같은 쪽으로 떨어진다", () => {
    expect(dominantQuote(["'a'", '"b"'])).toBe('"');
  });

  it("셀 것이 없으면 큰따옴표다", () => {
    expect(dominantQuote([])).toBe('"');
  });

  it("백틱(템플릿 리터럴)은 세지 않는다 — 우리가 쓸 수 있는 부호가 아니다", () => {
    expect(dominantQuote(["`a`", "`b`", "'c'"])).toBe("'");
  });
});
