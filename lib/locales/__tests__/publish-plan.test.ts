import { describe, expect, it } from "vitest";

import type { LocaleChangeRow, LocaleEffect } from "../effects";
import { planLocalePublish, type LocalePublishInput } from "../publish-plan";

const TEMPLATE = "src/i18n/{locale}.json";
const path = (code: string) => `src/i18n/${code}.json`;

function base(...paths: string[]): LocalePublishInput["base"] {
  return { status: "read", files: new Map(paths.map(p => [p, "regular" as const])) };
}

function input(overrides: Partial<LocalePublishInput> = {}): LocalePublishInput {
  return {
    pathTemplate: TEMPLATE,
    changes: [],
    delivered: [],
    valueCounts: new Map(),
    base: base(path("en"), path("ko")),
    upsertPaths: [path("en"), path("ko")],
    foreignPaths: [],
    ...overrides,
  };
}

const add = (localeCode: string): LocaleChangeRow => ({ localeCode, operation: "ADD" });
const remove = (localeCode: string): LocaleChangeRow => ({ localeCode, operation: "REMOVE" });
const created = (localeCode: string): LocaleEffect => ({ localeCode, effect: "create" });
const deleted = (localeCode: string): LocaleEffect => ({ localeCode, effect: "delete" });

describe("planLocalePublish — operation × delivery × base", () => {
  it.each<[string, Partial<LocalePublishInput>, object]>([
    [
      "ADD · undelivered · absent → create",
      { changes: [add("fr")], valueCounts: new Map([["fr", 2]]) },
      { exclude: [], creates: [{ localeCode: "fr", path: path("fr") }], deletes: [], withheld: [], empty: [], captured: [created("fr")] },
    ],
    [
      "ADD · delivered · absent → create again (sync branch is rebuilt from base)",
      { changes: [add("fr")], delivered: [created("fr")], valueCounts: new Map([["fr", 2]]) },
      { exclude: [], creates: [{ localeCode: "fr", path: path("fr") }], deletes: [], withheld: [], empty: [], captured: [created("fr")] },
    ],
    [
      "ADD · undelivered · in base → withheld, only that locale",
      { changes: [add("fr")], valueCounts: new Map([["fr", 2]]), base: base(path("en"), path("fr")) },
      { exclude: ["fr"], creates: [], deletes: [], withheld: [{ localeCode: "fr", path: path("fr"), reason: "proposal-path-exists" }], empty: [], captured: [] },
    ],
    [
      "ADD · delivered · in base → rendered as an existing file",
      { changes: [add("fr")], delivered: [created("fr")], valueCounts: new Map([["fr", 2]]), base: base(path("en"), path("fr")) },
      { exclude: [], creates: [], deletes: [], withheld: [], empty: [], captured: [created("fr")] },
    ],
    [
      "REMOVE · undelivered · in base → delete",
      { changes: [remove("ko")] },
      { exclude: ["ko"], creates: [], deletes: [{ localeCode: "ko", path: path("ko") }], withheld: [], empty: [], captured: [deleted("ko")] },
    ],
    [
      "REMOVE · delivered · in base → delete again (kept on every snapshot)",
      { changes: [remove("ko")], delivered: [deleted("ko")] },
      { exclude: ["ko"], creates: [], deletes: [{ localeCode: "ko", path: path("ko") }], withheld: [], empty: [], captured: [deleted("ko")] },
    ],
    [
      "REMOVE · undelivered · absent → no diff item",
      { changes: [remove("ko")], base: base(path("en")) },
      { exclude: ["ko"], creates: [], deletes: [], withheld: [], empty: [], captured: [deleted("ko")] },
    ],
    [
      "REMOVE · delivered · absent → no diff item",
      { changes: [remove("ko")], delivered: [deleted("ko")], base: base(path("en")) },
      { exclude: ["ko"], creates: [], deletes: [], withheld: [], empty: [], captured: [deleted("ko")] },
    ],
  ])("%s", (_label, overrides, expected) => {
    const value = input(overrides);
    // 정규 렌더가 제외할 로케일의 경로는 upsert 목록에 오지 않는다 — 호출부가 exclude를 반영한 뒤의 목록이다.
    expect(planLocalePublish({ ...value, upsertPaths: value.upsertPaths.filter(p => !value.changes.some(row => path(row.localeCode) === p)) }))
      .toEqual({ ok: true, ...expected });
  });

  it("an empty ADD produces no file, is excluded from render, and is not captured", () => {
    expect(planLocalePublish(input({ changes: [add("fr")], valueCounts: new Map([["fr", 0]]) }))).toEqual({
      ok: true, exclude: ["fr"], creates: [], deletes: [], withheld: [], empty: ["fr"], captured: [],
    });
  });

  it("an unconfirmed delivery list treats an in-base ADD as undelivered", () => {
    const value = input({ changes: [add("fr")], delivered: null, valueCounts: new Map([["fr", 1]]), base: base(path("fr")), upsertPaths: [] });
    expect(planLocalePublish(value)).toMatchObject({ ok: true, withheld: [{ localeCode: "fr" }] });
  });

  it("sorts every list by code units", () => {
    const value = input({
      changes: [remove("ko"), add("zh_TW"), add("fr"), remove("de")],
      valueCounts: new Map([["zh_TW", 1], ["fr", 1]]),
      base: base(path("de"), path("ko")),
      upsertPaths: [path("en")],
    });
    const plan = planLocalePublish(value);
    expect(plan).toMatchObject({
      ok: true,
      exclude: ["de", "ko"],
      creates: [{ localeCode: "fr" }, { localeCode: "zh_TW" }],
      deletes: [{ localeCode: "de" }, { localeCode: "ko" }],
      captured: [deleted("de"), created("fr"), deleted("ko"), created("zh_TW")],
    });
  });

  it("is deterministic regardless of row order", () => {
    const rows = [remove("ko"), add("fr"), remove("de")];
    const a = planLocalePublish(input({ changes: rows, valueCounts: new Map([["fr", 1]]), base: base(path("de"), path("ko")), upsertPaths: [] }));
    const b = planLocalePublish(input({ changes: [...rows].reverse(), valueCounts: new Map([["fr", 1]]), base: base(path("de"), path("ko")), upsertPaths: [] }));
    expect(a).toEqual(b);
  });

  it("returns an empty plan without reading the base when there are no rows", () => {
    expect(planLocalePublish(input({ base: { status: "unreadable" } }))).toEqual({
      ok: true, exclude: [], creates: [], deletes: [], withheld: [], empty: [], captured: [],
    });
  });
});

describe("planLocalePublish — refusals", () => {
  // POSTMORTEM 2026-09-27 — 못 읽은 base는 파일 부재가 아니다. delete도 `no-changes`도 내지 않는다.
  it("refuses when the base could not be read", () => {
    expect(planLocalePublish(input({ changes: [remove("ko")], base: { status: "unreadable" } }))).toEqual({ ok: false, error: "base-unreadable" });
    expect(planLocalePublish(input({ changes: [add("fr")], valueCounts: new Map([["fr", 1]]), base: { status: "unreadable" } }))).toEqual({ ok: false, error: "base-unreadable" });
  });

  it("refuses a delete on a path the rest of the snapshot upserts", () => {
    expect(planLocalePublish(input({ changes: [remove("ko")], upsertPaths: [path("en"), path("ko")] })))
      .toEqual({ ok: false, error: "duplicate-path", path: path("ko") });
  });

  it("refuses a create on a path the rest of the snapshot upserts", () => {
    expect(planLocalePublish(input({ changes: [add("fr")], valueCounts: new Map([["fr", 1]]), upsertPaths: [path("fr")] })))
      .toEqual({ ok: false, error: "duplicate-path", path: path("fr") });
  });

  it("refuses two changes that resolve to the same path", () => {
    const value = input({ pathTemplate: "src/i18n/messages.json", changes: [remove("ko"), remove("en")], upsertPaths: [] });
    expect(planLocalePublish(value)).toEqual({ ok: false, error: "unsafe-path" });
    const shared = input({ pathTemplate: "src/{locale}.json", changes: [remove("ko"), add("ko")], upsertPaths: [], base: base("src/ko.json") });
    expect(planLocalePublish(shared)).toEqual({ ok: false, error: "duplicate-path", path: "src/ko.json" });
  });

  it("refuses a delete on a path another source owns", () => {
    expect(planLocalePublish(input({ changes: [remove("ko")], upsertPaths: [path("en")], foreignPaths: [path("ko")] })))
      .toEqual({ ok: false, error: "path-conflict", path: path("ko") });
  });

  it("refuses a create on a path another source owns", () => {
    expect(planLocalePublish(input({ changes: [add("fr")], valueCounts: new Map([["fr", 1]]), foreignPaths: [path("fr")] })))
      .toEqual({ ok: false, error: "path-conflict", path: path("fr") });
  });

  it("refuses to delete a non-regular file", () => {
    const value = input({ changes: [remove("ko")], upsertPaths: [], base: { status: "read", files: new Map([[path("ko"), "irregular"]]) } });
    expect(planLocalePublish(value)).toEqual({ ok: false, error: "irregular-file", path: path("ko") });
  });

  it.each([
    ["../{locale}.json", "ko"],
    [null, "ko"],
    [TEMPLATE, "__proto__"],
    [TEMPLATE, "../x"],
  ])("refuses template %j with code %s", (pathTemplate, code) => {
    expect(planLocalePublish(input({ pathTemplate, changes: [remove(code)], upsertPaths: [] }))).toEqual({ ok: false, error: "unsafe-path" });
  });

  it("reads __proto__ from the maps without prototype lookups", () => {
    const value = input({ pathTemplate: "_locales/{locale}/messages.json", changes: [add("fr")], valueCounts: new Map([["__proto__", 1]]), upsertPaths: [] });
    expect(planLocalePublish(value)).toMatchObject({ ok: true, empty: ["fr"] });
  });
});
