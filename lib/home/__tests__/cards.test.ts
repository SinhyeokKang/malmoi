import { describe, expect, it, vi } from "vitest";

import { summaryQueue } from "@/lib/projects/list";

import { cardLandings, countCards, firstSurfaceWith, planHomeHold, surfaceQueues } from "../cards";

/**
 * 카운트 카드 넷 (캔버스 `2a`). **수와 문구는 이미 있는 것을 쓴다** — 값은 `summaryQueue`,
 * 제목은 `m.projects.summary.*`다 (DESIGN §6.64). 여기서 새로 정하는 것은 **보조 줄**과
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
  // 보류 결론 — 호출부가 `planHomeHold`로 낸다(ux-drift-unify Q6). 편집 24건이라 pending-edits다.
  hold: "pending-edits" as const,
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
   * ⚠️ **첫 칸만 단위가 keys다.** 보조 줄이 그 사실을 말하지 않으면 화면이 서로 다른
   * 단위 넷을 나란히 세워 놓고 같은 모집단인 척한다.
   */
  it("첫 칸은 keys이고 나머지 셋은 cells다", () => {
    expect(countCards(base).map((c) => c.unit)).toEqual(["keys", "cells", "cells", "cells"]);
  });

  /** 색은 둘뿐이다 — 유입의 파랑과 검토의 amber. 파랑 다섯 자리 중 하나가 이것이다 (DESIGN §6.2). */
  it("유입은 파랑, 검토는 amber, 나머지는 색이 없다", () => {
    expect(countCards(base).map((c) => c.tone)).toEqual(["accent", null, "warning", null]);
  });

  /**
   * ⚠️ **목록 화면의 띠와 다른 규칙이다** (DESIGN §6.63). 저쪽은 라벨이 이미 muted라 글리프가 그 색을
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
      { kind: "repositoryUpdatesPaused", reason: "pending-edits" },
    ]);
  });

  /** ⚠️ **표면이 하나면 `across 3 surfaces`가 거짓이다** — 그 줄이 사라진다. */
  it("표면이 하나면 표면 수를 말하지 않는다", () => {
    expect(card({ ...base, surfaces: 1 }, "toTranslate")?.subline).toEqual({ kind: "acrossSurfaces", surfaces: 1 });
  });

  /**
   * [C12] **보낼 편집이 있으면 리포 갱신이 멈췄다는 사실이 보조 줄이다** (sync-edit-protection T13) — OWNER가 보류를 아는 화면 자리다.
   * 0이면 기존 `nothing pending` 갈래다(아래 0 갈래 테스트).
   */
  it("[C12] 보낼 편집이 있으면 repository updates paused를 말한다", () => {
    expect(card(base, "toSend")?.subline).toEqual({ kind: "repositoryUpdatesPaused", reason: "pending-edits" });
    expect(card({ ...base, counts: { ...counts, toSend: 0 }, hold: null }, "toSend")?.subline).toEqual({ kind: "nothingPending" });
  });

  /**
   * **편집 0이어도 말모이 PR이 열려 있으면 보류다** (ux-drift-unify Q6 · 6-Y9) — 사유 셋이 그대로 보조 줄로 간다. 판정은 `planHomeHold`(아래)다.
   */
  it.each(["open-pr", "pr-check-failed"] as const)("편집 0 + %s", (reason) => {
    expect(card({ ...base, counts: { ...counts, toSend: 0 }, hold: reason }, "toSend")?.subline).toEqual({ kind: "repositoryUpdatesPaused", reason });
  });

  /** 상태가 보류를 이긴다 — 끊김·보관에서는 보낼 수 없다는 말이 먼저다(게이트도 그 상태에선 보류를 말하지 않는다). */
  it("끊김·보관은 보류 사유를 쓰지 않는다", () => {
    expect(card({ ...base, state: "not_connected" }, "toSend")?.subline).toEqual({ kind: "pausedCannotSend" });
    expect(card({ ...base, state: "archived" }, "toSend")?.subline).toEqual({ kind: "neverSent" });
  });

  it("0이면 근거가 바뀐다 — 다 채웠다 / 대기 없음", () => {
    const zero = { ...base, counts: { newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: 0 }, state: "empty" as const, hold: null };
    expect(countCards(zero).map((c) => c.subline)).toEqual([
      { kind: "synced", at: at("2026-09-14T00:00:00Z") },
      { kind: "allFilled", keys: 903 },
      // 검토 0과 보낼 것 0은 다른 문장이다 — "nothing to send"가 To review 칸에 서면 거짓이다(fix1 🔴2).
      { kind: "nothingToReview" },
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

  /**
   * ⚠️ **첫 칸도 상태를 말한다** (2026-09-15 리뷰 🟡5). 보관된 프로젝트에서 그 칸의 **값은 0이 된다**
   * (raw 집계가 SQL에서 보관을 거른다) — `synced 1d ago`를 붙이면 그 0이 지금 관측한 값처럼 읽히고,
   * 나머지 셋이 얼어붙었다고 말하는 화면에서 그 칸만 현재형이 된다.
   */
  it("보관에서는 넷 다 그 시점에 얼어붙었다고 말한다", () => {
    const archived = { ...base, state: "archived" as const, counts: { ...counts, newFromGithub: 0, toSend: 0 } };
    expect(countCards(archived).map((c) => c.subline)).toEqual([
      { kind: "frozenAtArchive" },
      { kind: "frozenAtArchive" },
      { kind: "frozenAtArchive" },
      { kind: "neverSent" },
    ]);
    // 값은 지우지 않는다 — 셀 구간 둘은 보관 뒤에도 마지막 값을 유지한다.
    expect(countCards(archived).map((c) => c.value)).toEqual([0, 12, 8, 0]);
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
 * **세 셀 구간이 서로 겹치지 않는다.** 첫 칸은 단위가 keys라 이 단언에서 빠진다 — 새 키의 빈 칸은
 * `New`에도 `To translate`에도 센다.
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
   * ⚠️ **미발송은 사람이 저장한 칸이므로 값이 있다** — `saveTranslationKey`가 `needsReview: false`와
   * `updatedBy`를 함께 쓰고 push는 `updatedBy = NULL`과 `needsReview = true`를 함께 쓴다. 둘이 동시에
   * 참일 수 없다는 것이 이 배타성의 근거다.
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

/**
 * **Home의 보류 판정과 PR 조회 생략** (ux-drift-unify Q6 · T18) — 편집 > 0이면 PR 결과와 무관하게 pending-edits이므로 GitHub을 부르지 않는다
 * (malmoi#107이 줄인 착지 병목을 되살리지 않는다). 조회가 필요할 때만 promise가 나오고, 조회 실패·거부는 Held(게이트가 fail-closed)다.
 */
describe("planHomeHold", () => {
  const input = { pending: 0, gateApplies: true, archived: false, disconnected: false };
  const lookup = (value: string | null | undefined) => vi.fn(() => Promise.resolve(value));

  it.each([
    ["편집 > 0", { pending: 3 }, "pending-edits"],
    ["보관", { archived: true, pending: 3 }, null],
    ["끊김", { disconnected: true }, null],
    ["게이트가 서지 않는 프로젝트", { gateApplies: false }, null],
    ["게이트가 없어도 편집 > 0", { gateApplies: false, pending: 2 }, "pending-edits"],
  ] as const)("%s → 조회 없이 결론이다", (_label, over, expected) => {
    const find = lookup("https://github.com/acme/web/pull/7");
    expect(planHomeHold({ ...input, ...over }, find)).toBe(expected);
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    ["PR 열림", "https://github.com/acme/web/pull/7", "open-pr"],
    ["PR 없음", null, null],
    ["조회 실패", undefined, "pr-check-failed"],
  ] as const)("편집 0 + %s → 조회 한 번 뒤 결론이다", async (_label, openPr, expected) => {
    const find = lookup(openPr);
    const hold = planHomeHold(input, find);
    expect(hold).toBeInstanceOf(Promise);
    await expect(hold).resolves.toBe(expected);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("조회가 던지면 Held다 — 게이트가 fail-closed다", async () => {
    await expect(planHomeHold(input, () => Promise.reject(new Error("boom")))).resolves.toBe("pr-check-failed");
  });
});

/*
  ── 카드의 착지 소스 (translation-tree-range — design §5 · spec 조건 16) ─────────────────────────────
  번역 화면의 범위가 트리 위치가 되면서 기본 소스로 착지한 카드가 0건 목록을 낼 수 있다 — POSTMORTEM 2026-09-15(네임스페이스 축)의
  같은 부류가 소스 축에서 다시 열린다. 카드마다 그 Status에 일치가 있는 첫 활성 소스(트리 순서)로 간다.
*/
describe("firstSurfaceWith — 일치가 있는 첫 소스", () => {
  it("트리 순서에서 처음으로 수가 0보다 큰 소스다", () => {
    expect(firstSurfaceWith(new Map([["web", 3], ["app", 2]]), ["app", "docs", "web"])).toBe("app");
    expect(firstSurfaceWith(new Map([["web", 3], ["app", 0]]), ["app", "docs", "web"])).toBe("web");
  });

  it("전부 0이거나 비었으면 null — 호출부가 기본 소스로 간다", () => {
    expect(firstSurfaceWith(new Map([["web", 0]]), ["web"])).toBeNull();
    expect(firstSurfaceWith(new Map(), ["web"])).toBeNull();
  });

  it("순서에 없는(보관된) 소스는 고르지 않는다", () => {
    expect(firstSurfaceWith(new Map([["old", 5], ["web", 0]]), ["web"])).toBeNull();
  });

  it("__proto__ slug도 이름 그대로 센다", () => {
    expect(firstSurfaceWith(new Map([["__proto__", 1]]), ["constructor", "__proto__"])).toBe("__proto__");
    expect(firstSurfaceWith(new Map([["web", 1]]), ["__proto__", "web"])).toBe("web");
  });
});

describe("surfaceQueues · cardLandings — 소스별 카드 수와 카드별 착지", () => {
  const live = (surfaceId: string, surfaceSlug: string, code: string) => ({ projectId: "p", surfaceId, surfaceSlug, code, isBase: code === "en" });
  const aggregates = {
    locales: [live("s-web", "web", "en"), live("s-web", "web", "ko"), live("s-app", "app", "en"), live("s-app", "app", "ko")],
    keyTotals: new Map([["s-web", 2], ["s-app", 1]]),
    // web은 다 찼고 검토 대기 하나, app은 ko가 비었다.
    cells: [
      { projectId: "p", surfaceId: "s-web", localeCode: "en", needsReview: false, count: 2 },
      { projectId: "p", surfaceId: "s-web", localeCode: "ko", needsReview: false, count: 1 },
      { projectId: "p", surfaceId: "s-web", localeCode: "ko", needsReview: true, count: 1 },
      { projectId: "p", surfaceId: "s-app", localeCode: "en", needsReview: false, count: 1 },
    ],
    newKeysBySurface: new Map([["s-web", 1]]),
    unsentBySurface: new Map([["s-app", 4]]),
  };
  const surfaces = [{ id: "s-web", slug: "web" }, { id: "s-app", slug: "app" }];

  it("소스별 수가 summaryQueue와 같은 접기이고, 합이 프로젝트 수와 같다 — 트리 순서(slug 코드 단위)다", () => {
    const queues = surfaceQueues("p", surfaces, aggregates);
    expect(queues.map(q => q.slug)).toEqual(["app", "web"]);
    expect(queues).toEqual([
      { slug: "app", counts: { newFromGithub: 0, toTranslate: 1, toReview: 0, toSend: 4 } },
      { slug: "web", counts: { newFromGithub: 1, toTranslate: 0, toReview: 1, toSend: 0 } },
    ]);
    const whole = summaryQueue({ projects: [{ projectId: "p", archived: false }], locales: aggregates.locales, keyTotals: aggregates.keyTotals, cells: aggregates.cells,
      newKeys: new Map([["p", 1]]), unsent: new Map([["p", 4]]) });
    for (const key of ["newFromGithub", "toTranslate", "toReview", "toSend"] as const) {
      expect(queues.reduce((sum, q) => sum + q.counts[key], 0), key).toBe(whole[key]);
    }
  });

  it("카드마다 일치가 있는 첫 소스로, 어디에도 없으면 기본 소스로 간다", () => {
    const landings = cardLandings(surfaceQueues("p", surfaces, aggregates), "web");
    expect(landings).toEqual({ newFromGithub: "web", toTranslate: "app", toReview: "web", toSend: "app" });
    const empty = surfaceQueues("p", surfaces, { ...aggregates, cells: [], newKeysBySurface: new Map(), unsentBySurface: new Map(), keyTotals: new Map() });
    expect(cardLandings(empty, "web")).toEqual({ newFromGithub: "web", toTranslate: "web", toReview: "web", toSend: "web" });
    expect(cardLandings(empty, null)).toEqual({ newFromGithub: null, toTranslate: null, toReview: null, toSend: null });
  });
});
