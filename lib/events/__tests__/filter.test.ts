// ⚠️ import는 이 줄보다 먼저 평가되지만(ESM) Node는 `Date` 연산마다 `TZ`를 다시 읽어 테스트 본문에는 걸린다 — 걸렸는지는 아래 가드가 판정한다. 런타임 TZ를 UTC가 아닌 곳(분 단위 오프셋)에 두어야 "런타임 TZ로 새지 않는다"가 CI(UTC)에서 공허하게 통과하지 않는다.
process.env.TZ = "Asia/Kathmandu";

import { describe, expect, it } from "vitest";

import type { TimeZone } from "@/lib/time-zone/zones";

import {
  PROJECT_WIDE,
  clearedLogsQuery,
  decodeCursor,
  encodeCursor,
  filterChanged,
  hasNarrowing,
  logsQuery,
  parseDateRange,
  parseDayKey,
  parseLogFilter,
  presetRange,
  type LogFilter,
} from "../filter";

it("TZ가 실제로 카트만두다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(-345);
});

/**
 * Logs의 URL 판정 (logs-rework design §6).
 *
 * ⚠️ **주소창 값이다** — 무엇을 받아도 던지지 않고 기본값을 낸다. 500이 되면 사용자가 되돌릴
 * 수단이 없다(`decodeCursor`·`pick`과 같은 축).
 */

function filter(over: Partial<LogFilter> = {}): LogFilter {
  return {
    kind: "all",
    from: null,
    to: null,
    actor: null,
    sources: [],
    results: [],
    q: null,
    cursor: null,
    event: null,
    ...over,
  };
}

describe("parseLogFilter — 기본값", () => {
  it("빈 입력은 전부 기본값이다", () => {
    expect(parseLogFilter({})).toEqual(filter());
  });

  it("모르는 종류·결과는 던지지 않고 기본값으로 떨어진다", () => {
    const parsed = parseLogFilter({ kind: "nope", result: "nope" });
    expect(parsed.kind).toBe("all");
    expect(parsed.results).toEqual([]);
  });

  /**
   * ⚠️ **프로토타입 키를 먹인다** (POSTMORTEM 2026-09-08·09). 갈래를 아는 값만 먹이는 테스트는
   * 이 부류를 원리적으로 못 본다 — `kind`·`result`가 사전/배열 조회를 지나므로 여기서 건다.
   */
  it("프로토타입 키도 기본값이다 — 배열 includes를 지난다", () => {
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(parseLogFilter({ kind: key }).kind, key).toBe("all");
      expect(parseLogFilter({ result: key }).results, key).toEqual([]);
    }
  });

  it("종류 일곱을 그대로 읽는다", () => {
    for (const kind of ["all", "translations", "imports", "publish", "sources", "members", "settings"] as const) {
      expect(parseLogFilter({ kind }).kind, kind).toBe(kind);
    }
  });

  it("결과 아홉을 그대로 읽는다", () => {
    for (const result of ["running", "sent", "nothingToSend", "imported", "deferred", "partial", "superseded", "notStarted", "failed"] as const) {
      expect(parseLogFilter({ result }).results, result).toEqual([result]);
    }
  });

  /** ⚠️ **소스·결과는 다중 선택이다** (캔버스 `1m`) — 쉼표로 이어지고 모르는 값만 조용히 빠진다. */
  it("소스·결과가 쉼표 목록이고 정렬·중복 제거된다", () => {
    expect(parseLogFilter({ source: "web,emails,web" }).sources).toEqual(["emails", "web"]);
    expect(parseLogFilter({ result: "failed,nope,sent" }).results).toEqual(["failed", "sent"]);
    expect(parseLogFilter({ source: " , ," }).sources).toEqual([]);
  });

  it("`project-wide`도 소스 값 하나다 — 소스가 없는 사건을 고른다", () => {
    expect(parseLogFilter({ source: "project-wide,web" }).sources).toEqual(["project-wide", "web"]);
  });

  /**
   * ⚠️ **길이 상한이 목록 전체가 아니라 항목마다 걸린다** (code-review 2026-09-21).
   * 전에는 `text()`의 200자 상한을 목록 **전체**에 걸어, 소스를 여덟 개쯤 고르면 **마지막 slug가
   * 중간에서 잘렸다** — 잘린 값은 어느 소스와도 안 맞아 결과가 조용히 0건이 된다(고른 소스가
   * 화면에는 그대로 보인다). slug 상한이 40자라 그 안의 값은 어느 개수에서도 온전해야 한다.
   */
  it("소스를 많이 골라도 마지막 slug가 잘리지 않는다", () => {
    const slugs = Array.from({ length: 12 }, (_, index) => `surface-${String(index).padStart(2, "0")}-locales`);
    expect(slugs.join(",").length).toBeGreaterThan(200);
    expect(parseLogFilter({ source: slugs.join(",") }).sources).toEqual([...slugs].sort());
  });

  it("항목 수는 상한에서 멈춘다 — 주소창 값이 쿼리 길이를 정하지 않는다", () => {
    const many = Array.from({ length: 80 }, (_, index) => `s${String(index).padStart(3, "0")}`);
    expect(parseLogFilter({ source: many.join(",") }).sources).toHaveLength(50);
  });

  /** ⚠️ 반복 파라미터(`?kind=a&kind=b`)는 Next가 배열로 준다 — 첫 값을 쓴다. */
  it("배열 값은 첫 값을 쓴다", () => {
    expect(parseLogFilter({ kind: ["members", "publish"] }).kind).toBe("members");
    expect(parseLogFilter({ kind: [] }).kind).toBe("all");
  });

  it("빈 문자열·공백은 없는 것과 같다", () => {
    expect(parseLogFilter({ q: "   ", actor: "", source: "", event: "" })).toEqual(filter());
  });

  it("검색어는 트림하고 상한에서 자른다 — 주소창 값이 쿼리 길이를 정하지 않는다", () => {
    expect(parseLogFilter({ q: "  hello  " }).q).toBe("hello");
    expect(parseLogFilter({ q: "x".repeat(500) }).q).toHaveLength(200);
  });

  it("행위자·소스·이벤트 참조는 그대로 싣는다", () => {
    const parsed = parseLogFilter({ actor: "usr_1", source: "web", event: "evt_1" });
    expect(parsed).toEqual(filter({ actor: "usr_1", sources: ["web"], event: "evt_1" }));
  });
});

describe("parseLogFilter — 기간", () => {
  it("유효한 두 날짜를 그대로 싣는다", () => {
    expect(parseLogFilter({ from: "2026-09-01", to: "2026-09-10" })).toEqual(
      filter({ from: "2026-09-01", to: "2026-09-10" }),
    );
  });

  it("무효한 날짜는 그 쪽만 버린다", () => {
    expect(parseLogFilter({ from: "2026-13-40", to: "2026-09-10" }).from).toBe(null);
    expect(parseLogFilter({ from: "2026-13-40", to: "2026-09-10" }).to).toBe("2026-09-10");
    expect(parseLogFilter({ from: "nope" }).from).toBe(null);
  });

  /**
   * ⚠️ **화면에 남는 값과 적용되는 창이 어긋나면 안 된다** — 역전된 쌍은 둘 다 버린다.
   * 한쪽만 남기면 사용자가 지정하지 않은 구간이 적용된다.
   */
  it("역전된 범위는 둘 다 버린다", () => {
    expect(parseLogFilter({ from: "2026-09-10", to: "2026-09-01" })).toEqual(filter());
  });

  it("같은 날 하루는 역전이 아니다", () => {
    expect(parseLogFilter({ from: "2026-09-10", to: "2026-09-10" }).from).toBe("2026-09-10");
  });
});

describe("parseDateRange — UTC 구간", () => {
  it("시작은 UTC 자정, 끝은 다음 UTC 자정(배타)이다", () => {
    expect(parseDateRange("2026-09-01", "2026-09-10", "UTC")).toEqual({
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-11T00:00:00.000Z"),
    });
  });

  it("하루만 고르면 그 하루 전체가 들어온다", () => {
    const range = parseDateRange("2026-09-10", "2026-09-10", "UTC");
    expect(range.from).toEqual(new Date("2026-09-10T00:00:00.000Z"));
    expect(range.to).toEqual(new Date("2026-09-11T00:00:00.000Z"));
  });

  it("한쪽만 있으면 그쪽만 닫힌다", () => {
    expect(parseDateRange("2026-09-01", null, "UTC")).toEqual({ from: new Date("2026-09-01T00:00:00.000Z"), to: null });
    expect(parseDateRange(null, "2026-09-01", "UTC")).toEqual({ from: null, to: new Date("2026-09-02T00:00:00.000Z") });
  });

  it("무효·역전은 던지지 않고 비운다", () => {
    expect(parseDateRange("nope", "also nope", "UTC")).toEqual({ from: null, to: null });
    expect(parseDateRange("2026-09-10", "2026-09-01", "UTC")).toEqual({ from: null, to: null });
    expect(parseDateRange(null, null, "UTC")).toEqual({ from: null, to: null });
  });

  /** ⚠️ **로컬 타임존으로 새지 않는다** — `new Date("2026-09-01")`은 UTC지만 `new Date(y, m, d)`는 로컬이다. */
  it("월말·윤년 경계도 UTC로 넘어간다", () => {
    expect(parseDateRange("2026-01-31", "2026-01-31", "UTC").to).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(parseDateRange("2024-02-28", "2024-02-29", "UTC").to).toEqual(new Date("2024-03-01T00:00:00.000Z"));
    expect(parseDateRange("2026-12-31", "2026-12-31", "UTC").to).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("날짜 모양이 아닌 것은 전부 버린다 — 부분 파싱하지 않는다", () => {
    for (const bad of ["2026-9-1", "2026/09/01", "20260901", "2026-09-01T00:00:00Z", "  ", "2026-02-30"]) {
      expect(parseDateRange(bad, null, "UTC").from, bad).toBe(null);
    }
  });
});

/**
 * **보는 사람의 시간대 자정으로 끊는다**(user-timezone A3). `to`는 다음 날의 첫 순간(배타)이고 `+24시간`이 아니다 —
 * 서머타임 날은 23·25시간이고, 0시가 없는 날은 그날 01:00에서 시작한다.
 */
describe("parseDateRange — 고른 시간대", () => {
  const HOUR = 60 * 60 * 1000;
  const length = (range: { from: Date | null; to: Date | null }) => (range.to?.getTime() ?? NaN) - (range.from?.getTime() ?? NaN);

  it("서울 10월 5일 하루는 [10-04T15:00Z, 10-05T15:00Z)다", () => {
    expect(parseDateRange("2026-10-05", "2026-10-05", "Asia/Seoul")).toEqual({
      from: new Date("2026-10-04T15:00:00.000Z"),
      to: new Date("2026-10-05T15:00:00.000Z"),
    });
  });

  it("인도는 30분 단위로 끊는다", () => {
    expect(parseDateRange("2026-10-05", "2026-10-05", "Asia/Kolkata")).toEqual({
      from: new Date("2026-10-04T18:30:00.000Z"),
      to: new Date("2026-10-05T18:30:00.000Z"),
    });
  });

  it("뉴욕 서머타임 날은 23·25시간이다", () => {
    const spring = parseDateRange("2026-03-08", "2026-03-08", "America/New_York");
    expect(spring.from).toEqual(new Date("2026-03-08T05:00:00.000Z"));
    expect(spring.to).toEqual(new Date("2026-03-09T04:00:00.000Z"));
    expect(length(spring)).toBe(23 * HOUR);
    const fall = parseDateRange("2026-11-01", "2026-11-01", "America/New_York");
    expect(fall.from).toEqual(new Date("2026-11-01T04:00:00.000Z"));
    expect(fall.to).toEqual(new Date("2026-11-02T05:00:00.000Z"));
    expect(length(fall)).toBe(25 * HOUR);
  });

  it("0시가 없는 날(산티아고 2026-09-06)은 01:00에서 시작하고 23시간이다", () => {
    const range = parseDateRange("2026-09-06", "2026-09-06", "America/Santiago");
    expect(range.from).toEqual(new Date("2026-09-06T04:00:00.000Z"));
    expect(range.to).toEqual(new Date("2026-09-07T03:00:00.000Z"));
    expect(length(range)).toBe(23 * HOUR);
  });

  it.each<[TimeZone]>([["Asia/Seoul"], ["America/New_York"]])("%s — 무효·역전은 던지지 않고 비운다, 한쪽만이면 그쪽만", (zone) => {
    expect(parseDateRange("nope", "also nope", zone)).toEqual({ from: null, to: null });
    expect(parseDateRange("2026-09-10", "2026-09-01", zone)).toEqual({ from: null, to: null });
    expect(parseDateRange(null, null, zone)).toEqual({ from: null, to: null });
    expect(parseDateRange("2026-09-01", null, zone).to).toBe(null);
    expect(parseDateRange(null, "2026-09-01", zone).from).toBe(null);
    for (const bad of ["2026-9-1", "2026/09/01", "20260901", "2026-09-01T00:00:00Z", "  ", "2026-02-30"]) {
      expect(parseDateRange(bad, null, zone).from, bad).toBe(null);
    }
  });

  it("월말·윤년·연말 경계 — 서울·뉴욕", () => {
    expect(parseDateRange("2026-01-31", "2026-01-31", "Asia/Seoul").to).toEqual(new Date("2026-01-31T15:00:00.000Z"));
    expect(parseDateRange("2024-02-28", "2024-02-29", "Asia/Seoul").to).toEqual(new Date("2024-02-29T15:00:00.000Z"));
    expect(parseDateRange("2026-12-31", "2026-12-31", "Asia/Seoul").to).toEqual(new Date("2026-12-31T15:00:00.000Z"));
    expect(parseDateRange("2026-01-31", "2026-01-31", "America/New_York").to).toEqual(new Date("2026-02-01T05:00:00.000Z"));
    expect(parseDateRange("2024-02-28", "2024-02-29", "America/New_York").to).toEqual(new Date("2024-03-01T05:00:00.000Z"));
    expect(parseDateRange("2026-12-31", "2026-12-31", "America/New_York").to).toEqual(new Date("2027-01-01T05:00:00.000Z"));
  });
});

/** ⚠️ **기간 판정은 시간대와 무관하다** — MCP·Home이 시간대 없이 같은 `parseLogFilter`를 부른다. */
describe("parseLogFilter — 기간 판정은 키만 본다", () => {
  it("시간대 인자가 없다", () => {
    expect(parseLogFilter.length).toBe(1);
  });

  it("역전 쌍은 둘 다 버리고, 무효한 쪽만 버린다", () => {
    expect(parseLogFilter({ from: "2026-09-10", to: "2026-09-01" })).toMatchObject({ from: null, to: null });
    expect(parseLogFilter({ from: "2026-02-30", to: "2026-09-01" })).toMatchObject({ from: null, to: "2026-09-01" });
    expect(parseLogFilter({ from: "2026-09-01", to: "2026-09-10" })).toMatchObject({ from: "2026-09-01", to: "2026-09-10" });
    expect(parseLogFilter({ from: "2026-12-31", to: "2027-01-01" })).toMatchObject({ from: "2026-12-31", to: "2027-01-01" });
  });

  it("parseDayKey — 실재 날짜만 키로 돌려준다", () => {
    expect(parseDayKey("2024-02-29")).toBe("2024-02-29");
    expect(parseDayKey("2026-02-29")).toBe(null);
    expect(parseDayKey("2026-9-1")).toBe(null);
    expect(parseDayKey(null)).toBe(null);
  });
});

/**
 * 프리셋 — **보는 사람의 시간대에서 오늘을 잡고 달력으로 센다**. `now`는 호출부가 넘긴다.
 * 서울 `2026-10-04T23:10Z`는 10월 5일 아침이다.
 */
describe("presetRange", () => {
  const NOW = new Date("2026-10-04T23:10:00Z");

  it("서울 — Today는 10-05, Yesterday는 10-04", () => {
    expect(presetRange("today", NOW, "Asia/Seoul")).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    expect(presetRange("yesterday", NOW, "Asia/Seoul")).toEqual({ from: "2026-10-04", to: "2026-10-04" });
    expect(presetRange("last7", NOW, "Asia/Seoul")).toEqual({ from: "2026-09-29", to: "2026-10-05" });
    expect(presetRange("last30", NOW, "Asia/Seoul")).toEqual({ from: "2026-09-06", to: "2026-10-05" });
  });

  it("UTC — 같은 순간의 Today는 10-04다", () => {
    expect(presetRange("today", NOW, "UTC")).toEqual({ from: "2026-10-04", to: "2026-10-04" });
    expect(presetRange("yesterday", NOW, "UTC")).toEqual({ from: "2026-10-03", to: "2026-10-03" });
    expect(presetRange("last7", NOW, "UTC")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(presetRange("last30", NOW, "UTC")).toEqual({ from: "2026-09-05", to: "2026-10-04" });
  });

  it("Yesterday는 `now - 24h`가 아니다 — 뉴욕 서머타임 다음 날 0시 30분", () => {
    // 2026-03-09 00:30 EDT. 24시간 전은 03-07 23:30 EST라 `now - 24h`면 이틀 전을 고른다.
    const now = new Date("2026-03-09T04:30:00Z");
    expect(presetRange("today", now, "America/New_York")).toEqual({ from: "2026-03-09", to: "2026-03-09" });
    expect(presetRange("yesterday", now, "America/New_York")).toEqual({ from: "2026-03-08", to: "2026-03-08" });
  });
});

describe("커서", () => {
  const cursor = { occurredAt: new Date("2026-09-10T12:00:00.000Z"), id: "evt_1" };

  it("왕복한다", () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("URL에 그대로 실린다 — base64url이라 재인코딩이 한 겹 더 붙지 않는다", () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("무엇을 받아도 던지지 않고 null이다", () => {
    for (const bad of ["", "!!!", "Zm9v", "a".repeat(5000), "__proto__"]) {
      expect(() => decodeCursor(bad)).not.toThrow();
      expect(decodeCursor(bad), bad).toBe(null);
    }
  });

  it("id에 구분자가 들어가도 첫 구분자에서만 자른다", () => {
    const odd = { occurredAt: cursor.occurredAt, id: "a|b|c" };
    expect(decodeCursor(encodeCursor(odd))).toEqual(odd);
  });

  it("해독 불가한 커서는 첫 페이지다 — parseLogFilter가 던지지 않는다", () => {
    expect(parseLogFilter({ cursor: "!!!" }).cursor).toBe(null);
    expect(parseLogFilter({ cursor: encodeCursor(cursor) }).cursor).toEqual(cursor);
  });
});

describe("filterChanged — 커서를 버릴지", () => {
  it("같은 조합이면 false다", () => {
    expect(filterChanged(filter(), filter())).toBe(false);
  });

  it("좁히는 축이 바뀌면 true다", () => {
    expect(filterChanged(filter(), filter({ kind: "members" }))).toBe(true);
    expect(filterChanged(filter(), filter({ q: "hello" }))).toBe(true);
    expect(filterChanged(filter(), filter({ actor: "usr_1" }))).toBe(true);
    expect(filterChanged(filter(), filter({ sources: ["web"] }))).toBe(true);
    expect(filterChanged(filter(), filter({ results: ["failed"] }))).toBe(true);
    expect(filterChanged(filter({ from: "2026-09-01" }), filter({ from: "2026-09-02" }))).toBe(true);
    expect(filterChanged(filter({ to: "2026-09-01" }), filter())).toBe(true);
  });

  /**
   * ⚠️ **커서와 열린 이벤트는 좁히는 축이 아니다.** 커서가 바뀌었다고 커서를 버리면 [Older]가
   * 영원히 첫 페이지를 낸다. 상세를 여닫는 것도 목록을 되감지 않는다(리뷰 결정 15).
   */
  /** 순서만 다른 같은 선택은 같은 조합이다 — URL이 순서를 정하지 않는다. */
  it("다중 선택의 순서는 조합을 바꾸지 않는다", () => {
    expect(filterChanged(filter({ sources: ["a", "b"] }), filter({ sources: ["b", "a"] }))).toBe(false);
    expect(filterChanged(filter({ results: ["sent", "failed"] }), filter({ results: ["failed", "sent"] }))).toBe(false);
  });

  it("커서·열린 이벤트가 바뀌어도 false다", () => {
    const cursor = { occurredAt: new Date("2026-09-10T12:00:00.000Z"), id: "evt_1" };
    expect(filterChanged(filter(), filter({ cursor }))).toBe(false);
    expect(filterChanged(filter(), filter({ event: "evt_9" }))).toBe(false);
  });
});

it("전역 선택값은 실제 소스 slug와 겹치지 않는다", () => {
  expect(PROJECT_WIDE).toBe("@project-wide");
  expect(parseLogFilter({ source: `${PROJECT_WIDE},project-wide` }).sources).toEqual([PROJECT_WIDE, "project-wide"]);
});

/**
 * URL 조립 셋 — **`parseLogFilter`의 역이어야 한다.** 조립한 쿼리를 다시 읽었을 때 다른 필터가 나오면 [Older]·필터
 * 해제·공유한 주소가 사용자가 고른 것과 다른 목록을 연다. 그래서 값 하나하나가 아니라 **왕복**을 잰다.
 */
describe("logsQuery — parseLogFilter의 역", () => {
  const cursor = { occurredAt: new Date("2026-09-10T12:00:00.000Z"), id: "evt|1" };
  const full = filter({
    kind: "members",
    from: "2026-09-01",
    to: "2026-09-10",
    actor: "automation",
    sources: [PROJECT_WIDE, "web"],
    results: ["failed", "sent"],
    q: "안녕 hello",
    cursor,
    event: "evt_9",
  });

  it("기본 필터는 빈 쿼리다 — 기본값을 URL에 싣지 않는다", () => {
    expect(logsQuery(filter())).toEqual({});
  });

  it("모든 축이 켜진 필터가 왕복한다", () => {
    expect(parseLogFilter(logsQuery(full))).toEqual(full);
  });

  it("축마다 켜진 필터가 왕복한다 — 한 축이 다른 축의 기본값을 흔들지 않는다", () => {
    const axes: Partial<LogFilter>[] = [
      { kind: "members" }, { from: "2026-09-01" }, { to: "2026-09-10" }, { actor: "usr_1" },
      { sources: ["web"] }, { results: ["failed"] }, { q: "x" }, { cursor }, { event: "evt_9" },
    ];
    for (const over of axes) {
      const one = filter(over);
      expect(parseLogFilter(logsQuery(one)), JSON.stringify(over)).toEqual(one);
    }
  });

  it("다중 선택은 정렬된 쉼표 목록 하나다 — 같은 선택이 두 URL로 갈리지 않는다", () => {
    expect(logsQuery(filter({ sources: ["web", "app"] })).source).toBe("app,web");
    expect(logsQuery(filter({ sources: ["app", "web"] })).source).toBe("app,web");
    expect(logsQuery(filter({ results: [] }))).not.toHaveProperty("result");
  });
});

describe("hasNarrowing — [Clear filters]가 서는 조건", () => {
  it("기본 필터는 좁히지 않는다", () => {
    expect(hasNarrowing(filter())).toBe(false);
  });

  it("좁히는 축 하나만 켜도 true다", () => {
    for (const over of [
      { kind: "members" }, { from: "2026-09-01" }, { to: "2026-09-10" }, { actor: "usr_1" },
      { sources: ["web"] }, { results: ["failed"] }, { q: "x" },
    ] satisfies Partial<LogFilter>[]) {
      expect(hasNarrowing(filter(over)), JSON.stringify(over)).toBe(true);
    }
  });

  /** ⚠️ 커서·열린 이벤트는 좁힘이 아니다 — 세면 [Older]를 누르거나 상세를 여는 것만으로 [Clear filters]가 선다. */
  it("커서·열린 이벤트만으로는 false다 (위 축 대조)", () => {
    expect(hasNarrowing(filter({ cursor: { occurredAt: new Date("2026-09-10T12:00:00.000Z"), id: "e" }, event: "evt_9" }))).toBe(false);
  });
});

describe("clearedLogsQuery — 필터를 전부 뗀 쿼리", () => {
  const narrowed = filter({
    kind: "members", q: "x", sources: ["web"], results: ["failed"], actor: "usr_1", from: "2026-09-01", to: "2026-09-10",
    cursor: { occurredAt: new Date("2026-09-10T12:00:00.000Z"), id: "e" },
  });

  it("좁힘과 커서를 함께 버린다 — 좁힘이 사라지면 옛 페이지의 커서가 뜻을 잃는다", () => {
    expect(clearedLogsQuery(narrowed)).toEqual({});
    expect(hasNarrowing(parseLogFilter(clearedLogsQuery(narrowed)))).toBe(false);
  });

  it("열린 이벤트는 남긴다 — 상세는 목록 필터와 독립이다 (결정 15)", () => {
    expect(clearedLogsQuery({ ...narrowed, event: "evt_9" })).toEqual({ event: "evt_9" });
    expect(parseLogFilter(clearedLogsQuery({ ...narrowed, event: "evt_9" }))).toEqual(filter({ event: "evt_9" }));
  });
});

describe("parseLogFilter — 주체 필터 ci · nightly (nightly-sync)", () => {
  it.each(["ci", "nightly", "automation"])("?actor=%s 가 URL로 왕복한다", (actor) => {
    const parsed = parseLogFilter({ actor });
    expect(parsed.actor).toBe(actor);
    expect(logsQuery(parsed)).toEqual({ actor });
    expect(parseLogFilter(logsQuery(parsed))).toEqual(parsed);
  });

  it("주체 필터는 좁히는 축이다 — hasNarrowing", () => {
    expect(hasNarrowing(filter({ actor: "ci" }))).toBe(true);
    expect(hasNarrowing(filter({ actor: "nightly" }))).toBe(true);
    expect(hasNarrowing(filter())).toBe(false);
  });

  it("ci ↔ nightly 전환은 커서를 버린다 — filterChanged", () => {
    expect(filterChanged(filter({ actor: "ci" }), filter({ actor: "nightly" }))).toBe(true);
    expect(filterChanged(filter({ actor: "automation" }), filter({ actor: "ci" }))).toBe(true);
    expect(filterChanged(filter({ actor: "ci" }), filter({ actor: "ci" }))).toBe(false);
  });
});
