import { describe, expect, it } from "vitest";

import { countCards } from "../cards";
import { lastSyncTime } from "../sync-time";

/**
 * malmoi#81 — Home의 `Last sync`·`synced …`는 **malmoi가 마지막으로 성공 적재한 시각**(`lastImportedAt`)이다.
 * `lastCommitAt`은 리포 커밋 시각이라, 오래된 커밋을 적재한 방금의 Sync가 "13 days ago"로 읽혔다.
 *
 * ⚠️ **backfill이 없다** (ARCHITECTURE — `lastImportedAt` 절) — 그 컬럼 이전의 성공은 적재됐는데 시각이 없다.
 * 그 자리를 `lastCommitAt`으로 메우지 않고 "기록 없음"으로 가른다: `null`(한 번도 안 적재)과 다른 사실이다.
 */
const at = (iso: string): Date => new Date(iso);

describe("lastSyncTime", () => {
  it("커밋 시각이 아니라 적재 시각의 최댓값이다", () => {
    expect(lastSyncTime([
      { lastImportedAt: at("2026-09-22T22:03:00Z"), lastCommitAt: at("2026-09-10T05:45:00Z") },
      { lastImportedAt: at("2026-09-20T00:00:00Z"), lastCommitAt: at("2026-09-23T00:00:00Z") },
    ])).toEqual(at("2026-09-22T22:03:00Z"));
  });

  it("적재된 적 없으면 null이다", () => {
    expect(lastSyncTime([{ lastImportedAt: null, lastCommitAt: null }])).toBeNull();
    expect(lastSyncTime([])).toBeNull();
  });

  it("적재됐는데 시각이 없으면(컬럼 이전) 커밋 시각으로 메우지 않고 unrecorded다", () => {
    expect(lastSyncTime([{ lastImportedAt: null, lastCommitAt: at("2026-09-10T05:45:00Z") }])).toBe("unrecorded");
  });
});

describe("시각이 기록되지 않은 Sync", () => {
  it("카드는 'not synced yet'이 아니라 시각 없는 문장이다", () => {
    const cards = countCards({ state: "default", counts: { newFromGithub: 1, toTranslate: 0, toReview: 0, toSend: 0 }, surfaces: 1, keys: 1, lastSyncAt: "unrecorded", reviewByLocale: [], hold: null });
    expect(cards.find((c) => c.key === "newFromGithub")?.subline).toEqual({ kind: "asOfLastSync" });
  });
});
