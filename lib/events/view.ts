import type { ReactNode } from "react";

import { m } from "@/lib/i18n";
import type { SurfaceImportResult } from "@/lib/import/result";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-failure";
import { languageName } from "@/lib/onboarding/language-name";

import type { EventCursor } from "./filter";
import type { EventKind, EventPayload, EventResult } from "./payload";

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

/**
 * 글리프 칩의 색 (캔버스 `1a` 근거 카드).
 *
 * ⚠️ **배지 톤 셋과 별도 축이다** — 칩은 **훑기용 보조**이고 뜻은 결과 열의 낱말과 문장이 든다.
 * 색만으로 구별되는 정보는 칩에 싣지 않았다.
 *
 * 규칙이 둘이다: **실행은 결과의 색**(성공 green · 보류/부분/거부 amber · 실패 red · 진행 중과
 * `Nothing to send`는 slate — 보낸 것이 없는 것은 성공이 아니다), **그 외는 종류의 색**.
 */
export type GlyphTone = "green" | "amber" | "red" | "slate" | "blue" | "teal" | "purple";

/** lucide 아이콘 이름. **소비자가 `satisfies`로 매핑을 고정한다** — 사전이 아니라 컴포넌트가 든다. */
export type GlyphIcon =
  | "languages"
  | "arrow-down-to-line"
  | "git-pull-request-arrow"
  | "file-json-2"
  | "globe"
  | "users"
  | "git-branch"
  | "key-round"
  | "archive"
  | "settings";

const RESULT_GLYPH_TONE: Readonly<Record<EventResult, GlyphTone>> = {
  imported: "green",
  sent: "green",
  deferred: "amber",
  partial: "amber",
  notStarted: "amber",
  failed: "red",
  running: "slate",
  nothingToSend: "slate",
  superseded: "slate",
};

const KIND_GLYPH_TONE: Readonly<Record<EventKind, GlyphTone>> = {
  TRANSLATION: "blue",
  SURFACE: "teal",
  MEMBER: "purple",
  SETTINGS: "slate",
  IMPORT: "slate",
  PUBLISH: "slate",
};

/**
 * ⚠️ **방향을 글리프가 함께 말한다** — 내보내기는 `git-pull-request-arrow`, 가져오기는
 * `arrow-down-to-line`이다. 같은 `SyncRun`에서 나왔다는 사실이 두 방향을 섞을 근거가 되지 않는다.
 */
export function eventGlyph(row: Pick<EventViewRow, "kind" | "result"> & { subtype: string }): {
  icon: GlyphIcon;
  tone: GlyphTone;
} {
  const run = row.kind === "IMPORT" || row.kind === "PUBLISH";
  const tone = run && row.result !== null ? RESULT_GLYPH_TONE[row.result] : KIND_GLYPH_TONE[row.kind];
  return { icon: glyphIcon(row.kind, row.subtype), tone };
}

function glyphIcon(kind: EventKind, subtype: string): GlyphIcon {
  switch (kind) {
    case "TRANSLATION":
      return "languages";
    case "IMPORT":
      return "arrow-down-to-line";
    case "PUBLISH":
      return "git-pull-request-arrow";
    case "SURFACE":
      // 소스 추가는 **파일 모양**, 기준 언어는 **지구본** — 같은 종류 안에서 무엇이 바뀌었는지 가른다.
      return subtype.startsWith("surface.baseLocale") ? "globe" : "file-json-2";
    case "MEMBER":
      return "users";
    default:
      if (subtype === "settings.baseBranchChanged") return "git-branch";
      if (subtype === "settings.pushTokenRotated") return "key-round";
      if (subtype === "settings.archived" || subtype === "settings.restored") return "archive";
      return "settings";
  }
}

/**
 * 행의 문장 (캔버스 §7 — **행위자로 시작한다**).
 *
 * ⚠️ **노드를 받아서 쓴다** — 굵은 행위자·mono 키의 **모양**은 컴포넌트가 정하고, 여기는
 * "어느 하위 종류가 어느 문장인가"만 정한다. 그 매핑이 컴포넌트 안으로 들어가면 갈래 누락을
 * 잡는 장치가 없어진다.
 *
 * ⚠️ **모르는 하위 종류는 던지지 않는다** — 종류 이름으로 떨어진다(읽는 쪽이 폴백을 든다).
 */
export function eventSentence(
  row: { kind: EventKind; subtype: string; result: EventResult | null; payload: EventPayload | null },
  nodes: { actor: ReactNode; key: ReactNode },
): ReactNode {
  const { actor } = nodes;
  const payload = row.payload;
  switch (row.kind) {
    case "TRANSLATION": {
      const locale = payload?.kind === "TRANSLATION" ? payload.locale : "";
      const cleared = payload?.kind === "TRANSLATION" && payload.after === "";
      const language = languageOf(locale);
      if (row.subtype === "translation.reverted") return m.logs.sentence.translation.reverted(actor, nodes.key, language);
      return cleared
        ? m.logs.sentence.translation.cleared(actor, nodes.key, language)
        : m.logs.sentence.translation.updated(actor, nodes.key, language);
    }
    case "PUBLISH":
      switch (row.result) {
        case "running":
          return m.logs.sentence.publish.running(actor);
        case "sent":
          return m.logs.sentence.publish.sent(actor);
        case "nothingToSend":
          return m.logs.sentence.publish.nothing(actor);
        case "notStarted":
          return m.logs.sentence.publish.notStarted(actor);
        default:
          return m.logs.sentence.publish.failed(actor);
      }
    case "IMPORT": {
      const slugs = payload?.kind === "IMPORT" ? payload.surfaceSlugs : [];
      switch (row.result) {
        case null:
        case "running":
          return m.logs.sentence.import.running(actor);
        case "deferred":
          return m.logs.sentence.import.deferred(actor, slugs[0] ?? m.logs.none);
        case "superseded":
          return m.logs.sentence.import.superseded(actor);
        case "notStarted":
          return m.logs.sentence.import.notStarted(actor);
        case "failed":
          return m.logs.sentence.import.failed(actor);
        default:
          return m.logs.sentence.import.imported(actor, Math.max(slugs.length, 1));
      }
    }
    case "MEMBER": {
      const target = payload?.kind === "MEMBER" ? payload.targetLabel : m.common.unreadable;
      if (row.subtype === "member.invited") return m.logs.sentence.member.invited(actor, target);
      if (row.subtype === "member.joined") return m.logs.sentence.member.joined(actor);
      if (row.subtype === "member.removed") return m.logs.sentence.member.removed(actor, target);
      if (row.subtype === "member.invitationRevoked") return m.logs.sentence.member.invitationRevoked(actor);
      return m.logs.sentence.member.roleChanged(actor, target);
    }
    case "SURFACE": {
      const slug = payload?.kind === "SURFACE" ? payload.surfaceSlug : m.logs.none;
      return row.subtype.startsWith("surface.baseLocale")
        ? m.logs.sentence.surface.baseLocale(actor, slug)
        : m.logs.sentence.surface.added(actor, slug);
    }
    default: {
      // ⚠️ **`Object.hasOwn`을 지난다** — `subtype`은 DB에서 온 자유 문자열이라 `__proto__`가
      // 값을 돌려주는 자리다 (POSTMORTEM 2026-09-08).
      const sentence = Object.hasOwn(SETTINGS_SENTENCE, row.subtype) ? SETTINGS_SENTENCE[row.subtype] : undefined;
      return sentence === undefined
        ? m.logs.sentence.fallback(actor, m.logs.kinds.settings)
        : sentence(actor);
    }
  }
}

const SETTINGS_SENTENCE: Record<string, (who: ReactNode) => ReactNode> = {
  "settings.projectCreated": m.logs.sentence.settings.created,
  "settings.nameChanged": m.logs.sentence.settings.name,
  "settings.baseBranchChanged": m.logs.sentence.settings.baseBranch,
  "settings.repositoryConnected": m.logs.sentence.settings.repository,
  "settings.pushTokenRotated": m.logs.sentence.settings.pushToken,
  "settings.imageChanged": m.logs.sentence.settings.image,
  "settings.imageRemoved": m.logs.sentence.settings.image,
  "settings.archived": m.logs.sentence.settings.archived,
  "settings.restored": m.logs.sentence.settings.restored,
};

/**
 * 로케일 코드 → 영어 언어 이름. **매핑이 실패하면 코드를 그대로 낸다** (`languageName`의 계약) —
 * 리포에서 온 임의 문자열이라 실패가 정상 갈래다.
 */
function languageOf(code: string): string {
  return code === "" ? m.logs.none : languageName(code);
}

/** 거부 여섯의 문장. 모르는 코드는 던지지 않고 폴백이다 (`reasonKey`와 같은 축). */
export function refusalMessage(code: string | null): string {
  const reasons: Record<string, string> = m.logs.refusals;
  const fallback = m.logs.refusals.fallback;
  return code !== null && Object.hasOwn(reasons, code) ? (reasons[code] ?? fallback) : fallback;
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

export type EventMetaRow = {
  kind: EventKind;
  subtype: string;
  result: EventResult | null;
  payload: EventPayload | null;
  actor: { kind: "USER" | "AUTOMATION" | "UNKNOWN" };
  run: { changed: number | null; prUrl: string | null; errorCode: string | null } | null;
};

export type EventMetaPart = string | { kind: "code" | "link"; text: string };

/** 적재 실패를 발송 실패 문구로 설명하면 복구 방향이 반대가 된다. */
export function eventFailureMessage(row: Pick<EventMetaRow, "kind" | "payload" | "run">, archived: boolean): string {
  if (row.kind !== "IMPORT") return planArchivedReason(row.run?.errorCode ?? "", archived);
  const code = row.payload?.kind === "IMPORT" ? row.payload.errorCode : null;
  return importReasonMessage(code);
}

export function importReasonMessage(code: string | null): string {
  if (isImportFailureCode(code)) return importFailureMessage(code);
  const reasons: Readonly<Record<string, string>> = m.repositorySync.errors;
  return code !== null && Object.hasOwn(reasons, code) ? reasons[code]! : m.projects.importFailure.importFailed;
}

/**
 * 보조줄 — **그 종류가 실제로 가진 맥락만** 적는다. 없는 값을 자리 채우려고 적지 않는다.
 *
 * ⚠️ **파일 수 `null`은 `—`이고 `0`이 아니다** — 0으로 적으면 "아무것도 안 바뀐 성공"과 같아진다.
 */
export function eventMeta(row: EventMetaRow, archived: boolean): EventMetaPart[] {
  const payload = row.payload;
  const parts: EventMetaPart[] = [];
  switch (row.kind) {
    case "TRANSLATION": {
      if (payload?.kind !== "TRANSLATION") break;
      parts.push(payload.surfaceSlug, payload.locale);
      const before = valueState(payload.before);
      const after = valueState(payload.after);
      parts.push(`${before.kind === "text" ? before.text : before.label} → ${after.kind === "text" ? after.text : after.label}`);
      break;
    }
    case "PUBLISH": {
      parts.push(m.logs.kinds.publish, row.actor.kind === "AUTOMATION" ? m.logs.meta.automatic : m.logs.meta.manual);
      parts.push(row.run?.changed === null || row.run === null ? `${m.logs.detail.labels.files}: ${m.logs.none}` : m.logs.meta.files(row.run.changed));
      if (row.run?.prUrl != null) parts.push({ kind: "link", text: m.translations.publish.viewLink });
      else if (row.result !== "running") parts.push(m.logs.meta.noPullRequest);
      if (payload?.kind === "PUBLISH" && payload.refusal !== null) parts.push(refusalMessage(payload.refusal));
      break;
    }
    case "IMPORT": {
      parts.push(m.logs.kinds.imports);
      if (payload?.kind !== "IMPORT") break;
      parts.push(payload.source === "ci" ? m.logs.meta.automatic : m.logs.meta.manual);
      if (payload.refusal !== null) parts.push(refusalMessage(payload.refusal), m.logs.meta.nothingImported);
      else if (row.result === "deferred" && payload.pendingEdits !== null) parts.push(m.logs.deferredReason(payload.pendingEdits));
      else if (payload.surfaces.length > 0) {
        parts.push(payload.surfaces.map((surface) => `${surface.surfaceSlug}: ${resultWord(surface.status)}${surface.count === null ? "" : `, ${m.logs.meta.keys(surface.count)}`}`).join(" · "));
      } else if (payload.keys !== null) parts.push(m.logs.meta.keys(payload.keys));
      if (row.result !== "deferred" && (payload.pendingEdits ?? 0) > 0) parts.push(m.repositorySync.kept(payload.pendingEdits!));
      break;
    }
    case "MEMBER": {
      parts.push(m.logs.kinds.members);
      if (payload?.kind !== "MEMBER") break;
      if (payload.role !== null) parts.push(`${roleWord(payload.role.before)} → ${roleWord(payload.role.after)}`);
      else parts.push(payload.targetLabel);
      break;
    }
    case "SURFACE": {
      parts.push(m.logs.kinds.sources);
      if (payload?.kind !== "SURFACE") break;
      if (payload.adapter !== null) parts.push({ kind: "code", text: payload.adapter });
      if (payload.baseLocale !== null) {
        parts.push(`${payload.baseLocale.before ?? m.logs.none} → ${payload.baseLocale.after ?? m.logs.none}`);
        if (row.subtype.startsWith("surface.baseLocale")) parts.push(m.logs.meta.declarationOnly);
      }
      break;
    }
    default: {
      parts.push(m.logs.kinds.settings);
      if (payload?.kind !== "SETTINGS") break;
      if (row.subtype === "settings.pushTokenRotated") parts.push(m.logs.meta.tokenEffect);
      else if (row.subtype === "settings.archived") parts.push(m.logs.meta.archivedEffect);
      else if (row.subtype === "settings.restored") parts.push(m.logs.meta.restoredEffect);
      else if (payload.value !== null) parts.push(`${payload.value.before ?? m.logs.none} → ${payload.value.after ?? m.logs.none}`);
      break;
    }
  }
  // 실패 사유는 마지막이다 — 보관 중이면 야간 절이 빠진다 (`planArchivedReason`).
  if (row.result === "failed") {
    parts.push(eventFailureMessage(row, archived));
  }
  return parts;
}

function resultWord(status: "imported" | "partial" | "failed" | "superseded"): string {
  if (status === "imported") return m.logs.status.imported;
  if (status === "partial") return m.logs.status.partial;
  if (status === "superseded") return m.logs.status.superseded;
  return m.logs.status.failed;
}

function roleWord(role: string | null): string {
  return role === null ? m.logs.none : role.charAt(0) + role.slice(1).toLowerCase();
}
