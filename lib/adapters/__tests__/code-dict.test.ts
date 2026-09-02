import { describe, expect, it } from "vitest";
import { codeDict, detectFormat } from "../index";
import type { AdapterFile, DetectedFormat } from "../types";

/**
 * `code-dict` — `<dir>/{locale}.{ts,tsx,js,mjs}`. `per-locale` + **수술적 치환**이다.
 *
 * 오픈소스 109개에서 코드 딕셔너리를 쓰는 리포 12개가 **전부 이 형태**였다 (ant-design 73로케일·
 * element-plus 67·vuetify 43·payload 40). `ts-dict`가 전제하는 "한 파일에 로케일 여러 개"는
 * bugshot-2의 관례이지 생태계의 관례가 아니었다 (`docs/ADAPTER-COVERAGE.md` 판정 ③).
 */

/** element-plus·vuetify·quasar 형태 — `export default { … }` + 줄 끝 주석 */
const DEFAULT_OBJ = `export default {
  name: 'ko',
  el: {
    // 사람이 넣은 주석
    ok: '확인',
    clear: '초기화', // to be translated

    close: '닫기',
  },
}
`;

/** ant-design 형태 — 명명된 const + import 참조 shorthand + 템플릿 리터럴 */
const NAMED_CONST = `import Pagination from '@rc-component/pagination/locale/ko_KR';
import type { Locale } from '.';

const typeTemplate = '\${label} 유효하지 않은 \${type}';

const localeValues: Locale = {
  locale: 'ko',
  Pagination,
  global: {
    placeholder: '선택하세요',
    close: '닫기',
  },
  Form: {
    defaultValidateMessages: { default: typeTemplate },
  },
};

export default localeValues;
`;

const f = (path: string, content: string): AdapterFile => ({ path, content });
const TMPL = "src/locale/{locale}.ts";
const base = (over: Partial<DetectedFormat> = {}): DetectedFormat => ({
  adapter: "code-dict",
  pathTemplate: TMPL,
  locales: ["ko"],
  ...over,
});
const withSource = (content: string, path = "src/locale/ko.ts") =>
  base({ currentFiles: [{ path, content }] });

describe("code-dict — 계약", () => {
  it("per-locale + surgical이다", () => {
    expect(codeDict.layout).toBe("per-locale");
    expect(codeDict.writeStrategy).toBe("surgical");
  });
});

describe("code-dict — detect", () => {
  it("로케일 이름 파일이 2개 이상인 디렉터리를 찾는다", () => {
    const d = codeDict.detectCandidates(
      ["src/locale/ko.ts", "src/locale/en.ts", "src/locale/ja.ts", "src/index.ts"],
      () => DEFAULT_OBJ,
    );
    expect(d[0]).toMatchObject({ adapter: "code-dict", pathTemplate: "src/locale/{locale}.ts" });
    expect(d[0]?.locales.sort()).toEqual(["en", "ja", "ko"]);
  });

  it(".js도 받는다 (quasar가 그렇다)", () => {
    const d = codeDict.detectCandidates(["ui/lang/ko-KR.js", "ui/lang/en-US.js"], () => DEFAULT_OBJ);
    expect(d[0]?.pathTemplate).toBe("ui/lang/{locale}.js");
  });

  it("probe 없이는 잡지 않는다 — .ts 디렉터리는 어디에나 있다", () => {
    expect(codeDict.detectCandidates(["src/locale/ko.ts", "src/locale/en.ts"])).toEqual([]);
  });

  it("default export 객체가 없으면 잡지 않는다", () => {
    expect(
      codeDict.detectCandidates(["src/utils/ko.ts", "src/utils/en.ts"], () => "export const x = 1;\n"),
    ).toEqual([]);
  });

  it("명명된 const를 default export하는 형태도 잡는다 (ant-design)", () => {
    const d = codeDict.detectCandidates(
      ["components/locale/ko_KR.ts", "components/locale/en_US.ts"],
      () => NAMED_CONST,
    );
    expect(d).toHaveLength(1);
  });

  it("detectFormat 파이프라인에 들어 있다", () => {
    const d = detectFormat(["src/locale/ko.ts", "src/locale/en.ts"], () => DEFAULT_OBJ);
    expect(d?.adapter).toBe("code-dict");
  });
});

describe("code-dict — read", () => {
  it("중첩 객체를 점 표기로 평탄화한다", () => {
    const r = codeDict.read(base(), [f("src/locale/ko.ts", DEFAULT_OBJ)]);
    expect(r.errors).toEqual([]);
    expect(r.locales[0]!.entries.map((e) => e.key)).toEqual(["el.clear", "el.close", "el.ok", "name"]);
    expect(r.locales[0]!.entries.find((e) => e.key === "el.ok")?.message).toBe("확인");
  });

  it("명명된 const를 한 단계 따라간다 (ant-design)", () => {
    const r = codeDict.read(base(), [f("components/locale/ko_KR.ts", NAMED_CONST)]);
    const keys = r.locales[0]!.entries.map((e) => e.key);
    expect(keys).toContain("global.placeholder");
    expect(keys).toContain("locale");
  });

  it("문자열 리터럴이 아닌 값은 에러로 남긴다 — import 참조·템플릿 리터럴", () => {
    const r = codeDict.read(base(), [f("components/locale/ko_KR.ts", NAMED_CONST)]);
    // Pagination(shorthand) + default: typeTemplate(식별자) = 2건
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
    expect(r.errors.map((e) => e.message).join(" ")).toContain("Pagination");
  });

  it("경로에서 로케일을 역산한다", () => {
    const r = codeDict.read(base({ locales: ["ko", "en"] }), [
      f("src/locale/ko.ts", DEFAULT_OBJ),
      f("src/locale/en.ts", DEFAULT_OBJ),
    ]);
    expect(r.locales.map((l) => l.locale)).toEqual(["en", "ko"]);
  });

  it("파싱 실패는 던지지 않고 에러다", () => {
    const r = codeDict.read(base(), [f("src/locale/ko.ts", "export default { unclosed: '")]);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("code-dict — write는 수술적이다", () => {
  it("값만 바뀌고 주석·빈 줄이 보존된다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "el.ok", message: "OK로 변경" }],
    })!;
    expect(out).toContain("// 사람이 넣은 주석");
    expect(out).toContain("// to be translated");
    expect(out).toContain("OK로 변경");
    expect(out).not.toContain("'확인'");
    expect(out).toContain("close: '닫기'");
  });

  it("이스케이프가 깨지지 않는다 — setLiteralValue를 쓰면 안 되는 이유", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "el.ok", message: 'a"b\\c\nd' }],
    })!;
    // 재파싱해서 같은 값이 나와야 한다
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "el.ok")?.message).toBe('a"b\\c\nd');
  });

  it("한글이 유니코드 이스케이프로 바뀌지 않는다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "el.ok", message: "안녕 🎉" }],
    })!;
    expect(out).toContain("안녕 🎉");
    expect(out).not.toContain("\\u");
  });

  it("바뀐 값이 없으면 원본을 바이트 그대로 돌려준다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "el.ok", message: "확인" }],
    });
    expect(out).toBe(DEFAULT_OBJ);
  });

  it("원본이 없으면 null", () => {
    expect(codeDict.write(base(), { locale: "ko", isBase: false, entries: [{ key: "a", message: "A" }] })).toBeNull();
  });

  it("orphaned·빈 값은 원본 값을 남긴다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      isBase: false,
      entries: [
        { key: "el.ok", message: "덮지 말 것", orphaned: true },
        { key: "el.close", message: "" },
      ],
    })!;
    expect(out).toContain("'확인'");
    expect(out).toContain("'닫기'");
    expect(out).not.toContain("덮지 말 것");
  });

  it("문자열 리터럴이 아닌 프로퍼티는 건드리지 않는다", () => {
    const out = codeDict.write(withSource(NAMED_CONST), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "global.close", message: "종료" }],
    })!;
    expect(out).toContain("Pagination,");
    expect(out).toContain("default: typeTemplate");
    expect(out).toContain("종료");
  });
});

describe("code-dict — 없는 키를 삽입한다 (ARCHITECTURE §1.4)", () => {
  it("같은 객체에 없는 키를 추가한다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "el.newKey", message: "새 값" }],
    })!;
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "el.newKey")?.message).toBe("새 값");
    expect(out).toContain("// 사람이 넣은 주석");
  });

  it("중간 경로가 없으면 만든다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "brand.new.deep", message: "깊은 새 값" }],
    })!;
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "brand.new.deep")?.message).toBe("깊은 새 값");
  });

  it("삽입 순서가 결정적이다", () => {
    const entries = [
      { key: "el.zeta", message: "Z" },
      { key: "el.alpha", message: "A" },
    ];
    const a = codeDict.write(withSource(DEFAULT_OBJ), { locale: "ko", isBase: false, entries })!;
    const b = codeDict.write(withSource(DEFAULT_OBJ), { locale: "ko", isBase: false, entries: [...entries].reverse() })!;
    expect(b).toBe(a);
    expect(a.indexOf("alpha")).toBeLessThan(a.indexOf("zeta"));
  });
});

describe("code-dict — 왕복", () => {
  for (const [name, src] of [["export default 객체", DEFAULT_OBJ], ["명명된 const", NAMED_CONST]] as const) {
    it(`${name}: read→write→read가 의미 동일하고 2차 write가 바이트 고정점이다`, () => {
      const path = "src/locale/ko.ts";
      const r1 = codeDict.read(base(), [f(path, src)]);
      const w1 = codeDict.write(base({ currentFiles: [{ path, content: src }] }), {
        locale: "ko",
        isBase: false,
        entries: r1.locales[0]!.entries,
      })!;
      const r2 = codeDict.read(base(), [f(path, w1)]);
      expect(r2.locales[0]!.entries).toEqual(r1.locales[0]!.entries);
      const w2 = codeDict.write(base({ currentFiles: [{ path, content: w1 }] }), {
        locale: "ko",
        isBase: false,
        entries: r2.locales[0]!.entries,
      })!;
      expect(w2).toBe(w1);
    });
  }
});
