import { describe, expect, it } from "vitest";

import { jsonCatalog } from "@/lib/adapters/json-catalog";
import { localeFromPath } from "@/lib/adapters/chrome-locales";
import { CHROME_LOCALE_CODES } from "../chrome-codes";
import { localeCollisionKey, localeFilePath, planLocaleAdd, supportsLocaleChanges, type LocaleAddInput } from "../add-plan";

const json = { id: "s1", slug: "i18n", adapterName: "json-catalog", pathTemplate: "src/i18n/{locale}.json" } as const;
const chrome = { id: "s2", slug: "_locales", adapterName: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json" } as const;

function input(overrides: Partial<LocaleAddInput> = {}): LocaleAddInput {
  return {
    code: "fr",
    surface: json,
    locales: [{ code: "en", orphaned: false }, { code: "ko", orphaned: false }],
    otherSurfaces: [],
    ...overrides,
  };
}

describe("supportsLocaleChanges", () => {
  it.each([
    ["json-catalog", true],
    ["chrome-locales", true],
    ["yaml-catalog", true],
    ["code-dict", true],
    ["arb-catalog", true],
    ["apple-strings", true],
    ["ts-dict", false],
    [null, false],
    ["__proto__", false],
  ])("%s → %s", (adapter, expected) => expect(supportsLocaleChanges(adapter)).toBe(expected));
});

describe("localeCollisionKey", () => {
  it("folds case and separators", () => {
    expect(localeCollisionKey("pt-BR")).toBe(localeCollisionKey("pt_br"));
    expect(localeCollisionKey("zh_Hant-TW")).toBe("zhhanttw");
  });
});

describe("localeFilePath", () => {
  it("substitutes every {locale}", () => {
    expect(localeFilePath("_locales/{locale}/messages.json", "pt_BR")).toBe("_locales/pt_BR/messages.json");
    expect(localeFilePath("{locale}/{locale}.json", "fr")).toBe("fr/fr.json");
  });

  it.each([
    ["src/i18n/en.json", "fr"],
    ["../{locale}.json", "fr"],
    ["/abs/{locale}.json", "fr"],
    ["src/{locale}.json", "../x"],
    ["src/{locale}.json", "package"],
    ["src/{locale}.json", ""],
    ["src/{locale}.json", "__proto__"],
  ])("refuses template %s with code %s", (template, code) => {
    expect(localeFilePath(template, code)).toBeNull();
  });
});

describe("planLocaleAdd", () => {
  it("creates a new locale at the server-computed path", () => {
    expect(planLocaleAdd(input())).toEqual({ ok: true, action: "create", path: "src/i18n/fr.json" });
  });

  it("revives an orphaned locale of the same code", () => {
    expect(planLocaleAdd(input({ locales: [{ code: "en", orphaned: false }, { code: "fr", orphaned: true }] })))
      .toEqual({ ok: true, action: "revive", path: "src/i18n/fr.json" });
  });

  it.each([
    ["../x", "invalid-code"],
    ["package", "invalid-code"],
    ["", "invalid-code"],
    ["__proto__", "invalid-code"],
    ["constructor", "invalid-code"],
    ["en\n", "invalid-code"],
    [" fr", "invalid-code"],
    ["a".repeat(36), "invalid-code"],
    ["fr.json", "invalid-code"],
  ] as const)("rejects code %j as %s", (code, error) => {
    expect(planLocaleAdd(input({ code }))).toEqual({ ok: false, error });
  });

  // 모양은 맞아도 관측할 수 없는 코드는 거부한다(R-B2 R2) — 받는 가장 긴 모양은 언어 3자 + 서브태그 4자다.
  it("refuses a well-shaped but unobservable long code, accepts the longest observable one", () => {
    const code = `zh-${"Hant1234-".repeat(3)}TW`;
    expect(code.length).toBeLessThanOrEqual(35);
    expect(planLocaleAdd(input({ code }))).toEqual({ ok: false, error: "invalid-code" });
    expect(planLocaleAdd(input({ code: "fil-Latn" }))).toMatchObject({ ok: true, action: "create" });
  });

  it("rejects an already active code", () => {
    expect(planLocaleAdd(input({ code: "ko" }))).toEqual({ ok: false, error: "already-active" });
  });

  it.each([
    ["pt-BR", [{ code: "pt_br", orphaned: false }]],
    ["pt_br", [{ code: "pt-BR", orphaned: false }]],
    // 대문자 언어 부분(`PT-BR`·`EN`)은 이제 관측 불가로 먼저 거부된다 — 같은 충돌을 관측 가능한 철자로 잰다.
    ["pt_BR", [{ code: "pt-br", orphaned: true }]],
    ["en", [{ code: "EN", orphaned: false }]],
  ])("rejects %s as a collision with %j", (code, locales) => {
    expect(planLocaleAdd(input({ code, locales }))).toEqual({ ok: false, error: "locale-collision" });
  });

  it("rejects a revival that collides with another live spelling", () => {
    const locales = [{ code: "pt_BR", orphaned: true }, { code: "pt-br", orphaned: false }];
    expect(planLocaleAdd(input({ code: "pt_BR", locales }))).toEqual({ ok: false, error: "locale-collision" });
  });

  it.each(["ts-dict", null])("rejects unsupported format %s", adapterName => {
    expect(planLocaleAdd(input({ surface: { ...json, adapterName } }))).toEqual({ ok: false, error: "unsupported-format" });
  });

  it("checks the format before the code", () => {
    expect(planLocaleAdd(input({ code: "../x", surface: { ...json, adapterName: "ts-dict" } }))).toEqual({ ok: false, error: "unsupported-format" });
  });

  describe("chrome-locales", () => {
    it("accepts a documented code", () => {
      expect(planLocaleAdd(input({ code: "pt_BR", surface: chrome }))).toEqual({ ok: true, action: "create", path: "_locales/pt_BR/messages.json" });
    });

    it.each(["pt-BR", "zh_HK", "tlh", "__proto__"])("rejects %s outside the documented list", code => {
      expect(planLocaleAdd(input({ code, surface: chrome }))).toMatchObject({ ok: false });
      expect(planLocaleAdd(input({ code, surface: chrome })).ok).toBe(false);
    });

    it("names the list refusal for a well-shaped code", () => {
      expect(planLocaleAdd(input({ code: "zh_HK", surface: chrome }))).toEqual({ ok: false, error: "unsupported-locale" });
    });
  });

  it.each([
    ["src/i18n/en.json"],
    ["../i18n/{locale}.json"],
    [null],
  ])("rejects template %j as unsafe-path", pathTemplate => {
    expect(planLocaleAdd(input({ surface: { ...json, pathTemplate } }))).toEqual({ ok: false, error: "unsafe-path" });
  });

  it("rejects a path another source owns", () => {
    const otherSurfaces = [{ surfaceId: "s9", surfaceSlug: "legacy", paths: ["src/i18n/fr.json"] }];
    expect(planLocaleAdd(input({ otherSurfaces }))).toEqual({ ok: false, error: "path-conflict" });
  });

  it("does not refuse over an existing overlap between other sources", () => {
    const otherSurfaces = [
      { surfaceId: "s8", surfaceSlug: "a", paths: ["shared.json"] },
      { surfaceId: "s9", surfaceSlug: "b", paths: ["shared.json"] },
    ];
    expect(planLocaleAdd(input({ otherSurfaces }))).toMatchObject({ ok: true });
  });

  it("ignores the target surface if it appears among the owners", () => {
    const otherSurfaces = [{ surfaceId: json.id, surfaceSlug: json.slug, paths: ["src/i18n/fr.json"] }];
    expect(planLocaleAdd(input({ otherSurfaces }))).toMatchObject({ ok: true });
  });
});

/**
 * **추가 가능 코드 ⊆ 관측 가능 코드** (R-B2 🔴 R2). 관측·적재는 `looksLikeLocale`을 지난다 — 숫자·다중 서브태그(`es-419`·`zh-Hant-TW`)는 파일을
 * 만들어도 머지 뒤 관측되지 않아 만료가 orphan시킨다. 그래서 추가 입력에서 거부한다.
 */
describe("planLocaleAdd — addable codes are observable", () => {
  it.each(["es-419", "es_419", "zh-Hant-TW", "sr-Latn-RS", "de-CH-1996"])("json-catalog %s → invalid-code", code => {
    expect(planLocaleAdd(input({ code }))).toEqual({ ok: false, error: "invalid-code" });
  });

  // 생성 테스트 — 받는 코드는 전부 json-catalog `read`가 같은 코드로 되읽는다.
  const CANDIDATES = [...new Set([...CHROME_LOCALE_CODES, "fr", "pt-BR", "zh-Hant", "zh_Hans", "sr-Latn", "fil", "yue", "en-US", "zhCN", "es-419", "zh-Hant-TW", "x-pig", "art-lojban"])];
  it.each(CANDIDATES)("%s: accepted ⇒ round-trips through jsonCatalog.read", code => {
    const verdict = planLocaleAdd(input({ code }));
    if (!verdict.ok) return;
    const template = json.pathTemplate;
    expect(localeFromPath(template, verdict.path)).toBe(code);
    const read = jsonCatalog.read({ adapter: "json-catalog", pathTemplate: template, locales: [code] }, [{ path: verdict.path, content: '{"a":"A"}' }]);
    expect(read.locales.map(l => l.locale)).toEqual([code]);
  });
});
