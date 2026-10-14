import { describe, expect, it } from "vitest";

import { planBaseLocaleCandidate, planLocaleChange, type LocaleChangeInput, type LocaleChangeRequest, type LocaleTransition } from "../change-plan";
import type { LocaleChangeRow } from "../effects";

const surface = { id: "s1", slug: "i18n", adapterName: "json-catalog", pathTemplate: "src/i18n/{locale}.json", baseLocale: "en" } as const;

type State = { locales: { code: string; orphaned: boolean }[]; changes: LocaleChangeRow[] };
const initial: State = { locales: [{ code: "en", orphaned: false }, { code: "ko", orphaned: false }], changes: [] };

function input(request: LocaleChangeRequest, state: State = initial, overrides: Partial<LocaleChangeInput> = {}): LocaleChangeInput {
  return {
    request,
    canManage: true,
    projectArchived: false,
    publishUnsettled: false,
    surface,
    locales: state.locales,
    changes: state.changes,
    otherSurfaces: [],
    approval: "valid",
    ...overrides,
  };
}

/** 전이 표(design §1)를 테스트 쪽에서 그대로 옮긴 상태 갱신 — 판정이 고른 전이만 적용한다. */
function apply(state: State, transition: LocaleTransition): State {
  const without = (code: string) => state.changes.filter(row => row.localeCode !== code);
  const setOrphan = (code: string, orphaned: boolean) => {
    const rest = state.locales.filter(locale => locale.code !== code);
    return [...rest, { code, orphaned }];
  };
  switch (transition.kind) {
    case "add": return { locales: setOrphan(transition.code, false), changes: [...without(transition.code), { localeCode: transition.code, operation: "ADD" }] };
    case "cancel-add": return { locales: setOrphan(transition.code, true), changes: without(transition.code) };
    case "request-removal": return { locales: state.locales, changes: [...without(transition.code), { localeCode: transition.code, operation: "REMOVE" }] };
    case "cancel-removal": return { locales: state.locales, changes: without(transition.code) };
  }
}

function step(state: State, request: LocaleChangeRequest): State {
  const verdict = planLocaleChange(input(request, state));
  if (!verdict.ok) throw new Error(`refused: ${verdict.error}`);
  return apply(state, verdict.transition);
}

describe("planLocaleChange — transition table", () => {
  it("plain active + remove → REMOVE row, discarding that locale's pending edits", () => {
    expect(planLocaleChange(input({ kind: "remove", code: "ko" }))).toEqual({
      ok: true,
      transition: { kind: "request-removal", code: "ko", path: "src/i18n/ko.json", discardPending: true },
    });
  });

  it("missing + add → ADD row, create", () => {
    expect(planLocaleChange(input({ kind: "add", code: "fr" }))).toEqual({
      ok: true,
      transition: { kind: "add", code: "fr", action: "create", path: "src/i18n/fr.json" },
    });
  });

  it("orphan + add → ADD row, revive", () => {
    const state: State = { locales: [...initial.locales, { code: "fr", orphaned: true }], changes: [] };
    expect(planLocaleChange(input({ kind: "add", code: "fr" }, state))).toMatchObject({ ok: true, transition: { kind: "add", action: "revive" } });
  });

  it("ADD + remove → cancel the addition, discarding that locale's pending edits", () => {
    const state: State = { locales: [...initial.locales, { code: "fr", orphaned: false }], changes: [{ localeCode: "fr", operation: "ADD" }] };
    expect(planLocaleChange(input({ kind: "remove", code: "fr" }, state))).toEqual({
      ok: true,
      transition: { kind: "cancel-add", code: "fr", path: "src/i18n/fr.json", discardPending: true },
    });
  });

  it("REMOVE + cancel → delete the row, editing allowed again", () => {
    const state: State = { ...initial, changes: [{ localeCode: "ko", operation: "REMOVE" }] };
    expect(planLocaleChange(input({ kind: "cancel-removal", code: "ko" }, state))).toEqual({ ok: true, transition: { kind: "cancel-removal", code: "ko" } });
  });

  it("add → cancel → re-add ends with an ADD row on the revived locale", () => {
    let state = step(initial, { kind: "add", code: "fr" });
    state = step(state, { kind: "remove", code: "fr" });
    expect(state.changes).toEqual([]);
    expect(state.locales).toContainEqual({ code: "fr", orphaned: true });
    const verdict = planLocaleChange(input({ kind: "add", code: "fr" }, state));
    expect(verdict).toMatchObject({ ok: true, transition: { kind: "add", action: "revive" } });
  });

  it("remove → cancel → remove again requests removal again", () => {
    let state = step(initial, { kind: "remove", code: "ko" });
    state = step(state, { kind: "cancel-removal", code: "ko" });
    expect(state.changes).toEqual([]);
    expect(planLocaleChange(input({ kind: "remove", code: "ko" }, state))).toMatchObject({ ok: true, transition: { kind: "request-removal" } });
  });
});

describe("planLocaleChange — refusals write nothing", () => {
  const removing: State = { ...initial, changes: [{ localeCode: "ko", operation: "REMOVE" }] };
  const adding: State = { locales: [...initial.locales, { code: "fr", orphaned: false }], changes: [{ localeCode: "fr", operation: "ADD" }] };

  it.each<[string, LocaleChangeInput, string]>([
    ["EDITOR adds", input({ kind: "add", code: "fr" }, initial, { canManage: false }), "forbidden"],
    ["EDITOR removes", input({ kind: "remove", code: "ko" }, initial, { canManage: false }), "forbidden"],
    ["EDITOR cancels a removal", input({ kind: "cancel-removal", code: "ko" }, removing, { canManage: false }), "forbidden"],
    ["archived add", input({ kind: "add", code: "fr" }, initial, { projectArchived: true }), "archived"],
    ["archived cancel", input({ kind: "cancel-removal", code: "ko" }, removing, { projectArchived: true }), "archived"],
    ["unsettled publish add", input({ kind: "add", code: "fr" }, initial, { publishUnsettled: true }), "publish-unsettled"],
    ["unsettled publish remove", input({ kind: "remove", code: "ko" }, initial, { publishUnsettled: true }), "publish-unsettled"],
    ["unsettled publish cancel-add", input({ kind: "remove", code: "fr" }, adding, { publishUnsettled: true }), "publish-unsettled"],
    ["unsettled publish cancel-removal", input({ kind: "cancel-removal", code: "ko" }, removing, { publishUnsettled: true }), "publish-unsettled"],
    ["unsupported format remove", input({ kind: "remove", code: "ko" }, initial, { surface: { ...surface, adapterName: "yaml-catalog" } }), "unsupported-format"],
    ["base locale removal", input({ kind: "remove", code: "en" }), "base-locale"],
    ["remove a missing locale", input({ kind: "remove", code: "fr" }), "not-found"],
    ["remove an orphan locale", input({ kind: "remove", code: "fr" }, { ...initial, locales: [...initial.locales, { code: "fr", orphaned: true }] }), "not-found"],
    ["remove twice", input({ kind: "remove", code: "ko" }, removing), "removal-pending"],
    ["add over a pending removal", input({ kind: "add", code: "ko" }, removing), "removal-pending"],
    ["add twice", input({ kind: "add", code: "fr" }, adding), "already-active"],
    ["cancel a removal that does not exist", input({ kind: "cancel-removal", code: "ko" }), "no-removal"],
    ["cancel-removal on an ADD row", input({ kind: "cancel-removal", code: "fr" }, adding), "no-removal"],
    ["remove without approval", input({ kind: "remove", code: "ko" }, initial, { approval: "missing" }), "approval-required"],
    ["remove with a stale approval", input({ kind: "remove", code: "ko" }, initial, { approval: "stale" }), "stale-approval"],
    ["cancel-add with a stale approval", input({ kind: "remove", code: "fr" }, adding, { approval: "stale" }), "stale-approval"],
    ["add with an invalid code", input({ kind: "add", code: "../x" }), "invalid-code"],
    ["add __proto__", input({ kind: "add", code: "__proto__" }), "invalid-code"],
    ["remove __proto__", input({ kind: "remove", code: "__proto__" }), "not-found"],
    ["cancel __proto__", input({ kind: "cancel-removal", code: "__proto__" }), "no-removal"],
  ])("%s → %s", (_label, value, error) => {
    expect(planLocaleChange(value)).toEqual({ ok: false, error });
  });

  it("does not ask for approval on add or cancel-removal", () => {
    expect(planLocaleChange(input({ kind: "add", code: "fr" }, initial, { approval: "missing" }))).toMatchObject({ ok: true });
    expect(planLocaleChange(input({ kind: "cancel-removal", code: "ko" }, removing, { approval: "missing" }))).toMatchObject({ ok: true });
  });

  // 거부 순서: 상태 판정이 지문보다 앞이다 — 낡은 지문으로 "이미 제거 중"을 가리지 않는다.
  it("reports the state refusal before the approval", () => {
    expect(planLocaleChange(input({ kind: "remove", code: "en" }, initial, { approval: "stale" }))).toEqual({ ok: false, error: "base-locale" });
  });

  it("allows cancelling a removal on a source whose format is no longer supported", () => {
    const value = input({ kind: "cancel-removal", code: "ko" }, removing, { surface: { ...surface, adapterName: "yaml-catalog" } });
    expect(planLocaleChange(value)).toMatchObject({ ok: true });
  });

  it("does not treat a code with only a case difference as the same locale", () => {
    expect(planLocaleChange(input({ kind: "remove", code: "KO" }))).toEqual({ ok: false, error: "not-found" });
  });
});

describe("planBaseLocaleCandidate", () => {
  const locales = [{ code: "en", orphaned: false }, { code: "ko", orphaned: false }, { code: "fr", orphaned: false }, { code: "de", orphaned: true }];
  const changes: LocaleChangeRow[] = [{ localeCode: "fr", operation: "ADD" }, { localeCode: "ko", operation: "REMOVE" }];

  it.each([
    ["en", { ok: true }],
    ["fr", { ok: false, error: "locale-change-pending" }],
    ["ko", { ok: false, error: "locale-change-pending" }],
    ["de", { ok: false, error: "not-found" }],
    ["it", { ok: false, error: "not-found" }],
    ["__proto__", { ok: false, error: "not-found" }],
  ])("%s → %j", (code, expected) => {
    expect(planBaseLocaleCandidate(code, { locales, changes })).toEqual(expected);
  });
});
