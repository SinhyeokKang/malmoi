import { describe, expect, it } from "vitest";
import {
  effectiveCompletion,
  keyMatches,
  orderKeySummaries,
  summarizeKey,
  type KeyCellInput,
  type KeySummary,
} from "../summary";

/**
 * 키 집계 (translation-rework T2 — spec §3.3, design §2 집계 계획).
 *
 * 이 함수들은 목록 SQL 집계의 **순수 oracle**이기도 하다 — T9가 같은 fixture에서 두 결과를 대조한다.
 * 그래서 규칙이 여기서 정해진다: 분모 = 그 소스의 **활성** 로케일, 결측 = 행 부재·null·빈 문자열,
 * `needsReview`는 결측이 아니고 값이 있을 때만 서며, pending은 값과 독립이다.
 */
const cell = (localeCode: string, value: string | null, extra: Partial<KeyCellInput> = {}): KeyCellInput =>
  ({ localeCode, value, needsReview: false, pending: false, ...extra });

describe("summarizeKey — 결측", () => {
  it("모든 활성 언어에 저장값이 있으면 Complete", () => {
    const s = summarizeKey({ activeLocales: ["en", "ko"], cells: [cell("en", "Hi"), cell("ko", "안녕")] });
    expect(s).toEqual({ totalLocales: 2, missingCount: 0, hasReview: false, hasPending: false });
  });

  it("행 부재·null·빈 문자열이 모두 결측이다", () => {
    const s = summarizeKey({ activeLocales: ["en", "ko", "ja", "fr"], cells: [cell("en", "Hi"), cell("ko", ""), cell("ja", null)] });
    expect(s.missingCount).toBe(3);
  });

  it("공백만 있는 DB 값은 채워진 값이다 — 저장 정규화와 집계를 섞지 않는다 (design §2-2)", () => {
    expect(summarizeKey({ activeLocales: ["en"], cells: [cell("en", " ")] }).missingCount).toBe(0);
  });

  it("활성 로케일이 아닌 셀(orphan 로케일)은 분모에도 분자에도 없다", () => {
    const s = summarizeKey({ activeLocales: ["en"], cells: [cell("en", "Hi"), cell("de", "", { pending: true, needsReview: true })] });
    expect(s).toEqual({ totalLocales: 1, missingCount: 0, hasReview: false, hasPending: false });
  });

  it("활성 로케일이 0이면 결측 0 · 분모 0이다", () => {
    expect(summarizeKey({ activeLocales: [], cells: [] })).toEqual({ totalLocales: 0, missingCount: 0, hasReview: false, hasPending: false });
  });

  it("프로토타입 이름의 로케일도 한 칸으로 센다", () => {
    const s = summarizeKey({ activeLocales: ["constructor", "__proto__"], cells: [cell("constructor", "x")] });
    expect(s.missingCount).toBe(1);
    expect(s.totalLocales).toBe(2);
  });
});

describe("summarizeKey — review·pending은 결측과 독립", () => {
  it("값이 있는 needsReview만 review다 — Complete와 Needs review가 동시에 참일 수 있다", () => {
    const s = summarizeKey({ activeLocales: ["en", "ko"], cells: [cell("en", "Hi"), cell("ko", "안녕", { needsReview: true })] });
    expect(s.missingCount).toBe(0);
    expect(s.hasReview).toBe(true);
  });

  it("빈 값의 needsReview는 review가 아니다 — 결측으로만 센다", () => {
    const s = summarizeKey({ activeLocales: ["en", "ko"], cells: [cell("en", "Hi"), cell("ko", "", { needsReview: true })] });
    expect(s).toMatchObject({ missingCount: 1, hasReview: false });
  });

  it("pending은 값이 비어도 선다 — pendingWhere는 값을 보지 않는다", () => {
    const s = summarizeKey({ activeLocales: ["en", "ko"], cells: [cell("en", "Hi"), cell("ko", "", { pending: true })] });
    expect(s).toMatchObject({ missingCount: 1, hasPending: true });
  });
});

const summary = (keyId: string, missingCount: number, hasReview = false, extra: Partial<KeySummary> = {}) =>
  ({ keyId, totalLocales: 3, missingCount, hasReview, hasPending: false, ...extra });

describe("orderKeySummaries — Incomplete first 안정 분할", () => {
  it("결측 또는 review가 있는 키를 앞으로 올리고 각 덩이의 원래 순서를 지킨다", () => {
    const rows = [summary("a", 0), summary("b", 2), summary("c", 0, true), summary("d", 0), summary("e", 1)];
    expect(orderKeySummaries(rows).map(r => r.keyId)).toEqual(["b", "c", "e", "a", "d"]);
  });

  it("결측 수로 줄세우지 않는다 — 5 missing이 1 missing 앞으로 가지 않는다", () => {
    const rows = [summary("one", 1), summary("five", 5)];
    expect(orderKeySummaries(rows).map(r => r.keyId)).toEqual(["one", "five"]);
  });

  it("입력을 바꾸지 않는다", () => {
    const rows = [summary("a", 0), summary("b", 1)];
    orderKeySummaries(rows);
    expect(rows.map(r => r.keyId)).toEqual(["a", "b"]);
  });

  it("pending만 있는 키는 앞으로 오지 않는다 — Incomplete는 결측·review다", () => {
    const rows = [summary("a", 0), summary("p", 0, false, { hasPending: true })];
    expect(orderKeySummaries(rows).map(r => r.keyId)).toEqual(["a", "p"]);
  });
});

describe("effectiveCompletion — 요청값과 적용값 (R5 · design §3.1)", () => {
  const web = { surfaceId: "web", locales: ["en", "ko"] };
  const app = { surfaceId: "app", locales: ["en", "ja"] };

  it("missing이 아니면 요청값 그대로다", () => {
    expect(effectiveCompletion({ completion: "incomplete" }, [web])).toEqual({ completion: "incomplete", substituted: false, excludedSurfaceIds: [] });
  });

  it("ja가 없는 단일 소스로 좁히면 Incomplete로 대체하고 그 사실을 알린다", () => {
    expect(effectiveCompletion({ completion: "missing", missingLocale: "ja" }, [web])).toEqual({
      completion: "incomplete", substituted: true, excludedSurfaceIds: [],
    });
  });

  it("ja가 있는 소스가 범위에 있으면 missing을 적용하고 ja 없는 소스는 결과에서 뺀다", () => {
    expect(effectiveCompletion({ completion: "missing", missingLocale: "ja" }, [web, app])).toEqual({
      completion: "missing", missingLocale: "ja", substituted: false, excludedSurfaceIds: ["web"],
    });
  });

  it("같은 요청값이면 범위를 다시 넓혔을 때 ja가 돌아온다 — 기억은 URL에 있다", () => {
    const requested = { completion: "missing" as const, missingLocale: "ja" };
    expect(effectiveCompletion(requested, [web]).completion).toBe("incomplete");
    expect(effectiveCompletion(requested, [web, app]).completion).toBe("missing");
  });

  it("프로토타입 이름의 언어도 포함 판정을 배열로 한다", () => {
    expect(effectiveCompletion({ completion: "missing", missingLocale: "constructor" }, [web]).substituted).toBe(true);
  });
});

describe("keyMatches — 완성도 · 상태 AND", () => {
  const key = (over: Partial<Parameters<typeof keyMatches>[0]> = {}) => ({
    summary: summary("k", 0),
    missingLocales: [] as string[],
    createdAt: new Date("2026-09-20T00:00:00Z"),
    ...over,
  });
  const at = new Date("2026-09-21T00:00:00Z");

  it("All keys는 전부, Incomplete는 결측>0, Complete는 결측 0", () => {
    const done = key();
    const todo = key({ summary: summary("k", 2), missingLocales: ["ko", "ja"] });
    expect(keyMatches(done, { completion: "all" }, { lastPulledAt: at })).toBe(true);
    expect(keyMatches(todo, { completion: "incomplete" }, { lastPulledAt: at })).toBe(true);
    expect(keyMatches(done, { completion: "incomplete" }, { lastPulledAt: at })).toBe(false);
    expect(keyMatches(done, { completion: "complete" }, { lastPulledAt: at })).toBe(true);
    expect(keyMatches(todo, { completion: "complete" }, { lastPulledAt: at })).toBe(false);
  });

  it("Complete + Needs review는 Complete에 든다 — review는 결측이 아니다", () => {
    expect(keyMatches(key({ summary: summary("k", 0, true) }), { completion: "complete" }, { lastPulledAt: at })).toBe(true);
  });

  it("Missing in ja는 그 언어가 결측인 키만", () => {
    const k = key({ summary: summary("k", 1), missingLocales: ["ko"] });
    expect(keyMatches(k, { completion: "missing", missingLocale: "ko" }, { lastPulledAt: at })).toBe(true);
    expect(keyMatches(k, { completion: "missing", missingLocale: "ja" }, { lastPulledAt: at })).toBe(false);
  });

  it("상태: Not sent = pending, Needs review = review, New from GitHub = lastPulledAt 이후 생성", () => {
    expect(keyMatches(key({ summary: summary("k", 0, false, { hasPending: true }) }), { completion: "all", state: "unsent" }, { lastPulledAt: at })).toBe(true);
    expect(keyMatches(key(), { completion: "all", state: "unsent" }, { lastPulledAt: at })).toBe(false);
    expect(keyMatches(key({ summary: summary("k", 0, true) }), { completion: "all", state: "review" }, { lastPulledAt: at })).toBe(true);
    expect(keyMatches(key(), { completion: "all", state: "new" }, { lastPulledAt: at })).toBe(false);
    expect(keyMatches(key({ createdAt: new Date("2026-09-22T00:00:00Z") }), { completion: "all", state: "new" }, { lastPulledAt: at })).toBe(true);
  });

  it("같은 시각은 새 키가 아니다 — createdAt > lastPulledAt", () => {
    expect(keyMatches(key({ createdAt: at }), { completion: "all", state: "new" }, { lastPulledAt: at })).toBe(false);
  });

  it("lastPulledAt이 null이면 활성 키 전체가 New from GitHub다", () => {
    expect(keyMatches(key(), { completion: "all", state: "new" }, { lastPulledAt: null })).toBe(true);
  });

  it("완성도와 상태는 AND다", () => {
    const k = key({ summary: summary("k", 1, false, { hasPending: true }), missingLocales: ["ko"] });
    expect(keyMatches(k, { completion: "complete", state: "unsent" }, { lastPulledAt: at })).toBe(false);
    expect(keyMatches(k, { completion: "incomplete", state: "unsent" }, { lastPulledAt: at })).toBe(true);
  });
});
