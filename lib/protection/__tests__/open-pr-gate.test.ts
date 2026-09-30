import { describe, expect, it } from "vitest";

import { openPrGateApplies, planOpenPrGate } from "../plan";

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

/**
 * **게이트가 서는가** — CI 게이트(`loadOpenPrForImportGate`)와 야간 판정(`runNightly`)이 **같은 이 판정**을 쓴다. 설치·리포 고정이 없으면
 * Malmoi가 PR을 낼 수 없으므로 열린 Malmoi PR도 없다 — `null`(게이트 없음)이고 조회하지 않는다. 확인 못 함(`undefined`)으로 읽으면
 * 고정 전 옛 행의 적재가 영구 보류된다.
 */
describe("openPrGateApplies", () => {
  it("둘 다 있으면 조회한다", () => expect(openPrGateApplies({ installationId: "1", repositoryId: "2" })).toBe(true));
  it.each([{ installationId: null, repositoryId: "2" }, { installationId: "1", repositoryId: null }, { installationId: null, repositoryId: null }])(
    "%o → 게이트 없음", (row) => expect(openPrGateApplies(row)).toBe(false),
  );
});
