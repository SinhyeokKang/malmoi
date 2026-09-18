import { describe, expect, it } from "vitest";

import { planPending } from "../pending";

/**
 * 설치 요청 대기 판정 (install-and-connect). **대기** = `Account(github-app).installRequestedAt`가 있고,
 * 그 시각 이후에 생긴 설치가 사용자 설치 목록에 없다.
 *
 * ⚠️ **거부 union(`OnboardError`)에 들어가지 않는다** — 대기는 `?e=`가 아니라 목록 판정에서 나온다
 * (POSTMORTEM 2026-09-06). 그래서 결과가 플래그 둘이다.
 */

const REQUESTED = new Date("2026-09-18T10:00:00Z");
const before = { id: "1", createdAt: new Date("2026-09-01T00:00:00Z") };
const after = { id: "2", createdAt: new Date("2026-09-18T11:00:00Z") };

describe("기록이 없으면 대기가 아니다", () => {
  it.each([
    { ok: true } as const,
    { ok: false, error: "no-installations" } as const,
    { ok: false, error: "no-repos" } as const,
  ])("%j", (listResult) => {
    expect(planPending({ listResult, requestedAt: null, installations: [before] })).toEqual({
      pending: false,
      clearRequest: false,
    });
  });
});

describe("기록 뒤에 생긴 설치가 보이면 승인됐다", () => {
  it("대기가 아니고 기록을 지운다", () => {
    expect(planPending({ listResult: { ok: true }, requestedAt: REQUESTED, installations: [before, after] })).toEqual({
      pending: false,
      clearRequest: true,
    });
  });

  it("승인된 설치에 리포가 0개여도 기록을 지운다 — 그 사람의 다음 일은 리포 선택(C)이다", () => {
    expect(
      planPending({ listResult: { ok: false, error: "no-repos" }, requestedAt: REQUESTED, installations: [after] }),
    ).toEqual({ pending: false, clearRequest: true });
  });

  it("같은 시각은 승인이 아니다 — 기록보다 **뒤**여야 한다", () => {
    const same = { id: "3", createdAt: new Date(REQUESTED) };
    expect(
      planPending({ listResult: { ok: false, error: "no-repos" }, requestedAt: REQUESTED, installations: [same] }),
    ).toEqual({ pending: true, clearRequest: false });
  });
});

describe("기록 앞 설치만 있으면 대기다", () => {
  it.each([
    { ok: true } as const,
    { ok: false, error: "no-installations" } as const,
    { ok: false, error: "no-repos" } as const,
  ])("%j → pending", (listResult) => {
    expect(planPending({ listResult, requestedAt: REQUESTED, installations: listResult.ok ? [before] : [] })).toEqual({
      pending: true,
      clearRequest: false,
    });
  });
});

describe("장애·토큰 상태는 기록과 무관하게 그대로다", () => {
  it.each(["unavailable", "reauthorize", "not-connected"])("%s", (error) => {
    expect(planPending({ listResult: { ok: false, error }, requestedAt: REQUESTED, installations: [] })).toEqual({
      pending: false,
      clearRequest: false,
    });
  });
});
