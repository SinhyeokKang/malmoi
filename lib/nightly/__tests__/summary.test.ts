import { describe, expect, it } from "vitest";

import type { PullItem } from "@/lib/pull/targets";

import { summarizeNightly } from "../summary";

/**
 * 야간 요약 한 줄 (nightly-sync). cron 응답은 200 배열이고 본문이 버려진다 — **전면 장애가 성공과 같은 관측값**이 되지 않게
 * (POSTMORTEM 2026-09-06) 갈래마다 카운터가 선다. 사건이 없는 갈래(`already-running`·예산 미방문·비교 대상 0)는 여기에만 남는다.
 *
 * ⚠️ 거부(`recorded: false`)는 **에러 코드별**로 센다 — 한 칸으로 접으면 "매일 밤 repo-replaced"가 다른 거부와 구별되지 않는다.
 */

const items: PullItem[] = [
  { slug: "p1", action: "publish", status: "committed", delivered: 2, prUrl: "https://github.com/o/r/pull/1" } as PullItem,
  { slug: "p2", action: "publish", status: "failed", error: "x", delivery: "not-started" },
  { slug: "i1", action: "import", recorded: true, result: "imported", deferReason: null },
  { slug: "i2", action: "import", recorded: true, result: "partial", deferReason: null },
  { slug: "i3", action: "import", recorded: true, result: "deferred", deferReason: "too-large" },
  { slug: "i4", action: "import", recorded: true, result: "deferred", deferReason: "pending-edits" },
  { slug: "i5", action: "import", recorded: true, result: "failed", deferReason: null },
  { slug: "i6", action: "import", recorded: true, result: "superseded", deferReason: null },
  { slug: "r1", action: "import", recorded: false, error: "already-running" },
  { slug: "r2", action: "import", recorded: false, error: "already-running" },
  { slug: "r3", action: "import", recorded: false, error: "repo-replaced" },
  { slug: "s1", action: "skip", outcome: "upToDate" },
  { slug: "s2", action: "skip", outcome: "deferred", reason: "open-pr" },
  { slug: "s3", action: "skip", outcome: "deferred", reason: "pr-check-failed" },
  { slug: "s4", action: "skip", outcome: "failed", reason: "base-unreadable" },
  { slug: "n1", action: "none", counter: "notReady" },
  { slug: "n2", action: "none", counter: "unprocessed" },
  { slug: "t1", status: "failed", error: "db down" },
];

describe("summarizeNightly", () => {
  const { counts, line } = summarizeNightly(items, 3);

  it("주 카운터 — 갈래마다", () => {
    expect(counts).toMatchObject({
      targets: items.length, published: 1, imported: 2, skipped: 2, deferred: 4, failed: 4, notReady: 1,
      // 예산 미방문 3 + 적재 시작 마감 1
      unprocessed: 4,
    });
  });

  it("세부 카운터 — 보류 사유별 · 거부 코드별 · 부분 · 대체", () => {
    expect(counts).toMatchObject({
      "deferred.too-large": 1, "deferred.pending-edits": 1, "deferred.open-pr": 1, "deferred.pr-check-failed": 1,
      "refused.already-running": 2, "refused.repo-replaced": 1, partial: 1, superseded: 1, "failed.base-unreadable": 1,
    });
  });

  it("로그 한 줄에 전부 싣는다 — 주 카운터는 0이어도 싣는다", () => {
    expect(line.startsWith("[pull] targets=18 published=1 imported=2 skipped=2 deferred=4 failed=4 notReady=1 unprocessed=4")).toBe(true);
    expect(line).toContain("refused.already-running=2");
    expect(line).toContain("deferred.too-large=1");
    expect(line.split("\n")).toHaveLength(1);
    expect(summarizeNightly([], 0).line).toBe("[pull] targets=0 published=0 imported=0 skipped=0 deferred=0 failed=0 notReady=0 unprocessed=0");
  });

  it("세부 키는 정렬 순서다 — 같은 밤이 같은 줄을 낸다", () => {
    const extras = line.split(" ").slice(9).map((part) => part.split("=")[0]);
    expect(extras).toEqual([...extras].sort());
  });
});
