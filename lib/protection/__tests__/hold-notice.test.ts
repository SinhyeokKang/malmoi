import { describe, expect, it } from "vitest";

import { planLocaleImportGate } from "@/lib/push/locale-gate";
import type { LocaleWorkItem } from "@/lib/locales/work";

import { planHoldNotice, planOpenPrGate, planProtectedImport } from "../plan";

/**
 * **화면이 말하는 보류 = 게이트가 실제로 하는 보류** (ux-drift-unify Q6 · 6-Y9 · 6-Y10). 입력은 게이트와 같다 — 미전달 수(`pendingWhere`로 센 값)와
 * 열린 PR 삼상태. 게이트 둘(`planProtectedImport`·`planOpenPrGate`)은 합치지 않고 그 위에 화면용 판정 하나를 얹는다.
 * ⚠️ 리포 값을 보지 않는다(불변식 2) — 표시일 뿐 게이트를 대신하지 않는다.
 */
const base = { pending: 0, localeHeld: false, openPr: null, gateApplies: true, archived: false, disconnected: false } as const;
const PR = "https://github.com/o/r/pull/7";

describe("planHoldNotice", () => {
  it.each([
    ["보관", { archived: true, pending: 3, openPr: PR }],
    ["끊김", { disconnected: true, pending: 3, openPr: PR }],
    ["끊김 + PR 조회 실패", { disconnected: true, openPr: undefined }],
    ["보관 + 전달 전 언어 제거", { archived: true, localeHeld: true }],
    ["끊김 + 전달 전 언어 제거", { disconnected: true, localeHeld: true }],
  ] as const)("%s → null — 게이트보다 먼저 멈춘 상태다", (_label, over) => {
    expect(planHoldNotice({ ...base, ...over })).toBeNull();
  });

  it.each([
    ["편집 > 0", { pending: 2 }],
    ["편집 > 0 + PR 열림", { pending: 2, openPr: PR }],
    ["편집 > 0 + PR 조회 실패", { pending: 2, openPr: undefined }],
    ["gateApplies=false + 편집 > 0", { pending: 2, gateApplies: false }],
    ["편집 > 0 + 전달 전 언어 제거", { pending: 2, localeHeld: true, openPr: PR }],
  ] as const)("%s → pending-edits — 게이트도 편집을 먼저 본다", (_label, over) => {
    expect(planHoldNotice({ ...base, ...over })).toEqual({ reason: "pending-edits" });
  });

  /**
   * 전달 전 언어 제거(language-request-todo design §5) — `/api/push`가 미전달 편집 다음, 열린 PR 앞에 거는 게이트다. PR 조회 결과·게이트 유무와
   * 무관하므로 호출부는 PR을 조회하지 않아도 된다(malmoi#107).
   */
  it.each([
    ["PR 없음", { openPr: null }],
    ["PR 열림", { openPr: PR }],
    ["PR 조회 실패", { openPr: undefined }],
    ["PR 게이트 없음", { gateApplies: false, openPr: undefined }],
  ] as const)("편집 0 + 전달 전 언어 제거 + %s → locale-change-pending", (_label, over) => {
    expect(planHoldNotice({ ...base, localeHeld: true, ...over })).toEqual({ reason: "locale-change-pending" });
  });

  it("편집 0 + PR 열림 → open-pr", () => {
    expect(planHoldNotice({ ...base, openPr: PR })).toEqual({ reason: "open-pr" });
  });

  /** 게이트가 fail-closed라 실제로 보류다 — "없음"으로 말하면 적재가 왜 안 들어오는지 화면에 답이 없다. */
  it("편집 0 + PR 조회 실패 → pr-check-failed", () => {
    expect(planHoldNotice({ ...base, openPr: undefined })).toEqual({ reason: "pr-check-failed" });
  });

  it("편집 0 + gateApplies=false → null — PR 조회 결과를 보지 않는다", () => {
    expect(planHoldNotice({ ...base, gateApplies: false, openPr: PR })).toBeNull();
    expect(planHoldNotice({ ...base, gateApplies: false, openPr: undefined })).toBeNull();
  });

  it("편집 0 + PR 없음 → null", () => {
    expect(planHoldNotice(base)).toBeNull();
  });

  /**
   * 게이트와의 대응 — 보관·끊김을 뺀 **모든 입력 조합**에서 표시가 게이트 셋을 `/api/push` 순서(미전달 편집 → 언어 게이트 → 열린 PR)로 지난 결론과
   * 같다. 언어 축은 실제 작업 목록을 게이트 함수에 넣어 만든다 — `localeHeld`를 손으로 정하면 표가 게이트의 술어를 재지 않는다.
   */
  it("정상 연결에서 표시와 게이트 셋이 같은 결론이다 — 전수", () => {
    const works: LocaleWorkItem[][] = [
      [],
      [{ localeCode: "fr", current: "create", delivered: null }],
      [{ localeCode: "ko", current: null, delivered: "delete" }],
      [{ localeCode: "ko", current: "delete", delivered: null }],
      [{ localeCode: "fr", current: "create", delivered: null }, { localeCode: "ko", current: "delete", delivered: "create" }],
    ];
    let cases = 0;
    const seen = new Set<string | null>();
    for (const pending of [0, 1]) for (const work of works) for (const openPr of [null, undefined, PR]) for (const gateApplies of [true, false]) {
      const locale = planLocaleImportGate([{ work }]);
      const notice = planHoldNotice({ ...base, pending, localeHeld: locale.action === "defer", openPr, gateApplies });
      const edits = planProtectedImport({ mode: "auto", pending });
      const pr = gateApplies ? planOpenPrGate({ openPr }) : { action: "apply" as const };
      const reason = edits.action === "defer" ? edits.reason : locale.action === "defer" ? locale.reason : pr.action === "defer" ? pr.reason : null;
      expect(notice?.reason ?? null).toBe(reason);
      seen.add(reason);
      cases++;
    }
    expect(cases).toBe(60);
    expect([...seen].sort()).toEqual(["locale-change-pending", "open-pr", "pending-edits", "pr-check-failed", null].sort());
  });
});
