import { describe, expect, it } from "vitest";

import { planHoldNotice, planOpenPrGate, planProtectedImport } from "../plan";

/**
 * **화면이 말하는 보류 = 게이트가 실제로 하는 보류** (ux-drift-unify Q6 · 6-Y9 · 6-Y10). 입력은 게이트와 같다 — 미전달 수(`pendingWhere`로 센 값)와
 * 열린 PR 삼상태. 게이트 둘(`planProtectedImport`·`planOpenPrGate`)은 합치지 않고 그 위에 화면용 판정 하나를 얹는다.
 * ⚠️ 리포 값을 보지 않는다(불변식 2) — 표시일 뿐 게이트를 대신하지 않는다.
 */
const base = { pending: 0, openPr: null, gateApplies: true, archived: false, disconnected: false } as const;
const PR = "https://github.com/o/r/pull/7";

describe("planHoldNotice", () => {
  it.each([
    ["보관", { archived: true, pending: 3, openPr: PR }],
    ["끊김", { disconnected: true, pending: 3, openPr: PR }],
    ["끊김 + PR 조회 실패", { disconnected: true, openPr: undefined }],
  ] as const)("%s → null — 게이트보다 먼저 멈춘 상태다", (_label, over) => {
    expect(planHoldNotice({ ...base, ...over })).toBeNull();
  });

  it.each([
    ["편집 > 0", { pending: 2 }],
    ["편집 > 0 + PR 열림", { pending: 2, openPr: PR }],
    ["편집 > 0 + PR 조회 실패", { pending: 2, openPr: undefined }],
    ["gateApplies=false + 편집 > 0", { pending: 2, gateApplies: false }],
  ] as const)("%s → pending-edits — 게이트도 편집을 먼저 본다", (_label, over) => {
    expect(planHoldNotice({ ...base, ...over })).toEqual({ reason: "pending-edits" });
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

  /** 게이트와의 대응 — 연결·보관이 정상이면 `planHoldNotice`가 null인 것과 두 게이트가 모두 apply인 것이 같다. */
  it("정상 연결에서 표시와 게이트가 같은 결론이다", () => {
    for (const pending of [0, 1]) for (const openPr of [null, undefined, PR]) for (const gateApplies of [true, false]) {
      const notice = planHoldNotice({ ...base, pending, openPr, gateApplies });
      const edits = planProtectedImport({ mode: "auto", pending });
      const pr = gateApplies ? planOpenPrGate({ openPr }) : { action: "apply" as const };
      const reason = edits.action === "defer" ? edits.reason : pr.action === "defer" ? pr.reason : null;
      expect(notice?.reason ?? null).toBe(reason);
    }
  });
});
