import { m } from "@/lib/i18n";
import type { SurfaceImportResult } from "@/lib/import/result";

import type { EventCursor } from "./filter";
import type { EventKind, EventResult } from "./payload";

/**
 * Logs 행의 **순수 판정** (logs-rework design §6). `lib/sync/view.ts`와 같은 형이다 —
 * 화면이 `kind`로 삼항을 엮으면 갈래가 JSX 안에 흩어지고 그 자리에는 누락을 잡는 장치가 없다.
 *
 * ⚠️ **잎이다** — 사전과 `./payload`까지다. 조회(`lib/events/query.ts`)를 물면 그 순간 Prisma가
 * 클라이언트 번들에 들어온다 (POSTMORTEM 2026-09-07의 7.2MB 청크).
 */

/** ⚠️ **`Badge` variant와 같은 이름이다** (DESIGN §6.2) — 화면이 매핑 표를 또 들지 않는다. */
export type EventTone = "muted" | "warning" | "danger";

export type EventViewRow = {
  kind: EventKind;
  /** **실행에만 붙는다.** 비실행 사건은 `null`이고 결과 열은 빈 채 폭을 유지한다. */
  result: EventResult | null;
  warnings: number;
  errorCode: string | null;
};

export type EventView = {
  tone: EventTone;
  /** `null`이면 그 종류에 결과가 없다 — 빈 문자열과 구별된다. */
  label: string | null;
  /** `N dropped`. **결과와 독립이다** — 성공한 행에도 붙는다(불변식 9). */
  warningsLabel: string | null;
  /** 실패가 아니면 `null`. 모르는 코드는 `"fallback"`이다. */
  reasonKey: ReasonKey | null;
};

/**
 * 결과 → 배지 색. **셋뿐이라 낱말이 구별을 든다** (DESIGN §6.2는 새 raw 색을 금지한다).
 * 가장 흔한 다섯이 가장 조용하고, 사람이 고쳐야 풀리는 셋만 warning이며, 실패만 danger다.
 */
const TONES: Readonly<Record<EventResult, EventTone>> = {
  running: "muted",
  sent: "muted",
  nothingToSend: "muted",
  imported: "muted",
  superseded: "muted",
  deferred: "warning",
  partial: "warning",
  notStarted: "warning",
  failed: "danger",
};

const LABELS: Readonly<Record<EventResult, string>> = {
  running: m.logs.status.running,
  sent: m.logs.status.succeeded,
  nothingToSend: m.logs.status.skipped,
  imported: m.logs.status.imported,
  deferred: m.logs.status.deferred,
  partial: m.logs.status.partial,
  superseded: m.logs.status.superseded,
  notStarted: m.logs.status.notStarted,
  failed: m.logs.status.failed,
};

export function eventView(row: EventViewRow): EventView {
  const result = row.result;
  return {
    tone: result === null ? "muted" : TONES[result],
    label: result === null ? null : LABELS[result],
    // 음수는 없는 것으로 읽는다 — 화면에 `-1 dropped`를 내지 않는다.
    warningsLabel: row.warnings > 0 ? m.logs.warnings(row.warnings) : null,
    reasonKey: result === "failed" ? reasonKey(row.errorCode) : null,
  };
}

/**
 * 사유 문장의 키. **소비자가 `satisfies`를 건다** — `messages/en.tsx`에서 union을 import하면 그
 * 파일이 잎이 아니게 되고 그 그래프가 곧 클라이언트 번들이다 (`lib/sync/view.ts`와 같은 형).
 */
export type ReasonKey = keyof typeof m.logs.reasons;

const REASON_KEYS = Object.keys(m.logs.reasons) as ReasonKey[];

function reasonKey(errorCode: string | null): ReasonKey {
  // ⚠️ **배열 `includes`다** — 사전을 직접 인덱싱하면 `__proto__`가 값을 돌려준다 (POSTMORTEM 2026-09-08).
  if (errorCode !== null && (REASON_KEYS as readonly string[]).includes(errorCode)) return errorCode as ReasonKey;
  return "fallback";
}

/**
 * 보관된 프로젝트의 실패 사유.
 *
 * ⚠️ **야간 발송이 보관 프로젝트를 건너뛴다** (`lib/pull/targets.ts`의 `archivedAt === null` 필터) —
 * 그래서 "The next nightly run tries again."이 **거짓이 된다.** 사전 문구를 고쳐도 검사가 남도록
 * `view.test.ts`가 "보관이면 어느 사유에도 nightly가 없다"를 전 갈래로 센다.
 */
const NIGHTLY_CLAUSE = "The next nightly run tries again.";

export function planArchivedReason(key: string, archived: boolean): string {
  const sentence = m.logs.reasons[reasonKey(key)];
  if (!archived) return sentence;
  return sentence.replace(NIGHTLY_CLAUSE, "").replace(/\s{2,}/g, " ").trim();
}

/** `Unavailable`을 뜻하는 입력. **문자열 센티넬이 아니다** — 실제 값이 그것과 같을 수 있다. */
export type RecordedValue = string | null | undefined | { unavailable: true };

export type ValueView = { kind: "text"; text: string } | { kind: "state"; label: string };

/**
 * 값 하나 → 화면이 그리는 것. **빈 칸을 만들지 않는 규칙의 유일한 관문이다** (spec §6).
 *
 * `undefined`는 **해당 없음**(그 종류가 그 필드를 갖지 않는다)이고 `null`은 **수집하지 않았다**이다 —
 * 둘을 한 낱말로 접으면 "없다"와 "모른다"가 같은 말이 된다 (POSTMORTEM 2026-09-03).
 */
export function valueState(value: RecordedValue): ValueView {
  if (value === undefined) return { kind: "state", label: m.logs.none };
  if (value === null) return { kind: "state", label: m.logs.value.notRecorded };
  if (typeof value === "object") return { kind: "state", label: m.logs.value.unavailable };
  if (value === "") return { kind: "state", label: m.logs.value.empty };
  // 코드 포인트로 센다 — 서로게이트 쌍이 두 글자로 세어지면 "보이지 않는 차이"의 수가 틀린다.
  if (value.trim() === "") return { kind: "state", label: m.logs.value.spacesOnly([...value].length) };
  return { kind: "text", text: value };
}

export type DayGroup<T> = { dayKey: string; label: string; rows: T[] };

/**
 * 날짜 카드 — **UTC 자정으로 끊는다.**
 *
 * ⚠️ **`now`를 서버가 하나 내린다** (design §6). 행마다 만들면 기준이 흔들려 같은 목록의 위아래가
 * 다른 날을 "오늘"이라고 말할 수 있다.
 *
 * ⚠️ **입력 순서를 보존한다** — 조회가 이미 `(occurredAt desc, id desc)`로 정렬해 내려준다.
 */
export function groupByDay<T extends { occurredAt: Date }>(rows: readonly T[], now: Date): DayGroup<T>[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const groups = new Map<string, DayGroup<T>>();
  for (const row of rows) {
    const key = dayKey(row.occurredAt);
    const group = groups.get(key) ?? { dayKey: key, label: dayLabel(key, today, yesterday), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function dayLabel(key: string, today: string, yesterday: string): string {
  if (key === today) return m.logs.day.today;
  if (key === yesterday) return m.logs.day.yesterday;
  return key;
}

/**
 * 수집 공백 경계선이 **몇 번째 행 위**에 서는지. 없으면 `-1`이다 (spec §7.1 — 결정 11).
 *
 * ⚠️ **개시 시각을 모르면 그리지 않는다.** 가장 이른 이벤트나 마이그레이션 시각으로 추정하면
 * 화면이 없는 사실을 말한다 — 그것이 정확히 이 기능이 피하려는 부류다.
 *
 * ⚠️ **선이 두 번 그려지지 않는다** — 커서가 이미 개시 이전이면 후속 페이지는 반복하지 않는다.
 */
export function coverageBoundaryIndex(
  rows: readonly { occurredAt: Date }[],
  coverageStart: Date | null,
  cursor: EventCursor | null,
): number {
  if (coverageStart === null) return -1;
  const start = coverageStart.getTime();
  if (cursor !== null && cursor.occurredAt.getTime() < start) return -1;
  return rows.findIndex((row) => row.occurredAt.getTime() < start);
}

/**
 * 소스별 결과 → 결과 어휘 (spec §6). `summarizeImport`의 tone 판정과 같은 근거이고, 이쪽은
 * **낱말**을 낸다.
 *
 * ⚠️ **빈 결과를 전체 성공으로 접지 않는다** — 관측이 없었다는 것은 성공이 아니다.
 */
export function summarizeImportEvent(
  results: readonly SurfaceImportResult[],
): Extract<EventResult, "imported" | "partial" | "superseded" | "failed"> {
  if (results.length === 0) return "failed";
  if (results.every((result) => result.status === "imported")) return "imported";
  if (results.every((result) => result.status === "superseded")) return "superseded";
  if (results.some((result) => result.status === "imported" || result.status === "partial")) return "partial";
  return "failed";
}
