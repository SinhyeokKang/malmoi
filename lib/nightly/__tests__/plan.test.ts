import { describe, expect, it } from "vitest";

import { NIGHTLY_IMPORT_START_MS, PULL_TIME_BUDGET_MS } from "@/lib/pull/targets";

import { planNightly, type NightlyInput } from "../plan";

/**
 * 야간 판정 (nightly-sync design "야간 판정 순서"). 껍데기는 `need`를 받을 때마다 조회해 다시 부른다 —
 * 그래서 "무엇을 **묻지 않는가**"(pending > 0이면 head를 요구하지 않는다)가 GitHub 호출 수의 계약이다.
 *
 * ⚠️ **실패를 "같은 head"·"PR 없음"으로 읽는 갈래가 없다** — `head: { ok: false }`·`sha: null`은 base-unreadable,
 * `openPr.url: undefined`는 pr-check-failed다(POSTMORTEM 2026-09-03).
 */

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

const surface = (over: Partial<NightlyInput["surfaces"][number]> = {}): NightlyInput["surfaces"][number] => ({
  active: true,
  formatComplete: true,
  lastCommitSha: OLD,
  ...over,
});

const input = (over: Partial<NightlyInput> = {}): NightlyInput => ({
  pending: 0,
  surfaces: [surface()],
  elapsedMs: 0,
  ...over,
});

describe("planNightly — 미전달 편집이 있으면 Publish", () => {
  it("pending > 0 → publish", () => {
    expect(planNightly(input({ pending: 3 }))).toEqual({ action: "publish" });
  });

  it("pending > 0이면 head를 요구하지 않는다 — need가 아니다(GitHub 0회)", () => {
    const plan = planNightly(input({ pending: 1 }));
    expect(plan.action).not.toBe("need");
  });

  it("pending > 0이면 비교 대상이 0개여도 publish다 — notReady로 새지 않는다", () => {
    expect(planNightly(input({ pending: 1, surfaces: [] }))).toEqual({ action: "publish" });
  });
});

describe("planNightly — 비교 대상 표면", () => {
  it("비교 대상 0개 → none notReady (빈 배열의 every가 upToDate로 새지 않는다)", () => {
    expect(planNightly(input({ surfaces: [], head: { ok: true, sha: HEAD } }))).toEqual({ action: "none", counter: "notReady" });
  });

  it("보관·포맷 불완전·lastCommitSha null 표면만 있으면 notReady", () => {
    const surfaces = [
      surface({ active: false, lastCommitSha: HEAD }),
      surface({ formatComplete: false }),
      surface({ lastCommitSha: null }),
    ];
    expect(planNightly(input({ surfaces }))).toEqual({ action: "none", counter: "notReady" });
  });

  it("제외된 표면의 낡은 sha는 비교에 안 들어간다 — 나머지가 head와 같으면 upToDate", () => {
    const surfaces = [
      surface({ lastCommitSha: HEAD }),
      surface({ active: false, lastCommitSha: OLD }),
      surface({ formatComplete: false, lastCommitSha: OLD }),
      surface({ lastCommitSha: null }),
    ];
    expect(planNightly(input({ surfaces, head: { ok: true, sha: HEAD } }))).toEqual({ action: "skip", outcome: "upToDate" });
  });
});

describe("planNightly — base head", () => {
  it("head를 아직 모르면 need head", () => {
    expect(planNightly(input())).toEqual({ action: "need", input: "head" });
  });

  it("head 조회 throw({ ok: false }) → skip failed base-unreadable", () => {
    expect(planNightly(input({ head: { ok: false } }))).toEqual({ action: "skip", outcome: "failed", reason: "base-unreadable" });
  });

  it("base 브랜치 없음(sha null) → skip failed base-unreadable — upToDate가 아니다", () => {
    const surfaces = [surface({ lastCommitSha: HEAD })];
    expect(planNightly(input({ surfaces, head: { ok: true, sha: null } }))).toEqual({
      action: "skip",
      outcome: "failed",
      reason: "base-unreadable",
    });
  });

  it("비교 대상 전부 head와 같음 → skip upToDate (PR 조회를 요구하지 않는다)", () => {
    const surfaces = [surface({ lastCommitSha: HEAD }), surface({ lastCommitSha: HEAD })];
    expect(planNightly(input({ surfaces, head: { ok: true, sha: HEAD } }))).toEqual({ action: "skip", outcome: "upToDate" });
  });

  it("하나라도 다르면 적재 쪽 — 먼저 열린 PR을 묻는다", () => {
    const surfaces = [surface({ lastCommitSha: HEAD }), surface({ lastCommitSha: OLD })];
    expect(planNightly(input({ surfaces, head: { ok: true, sha: HEAD } }))).toEqual({ action: "need", input: "open-pr" });
  });
});

describe("planNightly — 열린 PR 게이트", () => {
  const moved = { head: { ok: true, sha: HEAD } } as const;

  it("조회 실패·마감(url undefined) → skip deferred pr-check-failed", () => {
    expect(planNightly(input({ ...moved, openPr: { url: undefined } }))).toEqual({
      action: "skip",
      outcome: "deferred",
      reason: "pr-check-failed",
    });
  });

  it("열린 PR → skip deferred open-pr", () => {
    expect(planNightly(input({ ...moved, openPr: { url: "https://github.com/o/r/pull/1" } }))).toEqual({
      action: "skip",
      outcome: "deferred",
      reason: "open-pr",
    });
  });

  it("PR 없음 → import", () => {
    expect(planNightly(input({ ...moved, openPr: { url: null } }))).toEqual({ action: "import" });
  });
});

describe("planNightly — 적재 시작 마감", () => {
  const ready = { head: { ok: true, sha: HEAD }, openPr: { url: null } } as const;

  it("경과가 마감을 넘으면 none unprocessed — 적재를 시작하지 않는다", () => {
    expect(planNightly(input({ ...ready, elapsedMs: NIGHTLY_IMPORT_START_MS + 1 }))).toEqual({ action: "none", counter: "unprocessed" });
  });

  it("마감과 같으면 아직 시작한다", () => {
    expect(planNightly(input({ ...ready, elapsedMs: NIGHTLY_IMPORT_START_MS }))).toEqual({ action: "import" });
  });

  it("마감은 적재 갈래만 막는다 — 스킵 사건(upToDate)은 마감 뒤에도 선다", () => {
    const surfaces = [surface({ lastCommitSha: HEAD })];
    expect(planNightly(input({ surfaces, head: { ok: true, sha: HEAD }, elapsedMs: NIGHTLY_IMPORT_START_MS * 10 }))).toEqual({
      action: "skip",
      outcome: "upToDate",
    });
  });

  it("마감은 Publish를 막지 않는다 — 루프 예산(`PULL_TIME_BUDGET_MS`)의 몫이다", () => {
    expect(planNightly(input({ pending: 1, elapsedMs: NIGHTLY_IMPORT_START_MS * 10 }))).toEqual({ action: "publish" });
  });
});

/**
 * ⚠️ **마감을 넘긴 방문은 PR을 묻지 않는다** (r2 — GitHub 장애 밤의 `maxDuration` 초과). 루프 예산은 방문 **시작 전**에만 재므로, 45초 가까이
 * 시작한 방문이 head 대기 8초 + PR 대기 8초를 더 쓰면 함수가 죽어 요약이 사라진다. 마감 뒤의 PR 조회는 어차피 보류·미처리만 낳는다.
 */
describe("planNightly — 마감 뒤에는 PR 조회를 요구하지 않는다", () => {
  it("head가 다르고 경과가 마감을 넘었으면 need open-pr 대신 none unprocessed", () => {
    expect(planNightly(input({ head: { ok: true, sha: HEAD }, elapsedMs: NIGHTLY_IMPORT_START_MS + 1 }))).toEqual({ action: "none", counter: "unprocessed" });
  });

  it("마감 안이면 그대로 PR을 묻는다 (짝)", () => {
    expect(planNightly(input({ head: { ok: true, sha: HEAD }, elapsedMs: NIGHTLY_IMPORT_START_MS }))).toEqual({ action: "need", input: "open-pr" });
  });

  it("head를 못 읽은 방문은 마감 뒤에도 base-unreadable 사건이다 — 이미 쓴 대기의 결과를 버리지 않는다", () => {
    expect(planNightly(input({ head: { ok: false }, elapsedMs: NIGHTLY_IMPORT_START_MS * 2 }))).toEqual({ action: "skip", outcome: "failed", reason: "base-unreadable" });
  });
});

describe("NIGHTLY_IMPORT_START_MS", () => {
  it("루프 예산보다 이르다 — 표면 트랜잭션(30s)이 maxDuration(60s)을 뚫지 않게 먼저 끊는다", () => {
    expect(NIGHTLY_IMPORT_START_MS).toBe(20_000);
    expect(NIGHTLY_IMPORT_START_MS).toBeLessThan(PULL_TIME_BUDGET_MS);
  });
});
