import { describe, expect, it } from "vitest";

import { summaryQueue } from "@/lib/projects/list";

import { countCards } from "../cards";

/**
 * 카운트 카드 넷 (캔버스 `2a`). **수와 문구는 이미 있는 것을 쓴다** — 값은 `summaryQueue`,
 * 제목은 `m.projects.summary.*`다 (project-home design §2). 여기서 새로 정하는 것은 **보조 줄**과
 * **0 갈래**뿐이고, 그 둘이 상태마다 갈리는 규칙이 이 함수 하나에 든다.
 */

const at = (iso: string): Date => new Date(iso);

const counts = { newFromGithub: 3, toTranslate: 12, toReview: 8, toSend: 24 };
const base = {
  state: "default" as const,
  counts,
  surfaces: 3,
  keys: 903,
  lastSyncAt: at("2026-09-14T00:00:00Z"),
  lastPublishedAt: at("2026-09-13T00:00:00Z"),
  reviewByLocale: [{ code: "en", count: 5 }, { code: "ja", count: 3 }],
};

const card = (input: Parameters<typeof countCards>[0], key: string) =>
  countCards(input).find((c) => c.key === key);

describe("countCards — 순서가 파이프라인이다", () => {
  it("유입 → 번역 → 검토 → 발송 순이고 목록 화면과 같은 키를 쓴다", () => {
    expect(countCards(base).map((c) => c.key)).toEqual(["newFromGithub", "toTranslate", "toReview", "toSend"]);
  });

  it("값은 summaryQueue의 것을 그대로 낸다 — 두 번째 집계 경로를 만들지 않는다", () => {
    expect(countCards(base).map((c) => c.value)).toEqual([3, 12, 8, 24]);
  });

  /**
   * ⚠️ **첫 칸만 단위가 keys다** (spec §7.1). 보조 줄이 그 사실을 말하지 않으면 화면이 서로 다른
   * 단위 넷을 나란히 세워 놓고 같은 모집단인 척한다.
   */
  it("첫 칸은 keys이고 나머지 셋은 cells다", () => {
    expect(countCards(base).map((c) => c.unit)).toEqual(["keys", "cells", "cells", "cells"]);
  });

  /** 색은 둘뿐이다 — 유입의 파랑과 검토의 amber. 파랑 다섯 자리 중 하나가 이것이다 (spec §3.3-9). */
  it("유입은 파랑, 검토는 amber, 나머지는 색이 없다", () => {
    expect(countCards(base).map((c) => c.tone)).toEqual(["accent", null, "warning", null]);
  });

  /**
   * ⚠️ **목록 화면의 띠와 다른 규칙이다** (design §5.2). 저쪽은 라벨이 이미 muted라 글리프가 그 색을
   * 상속하지만, 카드는 수치가 24/500 `#0a0a0a`라 0을 흐리는 규칙이 새로 필요하다.
   */
  it("값이 0이면 수치·글리프가 흐려지고 색이 빠진다", () => {
    const zero = { ...base, counts: { newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: 0 }, state: "empty" as const };
    expect(countCards(zero).map((c) => c.muted)).toEqual([true, true, true, true]);
    expect(countCards(zero).map((c) => c.tone)).toEqual([null, null, null, null]);
    expect(countCards(base).map((c) => c.muted)).toEqual([false, false, false, false]);
  });
});

describe("countCards — 보조 줄이 그 수의 기준을 말한다", () => {
  it("기본: 마지막 Sync 시각 · 표면 수 · 로케일 분해 · 마지막 Publish", () => {
    expect(countCards(base).map((c) => c.subline)).toEqual([
      { kind: "synced", at: at("2026-09-14T00:00:00Z") },
      { kind: "acrossSurfaces", surfaces: 3 },
      { kind: "reviewByLocale", locales: [{ code: "en", count: 5 }, { code: "ja", count: 3 }] },
      { kind: "lastPublish", at: at("2026-09-13T00:00:00Z") },
    ]);
  });

  /** ⚠️ **표면이 하나면 `across 3 surfaces`가 거짓이다** — 그 줄이 사라진다 (spec §9.5-4). */
  it("표면이 하나면 표면 수를 말하지 않는다", () => {
    expect(card({ ...base, surfaces: 1 }, "toTranslate")?.subline).toEqual({ kind: "acrossSurfaces", surfaces: 1 });
  });

  it("한 번도 안 보냈으면 마지막 Publish 대신 그 사실을 말한다", () => {
    expect(card({ ...base, lastPublishedAt: null }, "toSend")?.subline).toEqual({ kind: "neverSent" });
  });

  it("0이면 근거가 바뀐다 — 다 채웠다 / 대기 없음", () => {
    const zero = { ...base, counts: { newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: 0 }, state: "empty" as const };
    expect(countCards(zero).map((c) => c.subline)).toEqual([
      { kind: "synced", at: at("2026-09-14T00:00:00Z") },
      { kind: "allFilled", keys: 903 },
      { kind: "nothingPending" },
      { kind: "nothingPending" },
    ]);
  });

  /** `2b`: 값은 **마지막 성공의 것**이다 — 실패했다고 수가 사라지면 "번역이 날아갔다"로 읽힌다. */
  it("Sync 실패에서는 첫 칸이 마지막 성공 시각을 말한다", () => {
    const failed = { ...base, state: "import_failed" as const };
    expect(countCards(failed).map((c) => c.value)).toEqual([3, 12, 8, 24]);
    expect(card(failed, "newFromGithub")?.subline).toEqual({ kind: "lastGoodSync", at: at("2026-09-14T00:00:00Z") });
  });

  it("미연결에서는 넷 다 기준 시각을 말하고 발송은 멈춘 이유를 말한다", () => {
    const paused = { ...base, state: "not_connected" as const };
    expect(countCards(paused).map((c) => c.subline)).toEqual([
      { kind: "asOf", at: at("2026-09-14T00:00:00Z") },
      { kind: "asOfLastSync" },
      { kind: "asOfLastSync" },
      { kind: "pausedCannotSend" },
    ]);
  });

  it("보관에서는 값이 그 시점에 얼어붙었다고 말한다", () => {
    const archived = { ...base, state: "archived" as const };
    expect(countCards(archived).map((c) => c.value)).toEqual([3, 12, 8, 24]);
    expect(countCards(archived).map((c) => c.subline)).toEqual([
      { kind: "synced", at: at("2026-09-14T00:00:00Z") },
      { kind: "frozenAtArchive" },
      { kind: "frozenAtArchive" },
      { kind: "neverSent" },
    ]);
  });

  /** 상태가 근거를 덮으므로 0이어도 `nothing pending`으로 떨어지지 않는다 — 그 말은 거짓이 된다. */
  it("상태의 보조 줄이 0 갈래를 이긴다", () => {
    const paused = { ...base, state: "not_connected" as const, counts: { newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: 0 } };
    expect(card(paused, "toReview")?.subline).toEqual({ kind: "asOfLastSync" });
  });

  /** 첫 Sync 전에는 시각이 없다 — 지어내지 않는다. */
  it("Sync한 적이 없으면 시각 자리가 비어 온다", () => {
    expect(card({ ...base, lastSyncAt: null }, "newFromGithub")?.subline).toEqual({ kind: "synced", at: null });
  });
});

/**
 * 완료 조건 5 (spec §3.2) — **세 셀 구간이 서로 겹치지 않는다.** 첫 칸은 단위가 keys라 이 단언에서
 * 빠진다 (spec §7.1: 새 키의 빈 칸은 `New`에도 `To translate`에도 센다).
 */
describe("세 셀 구간의 겹침 0 — summaryQueue가 같은 셀을 두 번 세지 않는다", () => {
  const input = {
    projects: [{ projectId: "p", archived: false }],
    locales: [
      { projectId: "p", surfaceId: "s", surfaceSlug: "default", code: "en", isBase: true },
      { projectId: "p", surfaceId: "s", surfaceSlug: "default", code: "ja", isBase: false },
    ],
    keyTotals: new Map([["s", 10]]),
    // en 10 done · ja 3 done + 2 review → 값이 있는 셀 15, 칸 20.
    cells: [
      { projectId: "p", surfaceId: "s", localeCode: "en", needsReview: false, count: 10 },
      { projectId: "p", surfaceId: "s", localeCode: "ja", needsReview: false, count: 3 },
      { projectId: "p", surfaceId: "s", localeCode: "ja", needsReview: true, count: 2 },
    ],
    newKeys: new Map([["p", 6]]),
    unsent: new Map([["p", 4]]),
  };

  it("미번역은 검토 대기를 채워진 것으로 세고 다시 세지 않는다", () => {
    const queue = summaryQueue(input);
    expect(queue).toMatchObject({ toTranslate: 5, toReview: 2 });
    // 20칸 − 값이 있는 15칸 = 5. 검토 대기 2는 그 15 안에 있고 미번역 5와 겹치지 않는다.
    expect(queue.toTranslate + queue.toReview).toBe(7);
  });

  /**
   * ⚠️ **미발송은 사람이 저장한 칸이므로 값이 있다** — `saveTranslation`이 `needsReview: false`와
   * `updatedBy`를 함께 쓰고 push는 `updatedBy = NULL`과 `needsReview = true`를 함께 쓴다. 둘이 동시에
   * 참일 수 없다는 것이 이 배타성의 근거다 (spec §7.1).
   */
  it("미발송은 미번역·검토 대기와 겹치지 않는다 — 셋의 합이 칸 수를 넘지 않는다", () => {
    const queue = summaryQueue(input);
    expect(queue.toTranslate + queue.toReview + queue.toSend).toBeLessThanOrEqual(20);
  });

  it("첫 칸은 그 합에 들어가지 않는다 — 단위가 keys다", () => {
    expect(summaryQueue(input).newFromGithub).toBe(6);
    expect(countCards({ ...base, counts: summaryQueue(input) }).map((c) => c.unit)).toEqual(["keys", "cells", "cells", "cells"]);
  });
});
