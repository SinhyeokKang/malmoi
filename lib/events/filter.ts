import { EVENT_RESULTS, LOG_KINDS, type EventResult, type LogKind } from "./payload";

/**
 * Logs의 **URL 판정** (logs-rework design §6).
 *
 * ⚠️ **주소창 값이라 무엇을 받아도 던지지 않는다.** 모르는 값·해독 불가는 기본값이고 화면은 첫
 * 페이지를 그린다 — `decodeCursor`·`pick`과 같은 축이다 (POSTMORTEM 2026-09-08).
 *
 * ⚠️ **잎이다** — `./payload`(그쪽도 잎)까지다. 필터 UI가 클라이언트 컴포넌트라 이 그래프가 곧
 * 번들이다 (`components/__tests__/client-graph.test.ts`).
 */

/** Next의 `searchParams`가 주는 모양. 반복 파라미터는 배열로 온다. */
export type LogSearchParams = Record<string, string | string[] | undefined>;

/** 키셋 페이지네이션의 커서. `occurredAt` 하나로는 같은 밀리초의 두 행이 서로를 건너뛴다. */
export type EventCursor = { occurredAt: Date; id: string };

/**
 * 좁히는 축 다섯 + 검색 + 커서 + 열린 이벤트.
 *
 * ⚠️ **기간은 `YYYY-MM-DD` 원문이다** — 네이티브 `<input type="date">`가 그 값을 그대로 쓰고,
 * 조회가 보는 UTC 구간은 `parseDateRange`가 만든다. 하나를 둘로 들면 입력창과 적용된 창이 어긋난다.
 */
export type LogFilter = {
  kind: LogKind;
  from: string | null;
  to: string | null;
  /** 사용자 id · `automation` · `removed`. 해석은 조회가 한다 (결정 8). */
  actor: string | null;
  /**
   * 소스 **slug** 여럿 + 특수값 `project-wide` (캔버스 `1m` — 다중 선택). 사건 당시 대상 집합에
   * 그중 하나라도 있으면 남는다 (결정 14).
   *
   * ⚠️ **id가 아니라 slug다** — URL은 사람이 읽고 공유하는 자리이고, 메뉴의 라벨과 같은 값이어야
   * 무엇을 고른 URL인지 보인다. id 해석은 조회가 한다.
   */
  sources: string[];
  /** 결과 여럿 (다중 선택). **실행에만 적용된다** — 메뉴 머리가 그 사실을 고르기 전에 말한다. */
  results: EventResult[];
  q: string | null;
  cursor: EventCursor | null;
  /** 열린 이벤트의 공개 참조. **목록 필터와 독립이다** (결정 15). */
  event: string | null;
};

/** 주소창 값이 쿼리 길이를 정하지 않는다. */
const MAX_TEXT = 200;

export function parseLogFilter(params: LogSearchParams): LogFilter {
  const range = parseDateRange(text(params.from), text(params.to));
  return {
    kind: oneOf(LOG_KINDS, text(params.kind)) ?? "all",
    // 구간이 성립하지 않으면 입력창도 비운다 — 남겨 두면 화면의 값과 적용된 창이 어긋난다.
    from: range.from === null ? null : text(params.from),
    to: range.to === null ? null : text(params.to),
    actor: text(params.actor),
    sources: list(params.source),
    results: list(params.result).filter((value): value is EventResult =>
      (EVENT_RESULTS as readonly string[]).includes(value),
    ),
    q: text(params.q),
    cursor: decodeCursor(text(params.cursor) ?? ""),
    event: text(params.event),
  };
}

/** 소스가 없는 사건(멤버 · 설정)을 고르는 값. 소스 slug와 겹칠 수 없다 — slug에 `-`는 되지만 이 낱말 전체는 예약이다. */
export const PROJECT_WIDE = "project-wide";

/**
 * 다중 선택 축의 URL 표현. **쉼표로 잇고 정렬·중복 제거한다** — 같은 선택이 두 URL로 갈리면
 * 공유한 주소가 서로 다른 문자열이 되고, 그 차이는 화면에 안 보인다.
 */
export function encodeList(values: readonly string[]): string | undefined {
  const unique = [...new Set(values.filter((value) => value !== ""))].sort();
  return unique.length === 0 ? undefined : unique.join(",");
}

function list(value: string | string[] | undefined): string[] {
  const raw = text(value);
  if (raw === null) return [];
  return [...new Set(raw.split(",").map((item) => item.trim()).filter((item) => item !== ""))].sort();
}

/** 필터 하나를 뗀 뒤의 URL 쿼리. **조립을 화면이 다시 하면 규칙이 두 벌이 된다** (`lib/keys/filters.ts`와 같은 형). */
export function logsQuery(filter: LogFilter): {
  kind?: string;
  from?: string;
  to?: string;
  actor?: string;
  source?: string;
  result?: string;
  q?: string;
  cursor?: string;
  event?: string;
} {
  return {
    ...(filter.kind === "all" ? {} : { kind: filter.kind }),
    ...(filter.from === null ? {} : { from: filter.from }),
    ...(filter.to === null ? {} : { to: filter.to }),
    ...(filter.actor === null ? {} : { actor: filter.actor }),
    ...(encodeList(filter.sources) === undefined ? {} : { source: encodeList(filter.sources) }),
    ...(encodeList(filter.results) === undefined ? {} : { result: encodeList(filter.results) }),
    ...(filter.q === null ? {} : { q: filter.q }),
    ...(filter.cursor === null ? {} : { cursor: encodeCursor(filter.cursor) }),
    ...(filter.event === null ? {} : { event: filter.event }),
  };
}

/** 좁히는 축이 하나라도 켜져 있나 — [Clear filters]가 서는 조건이다. */
export function hasNarrowing(filter: LogFilter): boolean {
  return filterChanged(EMPTY_FILTER, filter);
}

const EMPTY_FILTER: LogFilter = {
  kind: "all", from: null, to: null, actor: null, sources: [], results: [], q: null, cursor: null, event: null,
};

/** 필터를 전부 뗀 뒤의 쿼리. 커서도 함께 버린다 — 좁힘이 사라지면 이전 페이지의 커서가 뜻을 잃는다. */
export function clearedLogsQuery(filter: LogFilter): ReturnType<typeof logsQuery> {
  return logsQuery({ ...EMPTY_FILTER, event: filter.event });
}

/**
 * **커서를 버릴지** 판정. 조합이 바뀌었는데 커서를 재사용하면 첫 페이지가 비거나 중간부터 시작한다.
 *
 * ⚠️ **커서와 열린 이벤트는 좁히는 축이 아니다** — 그 둘까지 세면 [Older]가 영원히 첫 페이지를 내고,
 * 상세를 여닫는 것이 목록을 되감는다 (결정 15).
 */
export function filterChanged(prev: LogFilter, next: LogFilter): boolean {
  return (
    prev.kind !== next.kind ||
    prev.from !== next.from ||
    prev.to !== next.to ||
    prev.actor !== next.actor ||
    prev.q !== next.q ||
    encodeList(prev.sources) !== encodeList(next.sources) ||
    encodeList(prev.results) !== encodeList(next.results)
  );
}

/**
 * 네이티브 date 입력 둘 → **UTC 구간**. `to`는 **배타 상한**(다음 UTC 자정)이라 고른 날 하루가
 * 통째로 들어온다.
 *
 * ⚠️ **로컬 타임존으로 새지 않는다** — `new Date(y, m, d)`는 로컬 자정이고, 그러면 KST에서 고른
 * 하루가 UTC 기준 9시간 어긋난다 (POSTMORTEM 2026-09-19 계열).
 *
 * ⚠️ **역전된 쌍은 둘 다 버린다.** 한쪽만 남기면 사용자가 지정하지 않은 구간이 적용된다.
 */
export function parseDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
): { from: Date | null; to: Date | null } {
  const start = utcDay(from);
  const end = utcDay(to);
  if (start !== null && end !== null && start.getTime() > end.getTime()) return { from: null, to: null };
  return { from: start, to: end === null ? null : new Date(end.getTime() + DAY_MS) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD`만 받는다 — 부분 파싱하지 않는다(`2026-9-1`·`2026-02-30`은 값이 아니다). */
function utcDay(raw: string | null | undefined): Date | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const at = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return null;
  // `2026-02-30`은 `Date`가 3월로 굴린다 — 되돌려 찍어 같은 날인지 본다.
  return at.toISOString().slice(0, 10) === raw ? at : null;
}

/**
 * 키셋 커서. ⚠️ **`Buffer`를 쓰지 않는다** — 이 모듈은 잎이고 클라이언트가 값으로 읽는다.
 * `btoa`/`atob`는 latin1만 받으므로 퍼센트 인코딩을 한 겹 지난다.
 */
export function encodeCursor(cursor: EventCursor): string {
  const raw = btoa(encodeURIComponent(`${cursor.occurredAt.toISOString()}|${cursor.id}`));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(raw: string): EventCursor | null {
  const decoded = fromBase64Url(raw);
  if (decoded === null) return null;
  // ⚠️ id에 `|`가 들어갈 수 있다고 보고 **첫 구분자에서만** 자른다 (`lib/sync/view.ts`와 같은 판단).
  const at = decoded.indexOf("|");
  if (at === -1) return null;
  const occurredAt = new Date(decoded.slice(0, at));
  const id = decoded.slice(at + 1);
  if (Number.isNaN(occurredAt.getTime()) || id === "") return null;
  return { occurredAt, id };
}

function fromBase64Url(value: string): string | null {
  if (value === "" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const decoded = decodeURIComponent(atob(padded));
    return decoded === "" ? null : decoded;
  } catch {
    // 주소창 값이다 — 깨진 커서는 첫 페이지를 뜻하지 500이 아니다.
    return null;
  }
}

/** 반복 파라미터는 첫 값을 쓴다. 빈 문자열·공백은 없는 것과 같다. */
function text(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return null;
  const trimmed = first.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_TEXT);
}

/**
 * ⚠️ **배열 `includes`로 거른다** — 사전을 직접 인덱싱하면 `Object.prototype`에서 찾아진 값이 판정
 * 자리에 온다 (POSTMORTEM 2026-09-08·09).
 */
function oneOf<T extends string>(values: readonly T[], raw: string | null): T | null {
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : null;
}
