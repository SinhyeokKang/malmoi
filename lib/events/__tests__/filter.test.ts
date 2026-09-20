import { describe, expect, it } from "vitest";

import {
  decodeCursor,
  encodeCursor,
  filterChanged,
  parseDateRange,
  parseLogFilter,
  type LogFilter,
} from "../filter";

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
    expect(parseDateRange("2026-09-01", "2026-09-10")).toEqual({
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-11T00:00:00.000Z"),
    });
  });

  it("하루만 고르면 그 하루 전체가 들어온다", () => {
    const range = parseDateRange("2026-09-10", "2026-09-10");
    expect(range.from).toEqual(new Date("2026-09-10T00:00:00.000Z"));
    expect(range.to).toEqual(new Date("2026-09-11T00:00:00.000Z"));
  });

  it("한쪽만 있으면 그쪽만 닫힌다", () => {
    expect(parseDateRange("2026-09-01", null)).toEqual({ from: new Date("2026-09-01T00:00:00.000Z"), to: null });
    expect(parseDateRange(null, "2026-09-01")).toEqual({ from: null, to: new Date("2026-09-02T00:00:00.000Z") });
  });

  it("무효·역전은 던지지 않고 비운다", () => {
    expect(parseDateRange("nope", "also nope")).toEqual({ from: null, to: null });
    expect(parseDateRange("2026-09-10", "2026-09-01")).toEqual({ from: null, to: null });
    expect(parseDateRange(null, null)).toEqual({ from: null, to: null });
  });

  /** ⚠️ **로컬 타임존으로 새지 않는다** — `new Date("2026-09-01")`은 UTC지만 `new Date(y, m, d)`는 로컬이다. */
  it("월말·윤년 경계도 UTC로 넘어간다", () => {
    expect(parseDateRange("2026-01-31", "2026-01-31").to).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(parseDateRange("2024-02-28", "2024-02-29").to).toEqual(new Date("2024-03-01T00:00:00.000Z"));
    expect(parseDateRange("2026-12-31", "2026-12-31").to).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("날짜 모양이 아닌 것은 전부 버린다 — 부분 파싱하지 않는다", () => {
    for (const bad of ["2026-9-1", "2026/09/01", "20260901", "2026-09-01T00:00:00Z", "  ", "2026-02-30"]) {
      expect(parseDateRange(bad, null).from, bad).toBe(null);
    }
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
