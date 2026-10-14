import { describe, expect, it } from "vitest";

import { localeEffects, sameLocaleEffects, type LocaleChangeRow, type LocaleEffect } from "../effects";

const counts = (entries: [string, number][]) => new Map(entries);

describe("localeEffects", () => {
  it("maps ADD with values to create and REMOVE to delete", () => {
    const rows: LocaleChangeRow[] = [{ localeCode: "fr", operation: "ADD" }, { localeCode: "de", operation: "REMOVE" }];
    expect(localeEffects(rows, counts([["fr", 3]]))).toEqual([
      { localeCode: "de", effect: "delete" },
      { localeCode: "fr", effect: "create" },
    ]);
  });

  it("drops an ADD with zero values — it produces no file", () => {
    expect(localeEffects([{ localeCode: "fr", operation: "ADD" }], counts([["fr", 0]]))).toEqual([]);
    expect(localeEffects([{ localeCode: "fr", operation: "ADD" }], counts([]))).toEqual([]);
  });

  it("keeps REMOVE regardless of the value count", () => {
    expect(localeEffects([{ localeCode: "de", operation: "REMOVE" }], counts([]))).toEqual([{ localeCode: "de", effect: "delete" }]);
  });

  it("sorts by code units, not locale collation", () => {
    const rows: LocaleChangeRow[] = ["zh_TW", "en_US", "en", "Es", "es"].map(localeCode => ({ localeCode, operation: "REMOVE" }));
    expect(localeEffects(rows, counts([])).map(effect => effect.localeCode)).toEqual(["Es", "en", "en_US", "es", "zh_TW"]);
  });

  it("treats __proto__ as an ordinary code", () => {
    const rows: LocaleChangeRow[] = [{ localeCode: "__proto__", operation: "ADD" }, { localeCode: "constructor", operation: "ADD" }];
    expect(localeEffects(rows, counts([["__proto__", 1]]))).toEqual([{ localeCode: "__proto__", effect: "create" }]);
  });

  it("collapses duplicate rows of the same code into one effect", () => {
    const rows: LocaleChangeRow[] = [{ localeCode: "de", operation: "REMOVE" }, { localeCode: "de", operation: "REMOVE" }];
    expect(localeEffects(rows, counts([]))).toEqual([{ localeCode: "de", effect: "delete" }]);
  });
});

describe("sameLocaleEffects", () => {
  const delivered: LocaleEffect[] = [{ localeCode: "fr", effect: "create" }];

  it("ignores order and duplicates", () => {
    const a: LocaleEffect[] = [{ localeCode: "fr", effect: "create" }, { localeCode: "de", effect: "delete" }];
    const b: LocaleEffect[] = [{ localeCode: "de", effect: "delete" }, { localeCode: "fr", effect: "create" }, { localeCode: "fr", effect: "create" }];
    expect(sameLocaleEffects(a, b)).toBe(true);
  });

  it("distinguishes effect kind and code", () => {
    expect(sameLocaleEffects([{ localeCode: "fr", effect: "delete" }], delivered)).toBe(false);
    expect(sameLocaleEffects([{ localeCode: "fr_CA", effect: "create" }], delivered)).toBe(false);
  });

  // 전이 표의 핵심 두 줄 — 작업 = 현재 목록 ≠ 전달 목록.
  it("cancelling before delivery returns the current list to the delivered list", () => {
    const before = localeEffects([], counts([]));
    const afterAdd = localeEffects([{ localeCode: "fr", operation: "ADD" }], counts([["fr", 2]]));
    expect(sameLocaleEffects(afterAdd, before)).toBe(false);
    const afterCancel = localeEffects([], counts([["fr", 2]]));
    expect(sameLocaleEffects(afterCancel, before)).toBe(true);
  });

  it("cancelling after delivery leaves the current list different from the delivered list", () => {
    const deliveredAdd = localeEffects([{ localeCode: "fr", operation: "ADD" }], counts([["fr", 2]]));
    expect(sameLocaleEffects(localeEffects([], counts([["fr", 2]])), deliveredAdd)).toBe(false);
    const deliveredRemove = localeEffects([{ localeCode: "de", operation: "REMOVE" }], counts([]));
    expect(sameLocaleEffects(localeEffects([], counts([])), deliveredRemove)).toBe(false);
  });

  it("handles __proto__ codes without prototype lookups", () => {
    expect(sameLocaleEffects([{ localeCode: "__proto__", effect: "delete" }], [{ localeCode: "__proto__", effect: "delete" }])).toBe(true);
    expect(sameLocaleEffects([{ localeCode: "__proto__", effect: "delete" }], [])).toBe(false);
  });
});
