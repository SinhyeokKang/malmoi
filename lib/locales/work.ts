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

/**
 * 활성 소스별 언어 변경 상태. 행이 있거나 전달 목록이 비지 않은 소스만 돌려준다 — 둘 다 없으면 작업이 생길 수 없다. 소스 id순이다.
 * ⚠️ 보관된 소스는 뺀다 — 제거된 소스의 의도가 Publish·작업 수로 새지 않는다(그 처리는 소스 제거·재등록 승인이 맡는다).
 */
export async function readLocaleStates(db: Db, projectId: string, surfaceId?: string): Promise<SurfaceLocaleState[]> {
  const surfaceWhere = { projectId, archivedAt: null, ...(surfaceId === undefined ? {} : { id: surfaceId }) };
  const changes = await db.localeChange.findMany({
    where: { projectId, ...(surfaceId === undefined ? {} : { surfaceId }), locale: { surface: surfaceWhere } },
    select: { surfaceId: true, localeCode: true, operation: true, requestedAt: true, locale: { select: { orphaned: true } } },
  });
  const confirmations = await db.deliveryConfirmation.findMany({
    where: { projectId, ...(surfaceId === undefined ? {} : { surfaceId }), surface: surfaceWhere },
    select: { surfaceId: true, deliveredLocaleChanges: true, invalidatedAt: true, syncRun: { select: { startedAt: true } } },
  });
  const deliveredBy = new Map(confirmations.map(row => [row.surfaceId, deliveredOf(row)]));
  const confirmedFromBy = new Map(confirmations.map(row => [row.surfaceId, row.syncRun.startedAt]));
  const rowsBy = new Map<string, SurfaceLocaleState["rows"]>();
  for (const change of changes) {
    const rows = rowsBy.get(change.surfaceId) ?? [];
    rows.push({ localeCode: change.localeCode, operation: change.operation, orphaned: change.locale.orphaned, requestedAt: change.requestedAt });
    rowsBy.set(change.surfaceId, rows);
  }
  const ids = [...new Set([...rowsBy.keys(), ...[...deliveredBy].filter(([, list]) => list !== null && list.length > 0).map(([id]) => id)])].sort(compareCodeUnits);
  const adds = changes.filter(change => change.operation === "ADD");
  const counts = await readLocaleValueCounts(db, projectId, [...new Set(adds.map(add => add.surfaceId))], [...new Set(adds.map(add => add.localeCode))]);
  return ids.map(id => {
    const rows = (rowsBy.get(id) ?? []).sort((a, b) => compareCodeUnits(a.localeCode, b.localeCode));
    const valueCounts = counts.get(id) ?? new Map<string, number>();
    const current = localeEffects(rows, valueCounts);
    const confirmed = deliveredBy.get(id);
    const storedDelivered = confirmed === undefined ? [] : confirmed;
    const delivered = deliveredForRequests(storedDelivered, rows, confirmedFromBy.get(id) ?? null, current);
    return { surfaceId: id, rows, valueCounts, current, delivered, storedDelivered, work: localeWork(current, delivered) };
  });
}

/** 언어 변경 작업 수 — 소스·언어 단위 차이의 합. 셀 편집 수와 따로 싣는다(design §4 "집계·보호"). */
export async function countLocaleWork(db: Db, projectId: string, surfaceId?: string): Promise<number> {
  const states = await readLocaleStates(db, projectId, surfaceId);
  return states.reduce((sum, state) => sum + state.work.length, 0);
}
