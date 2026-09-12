import { describe, expect, it } from "vitest";
import { codeDict, detectFormat } from "../index";
import type { AdapterFile, DetectedFormat } from "../types";

/**
 * `code-dict` — `<dir>/{locale}.{ts,tsx,js,mjs}`. `per-locale` + **수술적 치환**이다.
 *
 * 오픈소스 109개에서 코드 딕셔너리를 쓰는 리포 12개가 **전부 이 형태**였다 (ant-design 73로케일·
 * element-plus 67·vuetify 43·payload 40). `ts-dict`가 전제하는 "한 파일에 로케일 여러 개"는
 * bugshot-2의 관례이지 생태계의 관례가 아니었다 (`docs/ARCHITECTURE §1.9` 판정 ③).
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

  it("디렉터리 경로에 공백이 있어도 템플릿이 그대로다 — 내부 키를 공백으로 쪼개면 오분해된다 (2026-09-04 audit #12)", () => {
    const d = codeDict.detectCandidates(["my app/locale/ko.ts", "my app/locale/en.ts"], () => DEFAULT_OBJ);
    expect(d[0]?.pathTemplate).toBe("my app/locale/{locale}.ts");
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
    const r = codeDict.read(base({ pathTemplate: "components/locale/{locale}.ts", locales: ["ko_KR"] }), [
      f("components/locale/ko_KR.ts", NAMED_CONST),
    ]);
    const keys = r.locales[0]!.entries.map((e) => e.key);
    expect(keys).toContain("global.placeholder");
    expect(keys).toContain("locale");
  });

  it("문자열 리터럴이 아닌 값은 에러로 남긴다 — import 참조·템플릿 리터럴", () => {
    const r = codeDict.read(base({ pathTemplate: "components/locale/{locale}.ts", locales: ["ko_KR"] }), [
      f("components/locale/ko_KR.ts", NAMED_CONST),
    ]);
    // Pagination(shorthand) + default: typeTemplate(식별자) = 2건
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
    expect(r.errors.map((e) => e.key)).toContain("Pagination");
    expect(r.errors.map((e) => e.code)).toContain("shorthand-property");
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
      entries: [{ key: "el.ok", message: "OK로 변경" }],
    })!;
    expect(out).toContain("// 사람이 넣은 주석");
    expect(out).toContain("// to be translated");
    expect(out).toContain("OK로 변경");
    expect(out).not.toContain("'확인'");
    expect(out).toContain("close: '닫기'");
    // 이름이 "빈 줄이 보존된다"인데 빈 줄을 안 보고 있었다 (2026-09-04 audit #24).
    expect(out.split("\n").filter((l) => l.trim() === "").length).toBe(DEFAULT_OBJ.split("\n").filter((l) => l.trim() === "").length);
  });

  it("이스케이프가 깨지지 않는다 — setLiteralValue를 쓰면 안 되는 이유", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: 'a"b\\c\nd' }],
    })!;
    // 재파싱해서 같은 값이 나와야 한다
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "el.ok")?.message).toBe('a"b\\c\nd');
  });

  it("한글이 유니코드 이스케이프로 바뀌지 않는다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "안녕 🎉" }],
    })!;
    expect(out).toContain("안녕 🎉");
    expect(out).not.toContain("\\u");
  });

  it("바뀐 값이 없으면 원본을 바이트 그대로 돌려준다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "확인" }],
    });
    expect(out).toBe(DEFAULT_OBJ);
  });

  it("원본이 없으면 null", () => {
    expect(codeDict.write(base(), { locale: "ko", entries: [{ key: "a", message: "A" }] })).toBeNull();
  });

  it("orphaned·빈 값은 원본 값을 남긴다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
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
      entries: [{ key: "el.newKey", message: "새 값" }],
    })!;
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "el.newKey")?.message).toBe("새 값");
    expect(out).toContain("// 사람이 넣은 주석");
  });

  it("중간 경로가 없으면 만든다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
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
    const a = codeDict.write(withSource(DEFAULT_OBJ), { locale: "ko", entries })!;
    const b = codeDict.write(withSource(DEFAULT_OBJ), { locale: "ko", entries: [...entries].reverse() })!;
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
        entries: r1.locales[0]!.entries,
      })!;
      const r2 = codeDict.read(base(), [f(path, w1)]);
      expect(r2.locales[0]!.entries).toEqual(r1.locales[0]!.entries);
      const w2 = codeDict.write(base({ currentFiles: [{ path, content: w1 }] }), {
        locale: "ko",
        entries: r2.locales[0]!.entries,
      })!;
      expect(w2).toBe(w1);
    });
  }
});

/**
 * 실측 4회차에서 code-dict가 놓친 형태들. 원인이 셋 다 달랐다:
 *
 * - payloadcms/payload — `export const koTranslations: X = { … }` (**명명된 export**, default 아님)
 * - tusen-ai/naive-ui — 파일명이 `koKR.ts` (**camelCase 로케일**)
 * - happy-func/next-official — `export default flat({ article, blog })` (**함수 호출**). 문자열이
 *   import한 JSON에 있으므로 이 파일은 편집 대상이 아니다 — 잡지 않는 것이 맞다.
 */
describe("code-dict — 실측에서 놓친 형태", () => {
  const NAMED_EXPORT = `import type { X } from '../types.js'

export const koTranslations: X = {
  authentication: {
    account: '계정',
    apiKey: 'API 키',
  },
}
`;

  it("명명된 export const 객체를 잡는다 (payloadcms/payload)", () => {
    const r = codeDict.read(base({ pathTemplate: "packages/translations/src/languages/{locale}.ts", locales: ["ko"] }), [
      f("packages/translations/src/languages/ko.ts", NAMED_EXPORT),
    ]);
    expect(r.locales[0]?.entries.map((e) => e.key)).toEqual(["authentication.account", "authentication.apiKey"]);
  });

  it("명명된 export도 수술적으로 치환된다", () => {
    const out = codeDict.write(
      base({
        pathTemplate: "packages/translations/src/languages/{locale}.ts",
        locales: ["ko"],
        currentFiles: [{ path: "packages/translations/src/languages/ko.ts", content: NAMED_EXPORT }],
      }),
      { locale: "ko", entries: [{ key: "authentication.account", message: "어카운트" }] },
    )!;
    expect(out).toContain("어카운트");
    expect(out).toContain("apiKey: 'API 키'");
  });

  it("camelCase 로케일 파일명을 인식한다 (naive-ui koKR.ts)", () => {
    const src = "const koKR = { name: 'ko-KR', global: { undo: '실행 취소' } }\nexport default koKR\n";
    const d = codeDict.detectCandidates(["src/locales/common/koKR.ts", "src/locales/common/enUS.ts"], () => src);
    expect(d[0]?.pathTemplate).toBe("src/locales/common/{locale}.ts");
    expect(d[0]?.locales.sort()).toEqual(["enUS", "koKR"]);
  });

  it("함수 호출로 감싼 default export는 잡지 않는다 — 문자열이 이 파일에 없다", () => {
    const src = "import article from './article/zh-CN.json'\nexport default flat({ article })\n";
    expect(codeDict.detectCandidates(["locale/zh-CN.ts", "locale/en-US.ts"], () => src)).toEqual([]);
  });

  it("객체 리터럴이 여럿이면 프로퍼티가 많은 쪽을 고른다 (결정적이어야 한다)", () => {
    const src = `export const small = { a: 'A' }
export const big = { a: 'A', b: 'B', c: 'C' }
`;
    const r = codeDict.read(base(), [f("src/locale/ko.ts", src)]);
    expect(r.locales[0]?.entries.map((e) => e.key)).toEqual(["a", "b", "c"]);
  });
});

/**
 * ⚠️ **문자열 값이 하나도 없는 객체는 카탈로그가 아니다** (실측 위양성 2건).
 *
 * `looksLikeLocale`이 이름만 보므로 `src/data/{fan,stt,tag,tts,usb}.ts`(home-assistant의 도메인
 * 모듈)나 `src/background/utils/{locale}.js`(violentmonkey)가 로케일로 잡혔다. 프로퍼티가 있는지만
 * 봤더니 함수·타입만 든 모듈이 통과해 **키 0개짜리 후보**가 됐다.
 */
describe("code-dict — 문자열 값이 없으면 카탈로그가 아니다", () => {
  it("함수·객체만 든 모듈은 잡지 않는다 (home-assistant src/data)", () => {
    const src = "export default { fetch: () => null, parse: (x: string) => x }\n";
    expect(codeDict.detectCandidates(["src/data/fan.ts", "src/data/tts.ts"], () => src)).toEqual([]);
  });

  it("중첩 안에 문자열이 있으면 잡는다", () => {
    const src = "export default { group: { ok: '확인' } }\n";
    expect(codeDict.detectCandidates(["src/locale/ko.ts", "src/locale/en.ts"], () => src)).toHaveLength(1);
  });

  it("빈 객체만이면 잡지 않는다", () => {
    expect(codeDict.detectCandidates(["src/locale/ko.ts", "src/locale/en.ts"], () => "export default {}\n")).toEqual([]);
  });
});

/**
 * 인용 부호 보존 — 2026-09-03 `i18n-format-check` PR #2에서 관측한 회귀.
 *
 * `write`가 편집된 값을 `JSON.stringify`로 써서 **작은따옴표 원본에서 편집한 줄만 큰따옴표**가
 * 됐다. 값은 정확하니 왕복 테스트는 전부 green이었고, 기존 write 테스트도 편집한 값의 **내용만**
 * 봤지 부호는 안 봤다 (`toContain("OK로 변경")`). Prettier `singleQuote`·ESLint `quotes`가 걸린
 * 리포에선 pull PR이 lint를 깨뜨린다.
 */
describe("code-dict — 원본의 인용 부호를 유지한다", () => {
  it("작은따옴표 원본에서 편집한 값도 작은따옴표다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "확인했습니다" }],
    })!;
    expect(out).toContain("ok: '확인했습니다'");
    expect(out).not.toContain('"확인했습니다"');
  });

  it("편집하지 않은 줄의 부호는 그대로다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "바뀐값" }],
    })!;
    expect(out).toContain("close: '닫기'");
    expect(out).toContain("clear: '초기화'");
  });

  it("큰따옴표 원본이면 큰따옴표를 쓴다", () => {
    const src = 'export default {\n  el: {\n    ok: "확인",\n  },\n}\n';
    const out = codeDict.write(withSource(src), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "확인했습니다" }],
    })!;
    expect(out).toContain('ok: "확인했습니다"');
  });

  it("작은따옴표 안의 `'`를 이스케이프하고 재파싱이 같은 값을 준다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "À l'instant" }],
    })!;
    expect(out).toContain("\\'");
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "el.ok")?.message).toBe("À l'instant");
  });

  it("이스케이프 안전성은 그대로다 — 작은따옴표에서도 `\"`·백슬래시·개행이 왕복한다", () => {
    const value = 'a"b\\c\nd';
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: value }],
    })!;
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "el.ok")?.message).toBe(value);
  });

  it("새로 삽입되는 키는 파일의 다수 부호를 따른다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.brandNew", message: "새 값" }],
    })!;
    expect(out).toContain("'새 값'");
    expect(out).not.toContain('"새 값"');
  });

  it("삽입해도 값이 왕복한다 — 부호를 바꿔도 이스케이프가 유지된다", () => {
    const out = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.brandNew", message: "it's \"quoted\"" }],
    })!;
    const back = codeDict.read(base(), [f("src/locale/ko.ts", out)]);
    expect(back.locales[0]!.entries.find((e) => e.key === "el.brandNew")?.message).toBe('it\'s "quoted"');
  });

  it("부호 유지가 바이트 고정점을 깨지 않는다 — 2차 write가 1차와 같다", () => {
    const first = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "확인했습니다" }],
    })!;
    const second = codeDict.write(withSource(first), {
      locale: "ko",
      entries: [{ key: "el.ok", message: "확인했습니다" }],
    })!;
    expect(second).toBe(first);
  });
});

/**
 * 삽입은 부호 판정의 입력을 바꾼다 — `dominantQuote`를 삽입 **전에** 세므로, 삽입된 리터럴이
 * 다음 호출의 카운트에 들어간다. 진동하면 2차 write가 1차와 달라져 blob 비교가 매번 "변경됨"을
 * 뱉는다 (ARCHITECTURE §1.1이 재생성 writer에 요구하는 것과 같은 위험).
 */
describe("code-dict — 삽입해도 부호 판정이 진동하지 않는다", () => {
  it("삽입 결과에 2차 write를 돌려도 바이트가 같다", () => {
    const first = codeDict.write(withSource(DEFAULT_OBJ), {
      locale: "ko",
      entries: [{ key: "el.brandNew", message: "새 값" }],
    })!;
    const second = codeDict.write(withSource(first), {
      locale: "ko",
      entries: [{ key: "el.brandNew", message: "새 값" }],
    })!;
    expect(second).toBe(first);
  });

  it("부호가 동수인 파일에서도 두 번째 삽입이 첫 번째와 같은 부호를 쓴다", () => {
    const even = `export default {\n  el: {\n    a: 'x',\n    b: "y",\n  },\n}\n`;
    const first = codeDict.write(withSource(even), {
      locale: "ko",
      entries: [{ key: "el.c", message: "1" }],
    })!;
    const second = codeDict.write(withSource(first), {
      locale: "ko",
      entries: [{ key: "el.c", message: "1" }, { key: "el.d", message: "2" }],
    })!;
    // 1차가 고른 부호가 2차에서도 유지된다 — 뒤집히면 c의 줄이 함께 바뀐다
    expect(second).toContain(first.match(/c: (.)1/)![1]! + "1");
  });

  it("점 키를 삽입할 때 키 이름도 값과 같은 부호를 쓴다", () => {
    const flat = `export default {\n  'common.ok': '확인',\n}\n`;
    const out = codeDict.write(withSource(flat), {
      locale: "ko",
      entries: [{ key: "common.new", message: "새 값" }],
    })!;
    expect(out).toContain("'common.new': '새 값'");
    expect(out).not.toContain('"common.new"');
  });
});

describe("code-dict — write도 read와 같은 구문 진단을 본다", () => {
  it("깨진 원본에는 치환하지 않고 원본 그대로 + 에러다 — read만 보던 진단이 write에 빠져 있었다 (2026-09-04 audit #9)", () => {
    const broken = "export default {\n  ok: '확인,\n  clear: '초기화',\n};\n";
    const res = codeDict.writeWithErrors!(
      { adapter: "code-dict", pathTemplate: "i18n/{locale}.ts", locales: ["ko"], currentFiles: [{ path: "i18n/ko.ts", content: broken }] },
      { locale: "ko", entries: [{ key: "clear", message: "지우기" }] },
    );
    expect(res.content).toBe(broken);
    expect(res.errors.some((e) => e.code === "write-parse-failed")).toBe(true);
  });
});

describe("code-dict — writeWithErrors", () => {
  it("default export 객체를 못 찾으면 원본을 돌려주되 에러로 알린다 — 조용히 '변경 없음'이 되면 PR에서 파일이 빠진다", () => {
    const src = "export const x = 1;\n";
    const res = codeDict.writeWithErrors!(
      { adapter: "code-dict", pathTemplate: "i18n/{locale}.ts", locales: ["ko"], currentFiles: [{ path: "i18n/ko.ts", content: src }] },
      { locale: "ko", entries: [{ key: "a", message: "x" }] },
    );
    expect(res.content).toBe(src);
    expect(res.errors).toHaveLength(1);
  });
});

describe("code-dict — 키 단위 스킵도 보고한다 (2026-09-04 audit #3)", () => {
  const fmtOf = (content: string): DetectedFormat => ({
    adapter: "code-dict",
    pathTemplate: "i18n/{locale}.ts",
    locales: ["ko"],
    currentFiles: [{ path: "i18n/ko.ts", content }],
  });

  it("문자열 리터럴이 아닌 자리는 건너뛰되 에러로 남긴다 — 조용히 버리면 어느 키를 잃었는지 모른다", () => {
    const res = codeDict.writeWithErrors!(fmtOf("export default {\n  a: someExpr,\n}\n"), {
      locale: "ko",
      entries: [{ key: "a", message: "값" }],
    });
    expect(res.content).toBe("export default {\n  a: someExpr,\n}\n");
    expect(res.errors.some((e) => e.code === "write-slot-not-string-literal" && e.key === "a")).toBe(true);
  });

  /**
   * ⚠️ **`write-slot-missing`이 아니다.** 중간 세그먼트가 객체가 아닌 키는 삽입 단계에 닿기 전에
   * `findScalar`가 `"not-a-literal"`로 잡는다 — 옛 단언은 `message.includes("a.deep")`이라 두 갈래를
   * 구별하지 못했다. 어느 코드가 실제로 나오는지가 화면 문구를 정하므로 여기서 고정한다.
   */
  it("문자열 자리를 객체로 덮어야 하는 삽입은 포기하되 에러로 남긴다", () => {
    const res = codeDict.writeWithErrors!(fmtOf('export default {\n  a: "leaf",\n}\n'), {
      locale: "ko",
      entries: [{ key: "a.deep", message: "값" }],
    });
    expect(res.errors.some((e) => e.code === "write-slot-not-string-literal" && e.key === "a.deep")).toBe(true);
  });

  it("정상 입력에는 에러가 없다", () => {
    const res = codeDict.writeWithErrors!(fmtOf('export default {\n  a: "old",\n}\n'), {
      locale: "ko",
      entries: [{ key: "a", message: "새 값" }],
    });
    expect(res.errors).toEqual([]);
    expect(res.content).toContain("새 값");
  });
});
