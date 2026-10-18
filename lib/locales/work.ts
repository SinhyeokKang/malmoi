import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { compareCodeUnits } from "@/lib/compare";

import { localeEffects, normalizeLocaleEffects, type LocaleEffect, type LocaleOperation } from "./effects";

/**
 * **언어 변경 작업** (locale-add design §1·§4 — orch O4). 작업 = 소스별 **현재 효과 목록 ≠ 전달 목록**이다. 셀 편집 수(`pendingWhere`)와
 * 섞지 않고 따로 센다 — Publish 조기 종료·야간 판정·미리보기·Unsent 배지가 이 모듈을 부른다(B2·B3·C1).
 *
 * ⚠️ **호출자의 스냅샷에서 읽는다** — `db`로 tx를 받으면 그 tx의 시점이다. Publish 캡처는 RepeatableRead 스냅샷을, 만료는 잠금 뒤 tx를 넘긴다.
 * ⚠️ `server-only`를 붙이지 않는다 — 격리 PG 통합 테스트가 직접 부른다.
 * ⚠️ 코드를 객체 프로퍼티로 쓰지 않는다 — Map·배열이다(`__proto__`).
 */

type Db = Prisma.TransactionClient | PrismaClient;

/** 저장된 jsonb → 정규 목록. 모양이 틀린 원소는 버린다 — 다른 버전이 쓴 값이 와도 읽는 쪽이 죽지 않는다. NULL은 전달한 것 없음이다. */
export function parseDeliveredLocaleChanges(value: unknown): LocaleEffect[] {
  if (!Array.isArray(value)) return [];
  const effects: LocaleEffect[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    // ⚠️ `Object.hasOwn` — 상속된 필드를 값으로 읽지 않는다(POSTMORTEM 2026-09-08).
    const localeCode = Object.hasOwn(raw, "localeCode") ? raw.localeCode : undefined;
    const effect = Object.hasOwn(raw, "effect") ? raw.effect : undefined;
    if (typeof localeCode !== "string" || localeCode === "") continue;
    if (effect !== "create" && effect !== "delete") continue;
    effects.push({ localeCode, effect });
  }
  return normalizeLocaleEffects(effects);
}

/** 확인 행 → 전달 목록. 행이 없으면 `[]`, 무효화 중(`invalidatedAt`)이면 `null` — 확인 안 됨이다(design §1). */
export function deliveredOf(row: { deliveredLocaleChanges: unknown; invalidatedAt: Date | null } | null): LocaleEffect[] | null {
  if (row === null) return [];
  if (row.invalidatedAt !== null) return null;
  return parseDeliveredLocaleChanges(row.deliveredLocaleChanges);
}

/**
 * **확인보다 뒤에 낸 요청의 효과는 전달로 세지 않는다** (F1 fix1 — design §1). 전달 목록은 "그 효과가 어느 요청의 것인가"를 모른다 — 전달 후 취소로
 * 행 없이 남은 목록은 PR이 머지 없이 닫혀도 만료할 행이 없어 그대로이고, 그 뒤 같은 언어를 다시 요청하면 현재 = 전달이 되어 Publish가 싣지 않고 다음
 * 방문이 새 요청을 지운다(#266과 같은 결과). 그래서 확인한 실행이 시작된 뒤(같은 밀리초 포함)에 낸 요청의 코드는 목록에서 빼고 견준다.
 *
 * 경계는 **확인 행의 `syncRunId`가 가리키는 `SyncRun.startedAt`**이다 — 실행 시작 tx가 `Project` 잠금 뒤에 찍고, 스냅샷 캡처는 그 뒤이며, 언어 요청도
 * 같은 잠금 뒤에 쓴다. 그래서 이 시각보다 앞선 요청은 그 스냅샷에 실렸다. 시작 뒤·캡처 전의 요청은 실렸어도 미전달로 세지만 대가는 Publish 한 번
 * 더다(안전한 쪽). ⚠️ 성공 확정 시각(`finishedAt`·`lastPublishedAt`)을 쓰면 캡처 뒤에 낸 요청이 전달로 셈해져 같은 결함이 돌아온다.
 * ⚠️ **그 요청이 현재 효과를 낼 때만 뺀다** — 값 0개 ADD처럼 파일을 내지 않는 요청까지 빼면 옛 효과(열린 PR에 남았을 수 있는 새 파일)가 작업에서
 * 사라져 Publish가 그것을 거두지 않는다. 남겨 두면 현재 ≠ 전달이라 Publish가 한 번 돌아 수렴한다(안전한 쪽).
 * 작업 수·Publish 계획·만료·제거 미리보기(`lib/locales/change.ts`)가 이 규칙 하나를 쓴다.
 */
export function deliveredForRequests(
  delivered: readonly LocaleEffect[] | null,
  rows: readonly { localeCode: string; requestedAt: Date }[],
  confirmedFrom: Date | null,
  current: readonly LocaleEffect[],
): LocaleEffect[] | null {
  if (delivered === null) return null;
  if (confirmedFrom === null) return [...delivered];
  const producing = new Set(current.map(effect => effect.localeCode));
  const fresh = new Set(rows.filter(row => row.requestedAt.getTime() >= confirmedFrom.getTime() && producing.has(row.localeCode)).map(row => row.localeCode));
  return delivered.filter(effect => !fresh.has(effect.localeCode));
}

export type LocaleWorkItem = { localeCode: string; current: LocaleEffect["effect"] | null; delivered: LocaleEffect["effect"] | null };

/**
 * 언어별 작업 — 현재와 전달의 효과가 다른 코드. 코드순이다.
 *
 * ⚠️ **`delivered: null`(확인 안 됨)은 빈 목록으로 본다** — 현재 효과 전부가 미전달이다. 확인 없이 지운 효과(취소)는 셀 수 없어 작업으로
 * 남기지 않는다. 무효화는 Publish 시작에서 걸리고 그 Publish의 성공 확인이 다시 쓰므로, 남는 창은 실패한 실행 뒤뿐이다.
 */
export function localeWork(current: readonly LocaleEffect[], delivered: readonly LocaleEffect[] | null): LocaleWorkItem[] {
  const now = new Map(normalizeLocaleEffects(current).map(effect => [effect.localeCode, effect.effect]));
  const sent = new Map(normalizeLocaleEffects(delivered ?? []).map(effect => [effect.localeCode, effect.effect]));
  const codes = [...new Set([...now.keys(), ...sent.keys()])].sort(compareCodeUnits);
  return codes.flatMap(localeCode => {
    const item = { localeCode, current: now.get(localeCode) ?? null, delivered: sent.get(localeCode) ?? null };
    return item.current === item.delivered ? [] : [item];
  });
}

/**
 * 로케일별 **값 있는 번역 수** — 활성 키의 비지 않은 값만 센다. 값 0개 ADD는 파일을 내지 않는다(`localeEffects`).
 * ⚠️ Publish 계획(`planLocalePublish`의 `valueCounts`)도 이 함수로 센다 — 세는 규칙이 둘이면 작업과 실제 파일이 갈린다.
 */
export async function readLocaleValueCounts(db: Db, projectId: string, surfaceIds: readonly string[], codes: readonly string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (surfaceIds.length === 0 || codes.length === 0) return out;
  const rows = await db.$queryRaw<{ surfaceId: string; localeCode: string; n: number }[]>`
    SELECT t."surfaceId", t."localeCode", count(*)::int AS n
    FROM "Translation" t
    JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
    WHERE t."projectId" = ${projectId} AND t."surfaceId" = ANY(${[...surfaceIds]}::text[]) AND t."localeCode" = ANY(${[...codes]}::text[])
      AND t."value" <> '' AND NOT k."orphaned"
    GROUP BY t."surfaceId", t."localeCode"`;
  for (const row of rows) {
    const counts = out.get(row.surfaceId) ?? new Map<string, number>();
    counts.set(row.localeCode, row.n);
    out.set(row.surfaceId, counts);
  }
  return out;
}

export type SurfaceLocaleState = {
  surfaceId: string;
  rows: { localeCode: string; operation: LocaleOperation; orphaned: boolean; requestedAt: Date }[];
  /** ADD 언어의 값 있는 번역 수 — 행이 없는 코드는 0이다. */
  valueCounts: Map<string, number>;
  current: LocaleEffect[];
  /** 견줄 전달 목록 — 확인보다 뒤에 낸 요청의 코드를 뺀 것이다(`deliveredForRequests`). `null`은 확인 안 됨(무효화 중). */
  delivered: LocaleEffect[] | null;
  /** 저장된 전달 목록 그대로 — 만료가 그 효과를 빼고 다시 쓸 때만 읽는다. 판정에 쓰지 않는다. */
  storedDelivered: LocaleEffect[] | null;
  work: LocaleWorkItem[];
};

type LocaleChangeRead = { surfaceId: string; localeCode: string; operation: LocaleOperation; requestedAt: Date; locale: { orphaned: boolean } };
type ConfirmationRead = { surfaceId: string; deliveredLocaleChanges: unknown; invalidatedAt: Date | null; syncRun: { startedAt: Date } };

const LOCALE_CHANGE_SELECT = { surfaceId: true, localeCode: true, operation: true, requestedAt: true, locale: { select: { orphaned: true } } } as const;
const CONFIRMATION_SELECT = { surfaceId: true, deliveredLocaleChanges: true, invalidatedAt: true, syncRun: { select: { startedAt: true } } } as const;

/**
 * 한 프로젝트의 요청 행·확인 행·값 수 → 소스별 상태 (language-request-todo design §2). 프로젝트별 읽기(`readLocaleStates`)와 일괄 읽기
 * (`readLocaleStatesByProject`)가 이 함수 하나로 접는다 — 접기가 두 벌이면 `deliveredForRequests` 같은 규칙이 한쪽에서만 빠진다(POSTMORTEM 2026-10-14).
 * 행이 있거나 전달 목록이 비지 않은 소스만 돌려준다 — 둘 다 없으면 작업이 생길 수 없다.
 * ⚠️ **소스 id순이다** — 승인 지문(`lib/import/approval.ts`)이 이 순서에 기댄다.
 */
export function foldLocaleStates(changes: readonly LocaleChangeRead[], confirmations: readonly ConfirmationRead[], valueCounts: Map<string, Map<string, number>>): SurfaceLocaleState[] {
  const deliveredBy = new Map(confirmations.map(row => [row.surfaceId, deliveredOf(row)]));
  const confirmedFromBy = new Map(confirmations.map(row => [row.surfaceId, row.syncRun.startedAt]));
  const rowsBy = new Map<string, SurfaceLocaleState["rows"]>();
  for (const change of changes) {
    const rows = rowsBy.get(change.surfaceId) ?? [];
    rows.push({ localeCode: change.localeCode, operation: change.operation, orphaned: change.locale.orphaned, requestedAt: change.requestedAt });
    rowsBy.set(change.surfaceId, rows);
  }
  const ids = [...new Set([...rowsBy.keys(), ...[...deliveredBy].filter(([, list]) => list !== null && list.length > 0).map(([id]) => id)])].sort(compareCodeUnits);
  return ids.map(id => {
    const rows = (rowsBy.get(id) ?? []).sort((a, b) => compareCodeUnits(a.localeCode, b.localeCode));
    const counts = valueCounts.get(id) ?? new Map<string, number>();
    const current = localeEffects(rows, counts);
    const confirmed = deliveredBy.get(id);
    const storedDelivered = confirmed === undefined ? [] : confirmed;
    const delivered = deliveredForRequests(storedDelivered, rows, confirmedFromBy.get(id) ?? null, current);
    return { surfaceId: id, rows, valueCounts: counts, current, delivered, storedDelivered, work: localeWork(current, delivered) };
  });
}

/**
 * 활성 소스별 언어 변경 상태(`foldLocaleStates`). 소스 id순이다.
 * ⚠️ 보관된 소스는 뺀다 — 제거된 소스의 의도가 Publish·작업 수로 새지 않는다(그 처리는 소스 제거·재등록 승인이 맡는다).
 */
export async function readLocaleStates(db: Db, projectId: string, surfaceId?: string): Promise<SurfaceLocaleState[]> {
  const surfaceWhere = { projectId, archivedAt: null, ...(surfaceId === undefined ? {} : { id: surfaceId }) };
  const changes = await db.localeChange.findMany({
    where: { projectId, ...(surfaceId === undefined ? {} : { surfaceId }), locale: { surface: surfaceWhere } },
    select: LOCALE_CHANGE_SELECT,
  });
  const confirmations = await db.deliveryConfirmation.findMany({
    where: { projectId, ...(surfaceId === undefined ? {} : { surfaceId }), surface: surfaceWhere },
    select: CONFIRMATION_SELECT,
  });
  const adds = changes.filter(change => change.operation === "ADD");
  const counts = await readLocaleValueCounts(db, projectId, [...new Set(adds.map(add => add.surfaceId))], [...new Set(adds.map(add => add.localeCode))]);
  return foldLocaleStates(changes, confirmations, counts);
}

/**
 * **여러 프로젝트의 상태를 한 번에** (language-request-todo design §2) — 목록·Inbox 로더용. 조회는 `projectId in ids`로 좁힌 둘을 `Promise.all`로
 * 묶고, ADD 행이 있을 때만 값 수 raw 하나를 더한다. Prisma 호출은 ADD 행이 하나라도 있으면 3, 없으면 2이고 프로젝트 수와 무관하다 — 호출 수를
 * 프로젝트 1개와 N개에서 견주려면 양쪽의 ADD 유무를 같게 둔다. 결과는 프로젝트마다 `readLocaleStates(db, id)`와 같다.
 * 요청한 id마다 항목이 있다(상태가 없으면 `[]`).
 * ⚠️ 보관 프로젝트를 거르지 않는다 — `readLocaleStates`처럼 받은 id를 읽는다. 쓸 곳이 없는 보관 프로젝트는 호출자가 ids에서 뺀다.
 * ⚠️ Publish 캡처·잠금 안 판정은 이 함수를 쓰지 않는다 — 그 경로의 조회(`readLocaleStates`)를 표시 기능 때문에 바꾸지 않는다.
 */
export async function readLocaleStatesByProject(db: Db, projectIds: readonly string[]): Promise<Map<string, SurfaceLocaleState[]>> {
  const ids = [...new Set(projectIds)];
  const out = new Map<string, SurfaceLocaleState[]>();
  if (ids.length === 0) return out;
  const surfaceWhere = { projectId: { in: ids }, archivedAt: null };
  const [changes, confirmations] = await Promise.all([
    db.localeChange.findMany({ where: { projectId: { in: ids }, locale: { surface: surfaceWhere } }, select: { projectId: true, ...LOCALE_CHANGE_SELECT } }),
    db.deliveryConfirmation.findMany({ where: { projectId: { in: ids }, surface: surfaceWhere }, select: { projectId: true, ...CONFIRMATION_SELECT } }),
  ]);
  const adds = changes.filter(change => change.operation === "ADD");
  const counts = adds.length === 0 ? new Map<string, Map<string, number>>()
    : await readLocaleValueCountsIn(db, ids, [...new Set(adds.map(add => add.surfaceId))], [...new Set(adds.map(add => add.localeCode))]);
  for (const id of ids) {
    const projectChanges = changes.filter(change => change.projectId === id);
    out.set(id, foldLocaleStates(projectChanges, confirmations.filter(row => row.projectId === id), countsFor(counts, projectChanges.filter(change => change.operation === "ADD"))));
  }
  return out;
}

/**
 * 일괄 값 수를 한 프로젝트의 ADD로 좁힌다 — 프로젝트별 읽기가 넘기는 것과 같은 소스 × 코드다. raw의 코드는 모든 프로젝트 ADD 코드의 합집합이라,
 * 안 좁히면 다른 프로젝트가 요청한 코드의 수가 이 프로젝트 소스의 `valueCounts`에 섞인다(review-B 🟡1). 소스 id는 전역 PK라 소스끼리는 섞이지 않는다.
 */
function countsFor(counts: Map<string, Map<string, number>>, adds: readonly { surfaceId: string; localeCode: string }[]): Map<string, Map<string, number>> {
  const codes = new Set(adds.map(add => add.localeCode));
  const out = new Map<string, Map<string, number>>();
  for (const surfaceId of new Set(adds.map(add => add.surfaceId))) {
    const all = counts.get(surfaceId);
    if (all === undefined) continue;
    const own = new Map([...all].filter(([code]) => codes.has(code)));
    if (own.size > 0) out.set(surfaceId, own);
  }
  return out;
}

/**
 * `readLocaleValueCounts`의 여러 프로젝트판 — 술어가 같아야 한다(활성 키의 비지 않은 값). 원본을 넓히지 않는 이유는 그것이 RepeatableRead 미리보기
 * (`lib/locales/change.ts`)·Publish 계획 안에서 도는 조회라서다.
 */
async function readLocaleValueCountsIn(db: Db, projectIds: readonly string[], surfaceIds: readonly string[], codes: readonly string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  const rows = await db.$queryRaw<{ surfaceId: string; localeCode: string; n: number }[]>`
    SELECT t."surfaceId", t."localeCode", count(*)::int AS n
    FROM "Translation" t
    JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
    WHERE t."projectId" = ANY(${[...projectIds]}::text[]) AND t."surfaceId" = ANY(${[...surfaceIds]}::text[]) AND t."localeCode" = ANY(${[...codes]}::text[])
      AND t."value" <> '' AND NOT k."orphaned"
    GROUP BY t."surfaceId", t."localeCode"`;
  for (const row of rows) {
    const counts = out.get(row.surfaceId) ?? new Map<string, number>();
    counts.set(row.localeCode, row.n);
    out.set(row.surfaceId, counts);
  }
  return out;
}

/** 언어 변경 작업 수 — 소스·언어 단위 차이의 합. 셀 편집 수와 따로 싣는다(design §4 "집계·보호"). */
export async function countLocaleWork(db: Db, projectId: string, surfaceId?: string): Promise<number> {
  const states = await readLocaleStates(db, projectId, surfaceId);
  return states.reduce((sum, state) => sum + state.work.length, 0);
}

/**
 * **전달된 언어 변경의 PR/MR 결말을 기다리는 행이 있나** (#282) — 행이 있고 그 소스의 견줄 전달 목록이 비지 않았다. 작업이 0인 이 창에서 실행은 1층 앞에서
 * PR/MR을 묻고 만료를 돈다(`expiryCheckApplies`의 셋째 절이 이 함수다). 버튼의 `settle`도 이 창에서만 열린 PR 조회를 단다 — 둘이 갈리면 버튼이 켜졌는데
 * 실행이 1층에서 끝나거나, 실행이 정리할 요청이 있는데 버튼이 꺼진다.
 * ⚠️ 값 0개 ADD(전달 효과 없음)·확인 안 된 목록(`null`)은 아니다 — 만료할 수 없거나 원격 0회를 지킨다.
 */
export function awaitsResolution(surfaces: readonly { rows: readonly unknown[]; delivered: readonly unknown[] | null }[]): boolean {
  return surfaces.some(surface => surface.rows.length > 0 && (surface.delivered?.length ?? 0) > 0);
}

/**
 * 버튼의 DB 판정 두 값 — 작업 수(`countLocaleWork`와 같다)와 `awaitsResolution`. 같은 읽기 한 번에서 낸다. `states`는 그 읽기 그대로다 — Home이 같은 결과로
 * 언어 게이트(`planLocaleImportGate`)를 판정한다(language-request-todo design §5 — 새 조회 없이).
 */
export async function readLocaleWork(db: Db, projectId: string): Promise<{ work: number; awaiting: boolean; states: SurfaceLocaleState[] }> {
  const states = await readLocaleStates(db, projectId);
  return { work: states.reduce((sum, state) => sum + state.work.length, 0), awaiting: awaitsResolution(states), states };
}
