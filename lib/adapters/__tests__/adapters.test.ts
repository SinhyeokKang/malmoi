import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { blobSha } from "../../githash";
import { chromeLocales, detectFormat, jsonCatalog, namespaceOf } from "../index";
import type { AdapterFile } from "../types";

const f = (path: string, content: string): AdapterFile => ({ path, content });

// ── 실제 리포에서 관측한 형태를 그대로 픽스처로 쓴다 ─────────────────────
/** bugshot-2: public/_locales/<loc>/messages.json */
const CHROME_EN = JSON.stringify(
  {
    EXT_NAME: { message: "BugShot — Bug Reporting in One Shot", description: "Extension name" },
    CMD_TOGGLE_PANEL: { message: "Open BugShot side panel" },
  },
  null,
  2,
);
/** skillflo: src/shared/i18n/locales/<loc>.json — flat 점 표기 */
const FLAT_EN = JSON.stringify({ "common.viewAll": "View all", "auth.login": "Log in" }, null, 2);
/** bugshot-web: src/lib/i18n/<loc>.json — 중첩 + 배열값 */
const NESTED_EN = JSON.stringify(
  { meta: { title: "BugShot" }, hero: { heading: "One Shot.", subcopy: ["a", "b"] } },
  null,
  2,
);

describe("detectFormat — 리포 파일 목록에서 포맷을 찾는다", () => {
  it("chrome _locales를 찾는다 (bugshot-2)", () => {
    const d = detectFormat([
      "package.json",
      "public/_locales/en/messages.json",
      "public/_locales/ko/messages.json",
      "public/_locales/fr/messages.json",
    ]);
    expect(d).toMatchObject({
      adapter: "chrome-locales",
      pathTemplate: "public/_locales/{locale}/messages.json",
    });
    expect(d?.locales.sort()).toEqual(["en", "fr", "ko"]);
  });

  it("json-catalog 디렉터리를 찾는다 (skillflo — 6로케일)", () => {
    const d = detectFormat([
      "src/shared/i18n/locales/en.json",
      "src/shared/i18n/locales/ko.json",
      "src/shared/i18n/locales/ja.json",
      "src/shared/i18n/locales/id.json",
      "src/shared/i18n/locales/zh-CN.json",
      "src/shared/i18n/locales/zh-TW.json",
      "src/shared/i18n/index.tsx",
    ]);
    expect(d).toMatchObject({
      adapter: "json-catalog",
      pathTemplate: "src/shared/i18n/locales/{locale}.json",
    });
    expect(d?.locales).toHaveLength(6);
    // 지역 서브태그가 붙은 코드도 로케일로 인정한다
    expect(d?.locales).toContain("zh-CN");
  });

  it("json-catalog 2로케일도 찾는다 (bugshot-web)", () => {
    const d = detectFormat(["src/lib/i18n/en.json", "src/lib/i18n/ko.json", "src/app/page.tsx"]);
    expect(d?.pathTemplate).toBe("src/lib/i18n/{locale}.json");
  });

  it("로케일 이름이 아닌 JSON 묶음은 잡지 않는다", () => {
    expect(detectFormat(["src/data/users.json", "src/data/posts.json"])).toBeUndefined();
  });

  it("로케일 파일이 하나뿐이면 잡지 않는다 (오탐 방지)", () => {
    expect(detectFormat(["config/en.json"])).toBeUndefined();
  });

  it("chrome _locales가 있으면 그쪽을 우선한다", () => {
    const d = detectFormat([
      "public/_locales/en/messages.json",
      "public/_locales/ko/messages.json",
      "src/lib/i18n/en.json",
      "src/lib/i18n/ko.json",
    ]);
    expect(d?.adapter).toBe("chrome-locales");
  });
});

describe("회귀 — 탐지가 무관한 JSON 묶음을 잡지 않는다", () => {
  // bugshot-web에서 `public/search/{locale}.json`(검색 인덱스, 최상위가 배열)이
  // `src/lib/i18n/{locale}.json`보다 먼저 잡혔다. 후보를 경로 사전순으로 고른 탓이다.
  const paths = [
    "public/search/en.json",
    "public/search/ko.json",
    "src/lib/i18n/en.json",
    "src/lib/i18n/ko.json",
  ];

  it("경로에 i18n 계열 이름이 있는 후보를 우선한다", () => {
    expect(detectFormat(paths)?.pathTemplate).toBe("src/lib/i18n/{locale}.json");
  });

  it("probe로 카탈로그 모양이 아닌 후보를 걸러낸다", () => {
    // i18n 신호가 없는 쪽만 남겨두고, 그 내용이 배열이면 탐지가 포기해야 한다.
    const onlySearch = ["public/search/en.json", "public/search/ko.json"];
    const probe = () => '[{"id":1},{"id":2}]';
    expect(detectFormat(onlySearch, probe)).toBeUndefined();
    // probe가 없으면 경로만 보고 잡는다 — 그래서 호출부가 probe를 줘야 한다.
    expect(detectFormat(onlySearch)).toMatchObject({ pathTemplate: "public/search/{locale}.json" });
  });

  it("리프가 숫자만인 JSON도 카탈로그가 아니다", () => {
    const paths2 = ["config/en.json", "config/ko.json"];
    expect(detectFormat(paths2, () => '{"timeout": 30, "retries": 3}')).toBeUndefined();
  });

  it("로케일이 많은 후보를 우선한다 (신호가 같을 때)", () => {
    const d = detectFormat([
      "a/i18n/en.json", "a/i18n/ko.json",
      "b/i18n/en.json", "b/i18n/ko.json", "b/i18n/ja.json", "b/i18n/fr.json",
    ]);
    expect(d?.pathTemplate).toBe("b/i18n/{locale}.json");
  });
});

describe("chrome-locales — read", () => {
  const format = { adapter: "chrome-locales" as const, pathTemplate: "public/_locales/{locale}/messages.json", locales: ["en"] };

  it("message와 description을 뽑는다", () => {
    const r = chromeLocales.read(format, [f("public/_locales/en/messages.json", CHROME_EN)]);
    expect(r.errors).toEqual([]);
    expect(r.locales[0]?.locale).toBe("en");
    expect(r.locales[0]?.entries).toEqual([
      { key: "CMD_TOGGLE_PANEL", message: "Open BugShot side panel" },
      { key: "EXT_NAME", message: "BugShot — Bug Reporting in One Shot", description: "Extension name" },
    ]);
  });

  it("message 필드가 없으면 에러다", () => {
    const r = chromeLocales.read(format, [
      f("public/_locales/en/messages.json", '{"BAD": {"description": "no message"}}'),
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toMatch(/message/);
  });

  it("JSON이 깨지면 에러다", () => {
    const r = chromeLocales.read(format, [f("public/_locales/en/messages.json", "{ not json")]);
    expect(r.errors).toHaveLength(1);
  });

  it("크롬이 허용하지 않는 키 이름은 에러다", () => {
    const r = chromeLocales.read(format, [
      f("public/_locales/en/messages.json", '{"common.ok": {"message": "OK"}}'),
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toMatch(/키 이름/);
  });
});

describe("chrome-locales — write (기존 lib/export.ts 규칙을 이어받는다)", () => {
  const format = { adapter: "chrome-locales" as const, pathTemplate: "public/_locales/{locale}/messages.json", locales: ["en"] };
  const w = (entries: Array<{ key: string; message: string; description?: string }>, isBase = true) =>
    chromeLocales.write(format, { locale: "en", isBase, entries });

  it("정렬·2칸·끝 개행 1개", () => {
    const out = w([{ key: "b_two", message: "B" }, { key: "a_one", message: "A" }])!;
    expect(out).toBe('{\n  "a_one": {\n    "message": "A"\n  },\n  "b_two": {\n    "message": "B"\n  }\n}\n');
  });

  it("같은 입력 두 번 → 바이트 동일", () => {
    const e = [{ key: "k_a", message: "A" }];
    expect(w(e)).toBe(w(e));
  });

  it("description은 base에만", () => {
    expect(w([{ key: "k_a", message: "A", description: "d" }], true)).toContain('"description": "d"');
    expect(w([{ key: "k_a", message: "A", description: "d" }], false)).not.toContain("description");
  });

  it("항목 0개면 null", () => {
    expect(w([])).toBeNull();
  });
});

describe("json-catalog — read", () => {
  const flat = { adapter: "json-catalog" as const, pathTemplate: "src/shared/i18n/locales/{locale}.json", locales: ["en"] };
  const nested = { adapter: "json-catalog" as const, pathTemplate: "src/lib/i18n/{locale}.json", locales: ["en"] };

  it("flat 점 표기를 그대로 읽는다 (skillflo)", () => {
    const r = jsonCatalog.read(flat, [f("src/shared/i18n/locales/en.json", FLAT_EN)]);
    expect(r.errors).toEqual([]);
    expect(r.locales[0]?.entries).toEqual([
      { key: "auth.login", message: "Log in" },
      { key: "common.viewAll", message: "View all" },
    ]);
  });

  it("중첩을 점으로 평탄화한다 (bugshot-web)", () => {
    const r = jsonCatalog.read(nested, [f("src/lib/i18n/en.json", NESTED_EN)]);
    expect(r.errors).toEqual([]);
    expect(r.locales[0]?.entries.map((e: { key: string }) => e.key)).toEqual([
      "hero.heading",
      "hero.subcopy.0",
      "hero.subcopy.1",
      "meta.title",
    ]);
  });

  it("배열은 인덱스 키로 펼친다 (각 문자열이 따로 번역돼야 한다)", () => {
    const r = jsonCatalog.read(nested, [f("src/lib/i18n/en.json", NESTED_EN)]);
    const sub = r.locales[0]?.entries.filter((e: { key: string }) => e.key.startsWith("hero.subcopy"));
    expect(sub).toEqual([
      { key: "hero.subcopy.0", message: "a" },
      { key: "hero.subcopy.1", message: "b" },
    ]);
  });

  it("문자열·배열이 아닌 리프는 에러다", () => {
    const r = jsonCatalog.read(flat, [f("src/shared/i18n/locales/en.json", '{"n": 42}')]);
    expect(r.errors).toHaveLength(1);
  });

  it("점 표기 키를 허용한다 (크롬 제약이 없다)", () => {
    const r = jsonCatalog.read(flat, [f("src/shared/i18n/locales/en.json", '{"a.b.c": "v"}')]);
    expect(r.errors).toEqual([]);
  });
});

describe("json-catalog — write", () => {
  const flat = { adapter: "json-catalog" as const, pathTemplate: "src/shared/i18n/locales/{locale}.json", locales: ["en"] };
  const nested = { adapter: "json-catalog" as const, pathTemplate: "src/lib/i18n/{locale}.json", locales: ["en"], nested: true };

  it("flat 포맷은 flat으로 되돌린다", () => {
    const out = jsonCatalog.write(flat, {
      locale: "en",
      isBase: true,
      entries: [{ key: "common.viewAll", message: "View all" }, { key: "auth.login", message: "Log in" }],
    })!;
    expect(out).toBe('{\n  "auth.login": "Log in",\n  "common.viewAll": "View all"\n}\n');
  });

  it("중첩 포맷은 중첩으로 복원한다 (배열 인덱스 포함)", () => {
    const out = jsonCatalog.write(nested, {
      locale: "en",
      isBase: true,
      entries: [
        { key: "hero.subcopy.0", message: "a" },
        { key: "hero.subcopy.1", message: "b" },
        { key: "meta.title", message: "T" },
      ],
    })!;
    expect(JSON.parse(out)).toEqual({ hero: { subcopy: ["a", "b"] }, meta: { title: "T" } });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("description은 버린다 (저장할 곳이 없다)", () => {
    const out = jsonCatalog.write(flat, {
      locale: "en",
      isBase: true,
      entries: [{ key: "a.b", message: "V", description: "설명" }],
    })!;
    expect(out).not.toContain("설명");
  });

  it("읽고 쓰면 원본으로 돌아온다 — read가 관측한 nested를 실어준다 (왕복)", () => {
    const cases = [
      { base: { adapter: "json-catalog" as const, pathTemplate: "src/shared/i18n/locales/{locale}.json", locales: ["en"] }, path: "src/shared/i18n/locales/en.json", content: FLAT_EN, expectNested: false },
      { base: { adapter: "json-catalog" as const, pathTemplate: "src/lib/i18n/{locale}.json", locales: ["en"] }, path: "src/lib/i18n/en.json", content: NESTED_EN, expectNested: true },
    ];
    for (const c of cases) {
      const r = jsonCatalog.read(c.base, [f(c.path, c.content)]);
      expect(r.errors).toEqual([]);
      expect(r.nested).toBe(c.expectNested);
      // detect는 경로만 보므로 nested를 모른다 — read가 관측한 값을 write에 실어야 한다.
      const out = jsonCatalog.write({ ...c.base, nested: r.nested }, {
        locale: "en",
        isBase: true,
        entries: r.locales[0]?.entries ?? [],
      })!;
      expect(JSON.parse(out)).toEqual(JSON.parse(c.content));
    }
  });

  it("nested를 안 실으면 flat으로 나간다 (왕복이 깨지는 경로를 명시적으로 고정)", () => {
    const base = { adapter: "json-catalog" as const, pathTemplate: "src/lib/i18n/{locale}.json", locales: ["en"] };
    const r = jsonCatalog.read(base, [f("src/lib/i18n/en.json", NESTED_EN)]);
    const out = jsonCatalog.write(base, { locale: "en", isBase: true, entries: r.locales[0]?.entries ?? [] })!;
    expect(JSON.parse(out)).toHaveProperty(["meta.title"]);
  });

  it("항목 0개면 null", () => {
    expect(jsonCatalog.write(flat, { locale: "en", isBase: true, entries: [] })).toBeNull();
  });
});

// ── lib/export.ts에서 이관 — 어댑터가 그 역할을 가져갔으므로 케이스도 함께 옮긴다 ──
/**
 * ⚠️ **결정성 규칙 자체는 여기 없다.** 정렬·들여쓰기·끝 개행·orphaned·빈 값·입력 순서는
 * `contract.test.ts`가 **`ADAPTERS`를 순회하며** 검사한다 — 여기서 어댑터를 손으로 열거하던
 * 시절엔 새 어댑터가 규칙을 하나도 안 지켜도 CI가 green이었다.
 *
 * 이 블록에 남은 것은 **일반화되지 않는 내용 인코딩**뿐이다: 어떤 문자가 어떻게 직렬화되는지는
 * 포맷마다 답이 달라 어댑터를 가로질러 단언할 수 없다.
 */
describe("writer 문자 인코딩 — json-catalog (일반 규칙은 contract.test.ts)", () => {
  const flat = { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", locales: ["en"] };

  it("따옴표·개행·역슬래시를 JSON으로 이스케이프한다", () => {
    const out = jsonCatalog.write(flat, {
      locale: "en", isBase: true, entries: [{ key: "k", message: 'a"b\\c\nd' }],
    })!;
    expect(JSON.parse(out)).toEqual({ k: 'a"b\\c\nd' });
  });

  it("한글·이모지를 \\u 이스케이프 없이 그대로 낸다", () => {
    const out = jsonCatalog.write(flat, {
      locale: "en", isBase: true, entries: [{ key: "k", message: "안녕 🎉" }],
    })!;
    expect(out).toContain("안녕 🎉");
    expect(out).not.toContain("\\u");
  });
});

describe("namespaceOf — 포맷이 둘이라 구분자가 둘이다", () => {
  it("밑줄 접두사 (chrome — 키에 점을 못 쓴다)", () => {
    expect(namespaceOf("popup_title")).toBe("popup");
    expect(namespaceOf("EXT_NAME_SHORT")).toBe("EXT");
  });

  it("점 표기 (json-catalog)", () => {
    expect(namespaceOf("common.viewAll")).toBe("common");
    expect(namespaceOf("hero.subcopy.0")).toBe("hero");
  });

  it("둘이 섞이면 먼저 나오는 구분자를 쓴다", () => {
    expect(namespaceOf("a_b.c")).toBe("a");
    expect(namespaceOf("a.b_c")).toBe("a");
  });

  it("구분자가 없거나 맨 앞이면 _root (빈 namespace를 만들지 않는다)", () => {
    expect(namespaceOf("EXTNAME")).toBe("_root");
    expect(namespaceOf("_private")).toBe("_root");
    expect(namespaceOf(".leading")).toBe("_root");
  });
});
