import { describe, expect, it } from "vitest";

import { planOpenPrGate } from "../plan";

/**
 * 열린 Malmoi PR 게이트 (nightly-sync). 입력은 조회의 **삼상태**다 — `undefined`는 "확인 못 함"이고
 * `null`("PR 없음")과 다른 갈래다(POSTMORTEM 2026-09-03 — 실패한 조회를 "없음"으로 읽었다).
 */
describe("planOpenPrGate — 열린 PR이 있으면 적재 전체를 보류한다", () => {
  it("PR 없음(null) → apply", () => {
    expect(planOpenPrGate({ openPr: null })).toEqual({ action: "apply" });
  });

  it("열린 PR(url) → defer open-pr", () => {
    expect(planOpenPrGate({ openPr: "https://github.com/o/r/pull/7" })).toEqual({ action: "defer", reason: "open-pr" });
  });

  it("확인 못 함(undefined) → defer pr-check-failed — apply가 아니다", () => {
    expect(planOpenPrGate({ openPr: undefined })).toEqual({ action: "defer", reason: "pr-check-failed" });
  });

  it("빈 문자열도 url 자리의 값이다 — 없음으로 접지 않는다", () => {
    expect(planOpenPrGate({ openPr: "" })).toEqual({ action: "defer", reason: "open-pr" });
  });
});
