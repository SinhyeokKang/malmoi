/**
 * 프로젝트 활동 스트림의 **어휘와 종류별 맥락** (logs-rework design §2).
 *
 * ⚠️ **잎이다 — import가 0이다.** 판정 모듈 셋(`view`·`filter`·`search`)이 전부 이것을 물고, 그중
 * 둘은 클라이언트가 값으로 읽는다 (`components/__tests__/client-graph.test.ts`).
 *
 * ⚠️ **`@/generated/prisma/client`를 값으로 import하지 않는다** — `lib/sync/view.ts`와 같은 근거로
 * enum을 **문자열 union으로 다시 적는다.** 스키마와 어긋나면 조회 함수의 반환 타입이 컴파일에서 걸린다.
 */

/** 사건의 종류 여섯. URL의 `?kind=`는 화면 낱말(`LOG_KINDS`)이고 이것은 저장 값이다. */
export const EVENT_KINDS = ["TRANSLATION", "IMPORT", "PUBLISH", "SURFACE", "MEMBER", "SETTINGS"] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * 행위자의 종류. **`USER`인데 FK가 비었으면 계정이 지워진 사람이다**(`SetNull`) — `AUTOMATION`·
 * `UNKNOWN`과 구별된다 (결정 8).
 */
export const ACTOR_KINDS = ["USER", "AUTOMATION", "UNKNOWN"] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];

/**
 * 결과 어휘 열 (spec §6 — `notSent`는 delivery-invariants D7이 더했다). **실행에만 붙는다** — 비실행 사건의 결과는 `null`이고, 화면은 그 칸을
 * 빈 채 폭만 유지한다. `N dropped`는 여기 없다: 그것은 결과와 **독립으로** 붙는 경고다(불변식 9).
 */
export const EVENT_RESULTS = [
  "running",
  "sent",
  "nothingToSend",
  /** Publish 전용 — 실린 편집 0 + 보류 > 0 (delivery-invariants D7). `SKIPPED`인데 `SyncRun.withheld > 0`인 행이다. */
  "notSent",
  "imported",
  "deferred",
  "partial",
  "superseded",
  "notStarted",
  "failed",
] as const;

export type EventResult = (typeof EVENT_RESULTS)[number];

/**
 * `Not started`로 남기는 거부 **여섯뿐이다** (spec §6.1 — 결정 7). 다음 번에도 같은 이유로 거부될
 * 것만 남긴다. `already-running`·`too-soon`·400 검증 오류·no-op은 쓰지 않는다.
 *
 * ⚠️ **`wrong-format`이지 `format-mismatch`가 아니다** — `lib/push/guard.ts`의 `GuardResult`가 쓰는
 * 낱말이고, 같은 거부에 이름을 둘 만들면 그중 하나가 낡는다.
 */
export const NOT_STARTED_REASONS = [
  "archived",
  "not-ready",
  "stale-commit",
  "wrong-format",
  "repo-replaced",
  "not-installed",
] as const;

export type NotStartedReason = (typeof NOT_STARTED_REASONS)[number];

/** 실행을 시작한 자리. `reported-failure`는 `/api/push/failure`가 받은 보고다. */
export const IMPORT_SOURCES = ["ci", "manual", "first", "reported-failure"] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** 전후 값. **전문 그대로다** — 상한은 이미 저장 층이 10,000자로 든다 (결정 5). */
export type ValueChange = { before: string | null; after: string | null };

/**
 * 관측된 소스별 결과. ⚠️ **실행 전체 값을 소스별로 나누어 추정하지 않는다** (spec §3.C.15) —
 * 수집하지 못한 값은 `null`이고 화면이 `Not recorded`로 읽는다.
 */
export type SurfaceOutcome = {
  surfaceSlug: string;
  status: "imported" | "partial" | "failed" | "superseded";
  count: number | null;
  reason: string | null;
};

/**
 * 종류별 맥락 (spec §10 결정 2 — 여기서 닫는다).
 *
 * ⚠️ **`kind`로 판별하는 union이다.** DB는 `kind` 컬럼과 `payload` Json을 나눠 들지만, 쓰는 쪽은
 * 언제나 둘을 함께 아는 자리에 있다 — 인자를 둘로 쪼개면 짝이 어긋난 조합이 타입으로 통과한다.
 *
 * ⚠️ **토큰 값·해시·초대 링크 원문은 어느 갈래에도 없다** (spec §3.C.14 · T5c). 있는 것은
 * "발급/교체했다"는 사실뿐이고, 초대 대상은 **마스킹 라벨**이다.
 */
export type EventPayload =
  | {
      kind: "TRANSLATION";
      surfaceSlug: string;
      key: string;
      locale: string;
      before: string | null;
      after: string | null;
    }
  | {
      kind: "IMPORT";
      source: ImportSource;
      /** 실행이 **시작 시점에 잡은** 대상 소스 전부. 이후 소스를 더해도 과거 집합은 바뀌지 않는다. */
      surfaceSlugs: readonly string[];
      keys: number | null;
      /** 보류 시 보호한 편집 수, 수동 적재 종료 시 남은 편집 수. 수집하지 않으면 `null`이다. */
      pendingEdits: number | null;
      surfaces: readonly SurfaceOutcome[];
      errorCode: string | null;
      refusal: NotStartedReason | null;
    }
  | {
      /** ⚠️ **결과·파일 수·PR은 없다** (결정 1) — 조회가 `SyncRun`을 조인해 읽는다. 복제하지 않는다. */
      kind: "PUBLISH";
      surfaceSlugs: readonly string[];
      refusal: NotStartedReason | null;
    }
  | {
      kind: "SURFACE";
      surfaceSlug: string;
      adapter: string | null;
      baseLocale: ValueChange | null;
    }
  | {
      /** ⚠️ **원문 이메일이 아니라 마스킹 라벨이다** (sec-audit 발견 4). */
      kind: "MEMBER";
      targetLabel: string;
      role: ValueChange | null;
    }
  | {
      kind: "SETTINGS";
      field: string;
      value: ValueChange | null;
    };

/**
 * 실행 하나를 가리키는 **멱등 키**. 서버가 실행 종류와 소스 범위를 붙인다 (design §3.3).
 *
 * ⚠️ **외부 식별자를 그대로 쓰지 않는다.** CI가 보낸 `executionId`는 인증 증거가 아니므로, 내부
 * Publish·수동 Sync의 식별자와 **충돌할 수 없도록** 종류 접두와 인가된 소스 id를 함께 붙인다.
 * 이 값이 `@@unique([projectId, runToken])`에 걸려 재전달·동시 요청을 DB 층에서 한 건으로 만든다.
 */
export type RunTokenInput =
  | { kind: "publish"; syncRunId: string }
  | { kind: "import"; token: string }
  /** 가드가 표면을 정하기 전에 거부하면 `surfaceId`가 없다 — 그때도 실행 하나는 하나다. */
  | { kind: "ci"; surfaceId: string | null; executionId: string };

export function runTokenFor(input: RunTokenInput): string {
  switch (input.kind) {
    case "publish":
      return `publish:${input.syncRunId}`;
    case "import":
      return `import:${input.token}`;
    default:
      return `ci:${input.surfaceId ?? "-"}:${input.executionId}`;
  }
}

/**
 * 사건 당시 대상 소스 — **정렬·중복 제거한 집합**이다. 순서가 흔들리면 같은 사건이 다른 배열로
 * 저장되고, 그 차이는 화면에도 테스트에도 안 나타난다(불변식 4의 결이다).
 */
export function normalizeSurfaceIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id !== ""))].sort();
}

/** 사건 당시 대상 소스의 성격. ⚠️ **빈 배열 하나로는 "전역"과 "모른다"가 같은 모양이 된다.** */
export const SURFACE_SCOPES = ["sources", "project-wide", "not-recorded"] as const;

export type SurfaceScope = (typeof SURFACE_SCOPES)[number];

/**
 * 저장된 Json → 종류별 맥락. **읽는 쪽이 폴백을 든다** — 옛 행·다른 버전이 쓴 payload가 와도
 * 화면이 죽지 않고 `Not recorded`로 떨어져야 한다.
 *
 * ⚠️ **`Object.hasOwn`으로 읽는다** (CLAUDE.md · POSTMORTEM 2026-09-08). `payload[key] ?? fallback`은
 * `Object.prototype`에서 찾아진 값을 못 막아 문자열 자리에 **함수**가 온다 — 번역 키가 이 안에
 * 들어가므로 남이 정한 키가 실제로 닿는 자리다.
 */
export function readPayload(kind: EventKind, value: unknown): EventPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  switch (kind) {
    case "TRANSLATION":
      return {
        kind,
        surfaceSlug: str(raw, "surfaceSlug") ?? "",
        key: str(raw, "key") ?? "",
        locale: str(raw, "locale") ?? "",
        before: str(raw, "before"),
        after: str(raw, "after"),
      };
    case "IMPORT":
      return {
        kind,
        source: oneOfRaw(IMPORT_SOURCES, str(raw, "source")) ?? "ci",
        surfaceSlugs: strings(raw, "surfaceSlugs"),
        keys: num(raw, "keys"),
        pendingEdits: num(raw, "pendingEdits"),
        surfaces: outcomes(raw),
        errorCode: str(raw, "errorCode"),
        refusal: oneOfRaw(NOT_STARTED_REASONS, str(raw, "refusal")),
      };
    case "PUBLISH":
      return { kind, surfaceSlugs: strings(raw, "surfaceSlugs"), refusal: oneOfRaw(NOT_STARTED_REASONS, str(raw, "refusal")) };
    case "SURFACE":
      return { kind, surfaceSlug: str(raw, "surfaceSlug") ?? "", adapter: str(raw, "adapter"), baseLocale: change(raw, "baseLocale") };
    case "MEMBER":
      return { kind, targetLabel: str(raw, "targetLabel") ?? "", role: change(raw, "role") };
    default:
      return { kind: "SETTINGS", field: str(raw, "field") ?? "", value: change(raw, "value") };
  }
}

function str(raw: Record<string, unknown>, key: string): string | null {
  const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
  return typeof value === "string" ? value : null;
}

function num(raw: Record<string, unknown>, key: string): number | null {
  const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strings(raw: Record<string, unknown>, key: string): string[] {
  const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function change(raw: Record<string, unknown>, key: string): ValueChange | null {
  const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const inner = value as Record<string, unknown>;
  return { before: str(inner, "before"), after: str(inner, "after") };
}

function outcomes(raw: Record<string, unknown>): SurfaceOutcome[] {
  const value = Object.hasOwn(raw, "surfaces") ? raw.surfaces : undefined;
  if (!Array.isArray(value)) return [];
  const out: SurfaceOutcome[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const inner = item as Record<string, unknown>;
    const status = oneOfRaw(OUTCOME_STATUSES, str(inner, "status"));
    if (status === null) continue;
    out.push({ surfaceSlug: str(inner, "surfaceSlug") ?? "", status, count: num(inner, "count"), reason: str(inner, "reason") });
  }
  return out;
}

const OUTCOME_STATUSES = ["imported", "partial", "failed", "superseded"] as const;

/** ⚠️ **배열 `includes`다** — 사전 인덱싱은 프로토타입 키에 값을 돌려준다. */
function oneOfRaw<T extends string>(values: readonly T[], raw: string | null): T | null {
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : null;
}

/**
 * `?kind=`의 값 일곱. **URL은 사용자가 읽는 자리라 화면의 낱말을 쓴다** — 저장 값(`EventKind`)과
 * 갈리는 이유가 그것이다 (`KEY_STATES`와 같은 판정).
 */
export const LOG_KINDS = ["all", "translations", "imports", "publish", "sources", "members", "settings"] as const;

export type LogKind = (typeof LOG_KINDS)[number];

/** 화면 낱말 → 저장 값. `all`은 좁히지 않으므로 `null`이다. */
export function eventKindOf(kind: LogKind): EventKind | null {
  switch (kind) {
    case "translations":
      return "TRANSLATION";
    case "imports":
      return "IMPORT";
    case "publish":
      return "PUBLISH";
    case "sources":
      return "SURFACE";
    case "members":
      return "MEMBER";
    case "settings":
      return "SETTINGS";
    default:
      return null;
  }
}
