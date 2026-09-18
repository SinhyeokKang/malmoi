import "server-only";

import { randomUUID } from "node:crypto";
import { compareKeys } from "@/lib/adapters/shared";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { importOutcomeFields, type ImportFailureCode } from "@/lib/projects/import-status";
import { isBaseLocaleChange, checkFormat, checkCommitOrder, checkProjectSlug } from "./guard";
import type { PushPayloadType } from "./plan";
import { planPush, type ExistingKey, type PushPlan } from "./plan";
import { planProtectedImport } from "@/lib/protection/plan";
import { countPending } from "@/lib/protection/where";

/**
 * 계획(`plan.ts`)을 DB에 적용한다. **여기가 유일한 I/O 층이다.**
 *
 * Both entry points lock Project → Surface before reading keys. Existing transactions stay on their connection.
 * Local isolated /api/push baseline (1446 keys × 6 locales, 2026-09-15): cold 743ms; warm 240/242/243ms.
 * After locking + revision: cold 1716ms; warm 689/677/543ms (same local isolated handler fixture).
 * These include handler/DB work, not deployed network latency; the added reads cost more locally.
 *
 * ⚠️ **`"$transaction" in prisma` 같은 런타임 판별로 둘을 합치지 않는다.** proxy를 오판해 중첩
 * 트랜잭션을 열었고, 별도 연결의 Locale FK가 아직 커밋되지 않은 Surface를 기다려 멈췄다
 * (POSTMORTEM 2026-09-14). 어느 모양인지는 **호출부가 안다** — 그래서 함수를 나눈다.
 *
 * ⚠️ **키마다 왕복하면 타임아웃이다.** skillflo가 1446키다. `unnest()`로 배열을 넘겨
 * 문장 하나가 전체를 처리한다.
 *
 * ⚠️ **트랜잭션은 하나다.** 전에는 둘이었다 — 키 id를 확보하려고 중간에 `findMany`를 한 번 더
 * 쳤기 때문이다. 두 번째가 실패하면 키·orphaned·needsReview만 새 상태이고 번역·refs·
 * `TranslationSurface.lastCommit*`은 옛 상태인 **혼합 DB**가 남는다. 삽입 id는 이미 JS에서 만들므로
 * (`randomUUID` — `@default(cuid())`는 raw SQL에 오지 않는다) 그 값을 들고 있으면 조회가 없어진다.
 *
 * 클라이언트를 **주입받는다** — DB 연결은 진입점이 소유하고 이 층은 같은 트랜잭션에 실을 쓰기만 정한다.
 */

/**
 * 같은 키가 여러 번 오면 **마지막이 이긴다** (YAML 로더·`read`와 같은 규칙).
 *
 * ⚠️ 없으면 `ON CONFLICT DO UPDATE`가 같은 행을 두 번 건드려 Postgres가 문장을 거부한다
 * (`cannot affect row a second time`). `json-catalog`의 `flatten`이 중복을 검사하지 않아
 * `{"a.b": …, "a": {"b": …}}`가 같은 키를 두 번 내므로(ARCHITECTURE §1.35) **지원 포맷 리포가
 * push를 아예 못 끝낸다.** 생산자(`buildPushPayload`)도 접지만, 와이어 계약이 중복을 허용하므로
 * 옛 CI의 페이로드도 받아야 한다.
 */
function lastWins<T>(rows: readonly T[], keyOf: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyOf(row), row);
  return [...byKey.values()];
}

export type PushOutcome = {
  plan: PushPlan;
  inserted: number;
  updated: number;
  orphaned: number;
  unorphaned: number;
  /** 원문이 바뀌어 `needsReview`가 실제로 세워진 **번역 행** 수 (키 수가 아니다). */
  staleTranslations: number;
  refs: number;
  /** 리포에서 사라져 `orphaned`로 표시된 로케일 수. CI 로그에 남아야 의도한 삭제인지 안다. */
  orphanedLocales: number;
  /**
   * 리포 값으로 갱신된 번역 행 수. strict 정책이라 재전송에서도 전 행이 갱신된다
   * (`DO UPDATE`) — 후보 수가 아니라 실제 영향 행수를 보고한다.
   */
  translationsFilled: number;
};

export type ApplyOptions = {
  token: string;
  refsMode: "replace" | "preserve";
  /** 실행 시작 시각. 종료 소유권은 token으로 판정한다. */
  startedAt: Date;
  /**
   * 첫 적재면 null. 그 외에는 Project→Surface 잠금 뒤 읽은 최신 base로 다시 판정한다.
   * 호출부의 값은 첫 적재 여부를 구분한다 (design §3.13).
   *
   * ⚠️ **optional로 두지 않는다.** 껍데기가 빼먹으면 base 교체 push가 조용히 전 키에 검토 표시를
   * 붙이고, 그 결함은 지표로도 안 보인다 (POSTMORTEM 2026-09-02).
   */
  previousBaseLocale: string | null;
  /**
   * 이 적재의 **결과** — 완전 성공이면 생략(또는 null), 일부가 빠졌으면 `"partial-import"`
   * (projects-list design §3.35).
   *
   * ⚠️ **같은 트랜잭션에서 확정되는 것이 요지다.** `applyPush` 뒤에 따로 쓰면 데이터는 들어갔는데
   * 목록만 실패로 남는 창이 생긴다.
   *
   * ⚠️ **`previousBaseLocale`과 달리 optional이다** — 빠졌을 때의 기본이 **성공**이고 그것이
   * 안전한 쪽이기 때문이다(이전 실패를 비운다). 저쪽은 빠지면 전 키에 검토 표시가 붙어 기본값이
   * 존재할 수 없다.
   */
  importOutcome?: ImportFailureCode | null;
  /**
   * 덮어도 되는 편집 토큰 — 수동 Sync에서 OWNER가 폐기를 승인한 집합이다 (sync-edit-protection design §4.1).
   * strict upsert는 **토큰이 없거나 이 목록에 있는 셀만** 덮는다. 목록 밖의 토큰은 승인 뒤 들어온 저장이라 살아남는다.
   *
   * ⚠️ **optional이고 기본은 빈 목록 = 토큰 있는 셀을 하나도 안 덮는다.** 빠졌을 때의 기본이 **편집 보존**이라 안전한 쪽이다
   * (`importOutcome`과 같은 근거). 반대로 기본을 "전부 덮기"로 두면 새 호출부 하나가 조용히 편집을 지운다.
   */
  approvedTokens?: readonly string[];
};

type PushScope = { projectId: string; surfaceId: string };

export class ApplyGuardError extends Error {
  constructor(readonly code: "archived" | "wrong-format" | "stale-commit" | "wrong-project") { super(code); }
}

export function applyPush(prisma: PrismaClient, scope: PushScope, payload: PushPayloadType, options: ApplyOptions): Promise<PushOutcome> {
  return prisma.$transaction(tx => applyPushInTransaction(tx, scope, payload, options), { maxWait: 10_000, timeout: 30_000 });
}

/** 판정과 upsert 사이에 커밋된 저장을 재집계가 잡았다 — 트랜잭션을 되돌리려고 던진다. */
class PendingEditsDuringApply extends Error {
  constructor(readonly pendingCount: number) { super("pending edits appeared during apply"); }
}

export type ProtectedPushResult = { status: "applied"; outcome: PushOutcome } | { status: "deferred"; pendingCount: number };

/**
 * **CI 자동 적재** — 프로젝트 전체에 미전달 편집이 하나라도 있으면 아무것도 쓰지 않고 보류한다 (sync-edit-protection design §3).
 *
 * 리포를 보지 않는다 — 판정 입력은 DB의 pending 수 하나이고 리포 값과 DB 값을 견주지 않는다(병합이 아니다).
 *
 * ⚠️ **재집계를 지우지 않는다.** 저장 경로엔 잠금이 없어 "판정 뒤·upsert 전"에 커밋된 저장이 있을 수 있다. upsert의
 * 토큰 가드가 그 셀을 안 덮어도 **조건 불일치는 0행 갱신이라 조용하다**(POSTMORTEM 2026-09-14) — 재집계 예외가 그 무음을 깬다.
 * ⚠️ 이 판정은 CI 경로 전용이다 — 새 표면 추가·첫 적재는 다른 표면의 편집 때문에 막히면 안 된다(그 표면엔 토큰이 없다).
 */
export async function applyProtectedPush(prisma: PrismaClient, scope: PushScope, payload: PushPayloadType, options: Omit<ApplyOptions, "approvedTokens">): Promise<ProtectedPushResult> {
  try {
    return await prisma.$transaction(async tx => {
      // Project → Surface 잠금 순서를 지킨다(`applyPushInTransaction`이 같은 순서로 다시 잡는다 — 같은 트랜잭션이라 재진입이다).
      await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${scope.projectId} FOR UPDATE`;
      const pending = await countPending(tx, scope.projectId);
      const decision = planProtectedImport({ mode: "auto", pending });
      if (decision.action !== "apply") return { status: "deferred", pendingCount: pending } as const;
      const outcome = await applyPushInTransaction(tx, scope, payload, { ...options, approvedTokens: [] });
      const after = await countPending(tx, scope.projectId);
      if (after > 0) throw new PendingEditsDuringApply(after);
      return { status: "applied", outcome } as const;
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof PendingEditsDuringApply) return { status: "deferred", pendingCount: error.pendingCount };
    throw error;
  }
}

export async function applyPushInTransaction(tx: Prisma.TransactionClient, scope: PushScope, payload: PushPayloadType, options: ApplyOptions): Promise<PushOutcome> {
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${scope.projectId} FOR UPDATE`;
  await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${scope.projectId} AND "id" = ${scope.surfaceId} FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id: scope.projectId } });
  const surface = await tx.translationSurface.findUnique({ where: { id: scope.surfaceId, projectId: scope.projectId } });
  if (project === null || surface === null || project.archivedAt !== null || surface.archivedAt !== null) throw new ApplyGuardError("archived");
  if (checkProjectSlug(payload.projectSlug, project.slug) !== "ok" || surface.slug !== payload.surfaceSlug) throw new ApplyGuardError("wrong-project");
  if (checkFormat(payload.format, surface) !== "ok") throw new ApplyGuardError("wrong-format");
  // Repository Sync accepts the current base even after a force-push; CI keeps its existing order guard.
  if (options.refsMode === "replace" && checkCommitOrder(new Date(payload.commitAt), surface.lastCommitAt) !== "ok") throw new ApplyGuardError("stale-commit");
  return applyWith(tx, scope, payload, { ...options, previousBaseLocale: options.previousBaseLocale === null ? null : surface.baseLocale }, async statements => {
    const results: unknown[] = [];
    for (const statement of statements) results.push(await statement);
    return results;
  });
}

async function applyWith(
  prisma: Prisma.TransactionClient,
  scope: PushScope,
  payload: PushPayloadType,
  options: ApplyOptions,
  execute: (statements: Prisma.PrismaPromise<unknown>[]) => Promise<unknown[]>,
): Promise<PushOutcome> {
  const { projectId, surfaceId } = scope;
  // 1) 현재 키 상태를 한 번에 읽는다. 계획은 순수 함수가 세운다.
  const existing: ExistingKey[] = await prisma.stringKey.findMany({
    where: { projectId, surfaceId },
    select: { id: true, key: true, sourceHash: true, orphaned: true },
  });
  const baseChanged = isBaseLocaleChange(payload.format.baseLocale, options.previousBaseLocale);
  const plan = planPush(existing, lastWins(payload.keys, (k) => k.key), { baseChanged });

  // **삽입 id를 여기서 만들어 들고 있는다.** 문장 안에서 만들어 버리면 키 id를 다시 조회해야 하고,
  // 그 조회 때문에 트랜잭션이 둘로 갈렸다.
  const insertIds = plan.toInsert.map(() => randomUUID());
  // **시계는 하나다.** 전에는 INSERT 배열이 JS `new Date()`, UPDATE가 pg `now()`였다 — 컬럼이
  // `timestamp without time zone`이라 세션 TZ가 갈리면 `Translation.updatedAt`이 1층 스킵 판정에
  // 미래 시각으로 들어가 1층이 영구 무력화된다 (2026-09-04 audit #14).
  const now = new Date();
  const idByKey = new Map<string, string>([
    ...existing.map((e) => [e.key, e.id] as const),
    ...plan.toInsert.map((k, i) => [k.key, insertIds[i]!] as const),
  ]);

  // 2) Locale upsert — Translation의 FK 대상이라 먼저 있어야 한다.
  //    isBase는 payload의 baseLocale 하나만 true다.
  // 정렬은 결정성용이다 — 이 배열이 SQL 인자로 가고 순서가 흔들리면 문장이 매번 달라진다.
  // 중복도 접는다 — 같은 문장이 같은 행을 두 번 치면 `cannot affect row a second time`으로
  // 트랜잭션 전체가 거부된다. keys·translations와 같은 규칙 (2026-09-04 audit #13).
  const liveLocales = [...new Set(payload.locales)].sort(compareKeys);
  const localeRows = liveLocales.map((code) => ({
    projectId,
    code,
    name: code,
    isBase: code === payload.format.baseLocale,
  }));

  const statements = [
    // Locale: 이름은 처음 만들 때만 넣는다(사용자가 고쳤을 수 있다). isBase는 항상 맞춘다.
    prisma.$executeRaw`
      INSERT INTO "Locale" ("projectId", "surfaceId", "code", "name", "isBase")
      SELECT * FROM unnest(
        ${localeRows.map((r) => r.projectId)}::text[],
        ${localeRows.map(() => surfaceId)}::text[],
        ${localeRows.map((r) => r.code)}::text[],
        ${localeRows.map((r) => r.name)}::text[],
        ${localeRows.map((r) => r.isBase)}::boolean[]
      )
      ON CONFLICT ("projectId", "surfaceId", "code") DO UPDATE SET
        "isBase" = EXCLUDED."isBase",
        -- 파일이 돌아오면 그 자리에서 되살아난다 (키의 unorphan과 같은 축).
        "orphaned" = false`,

    // 리포에서 사라진 로케일을 표시한다. **행은 지우지 않는다** — 되살리면 번역이 돌아와야 하고,
    // Translation의 FK가 Restrict라 지우려면 번역을 먼저 지워야 한다.
    //
    // `isBase`도 내린다: base 파일이 삭제되면 push가 남은 파일에서 새 base를 고르는데, 옛 행의
    // `isBase`가 남으면 true인 행이 둘이 되고 편집 UI가 사라진 로케일을 base 열로 세운다.
    //
    // ⚠️ **목록이 비면 문장을 내지 않는다** — `<> ALL('{}')`은 전 로케일을 orphan시킨다.
    ...(liveLocales.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "Locale" SET "orphaned" = true, "isBase" = false
      WHERE "projectId" = ${projectId}
        AND "surfaceId" = ${surfaceId}
        AND "orphaned" = false
        AND "code" <> ALL(${liveLocales}::text[])`]),

    // StringKey insert — id를 JS에서 만든다. cuid() 기본값은 Prisma 클라이언트가 적용하는
    // 것이라 raw SQL에는 오지 않는다.
    ...(plan.toInsert.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "StringKey" ("id", "projectId", "surfaceId", "key", "namespace", "sourceText", "sourceHash", "description", "sortIndex", "orphaned", "createdAt", "updatedAt")
      SELECT * FROM unnest(
        ${insertIds}::text[],
        ${plan.toInsert.map(() => projectId)}::text[],
        ${plan.toInsert.map(() => surfaceId)}::text[],
        ${plan.toInsert.map((k) => k.key)}::text[],
        ${plan.toInsert.map((k) => k.namespace)}::text[],
        ${plan.toInsert.map((k) => k.sourceText)}::text[],
        ${plan.toInsert.map((k) => k.sourceHash)}::text[],
        ${plan.toInsert.map((k) => k.description ?? null)}::text[],
        ${plan.toInsert.map((k) => k.sortIndex ?? null)}::int[],
        ${plan.toInsert.map(() => false)}::boolean[],
        -- ⚠️ createdAt은 INSERT에만 있다 — 아래 UPDATE가 건드리면 살아 돌아온 키가 매번
        -- "새 키"로 다시 잡힌다 (projects-list design §8). 시계가 하나인 이유는 위 주석과 같다.
        ${plan.toInsert.map(() => now)}::timestamp[],
        ${plan.toInsert.map(() => now)}::timestamp[]
      )`]),

    // StringKey update — orphaned는 여기서 false로 되돌린다(돌아온 키).
    ...(plan.toUpdate.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "StringKey" AS s SET
        "namespace" = v."namespace",
        "sourceText" = v."sourceText",
        "sourceHash" = v."sourceHash",
        "description" = v."description",
        -- **매 push마다 전 키의 순서를 새로 박는다.** 코드가 키를 재정렬하거나 추가해도 다음
        -- push가 덮으므로 DB와 파일이 갈라지지 않는다 (설계의 "drift 없음" 근거).
        "sortIndex" = v."sortIndex",
        "orphaned" = false,
        "updatedAt" = ${now}
      FROM unnest(
        ${plan.toUpdate.map((k) => k.key)}::text[],
        ${plan.toUpdate.map((k) => k.namespace)}::text[],
        ${plan.toUpdate.map((k) => k.sourceText)}::text[],
        ${plan.toUpdate.map((k) => k.sourceHash)}::text[],
        ${plan.toUpdate.map((k) => k.description ?? null)}::text[],
        ${plan.toUpdate.map((k) => k.sortIndex ?? null)}::int[]
      ) AS v("key", "namespace", "sourceText", "sourceHash", "description", "sortIndex")
      WHERE s."projectId" = ${projectId} AND s."surfaceId" = ${surfaceId} AND s."key" = v."key"`]),

    // orphaned 표시. **삭제하지 않는다** — 되돌릴 수 있어야 한다 (ARCHITECTURE §0).
    ...(plan.toOrphan.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "StringKey" SET "orphaned" = true, "updatedAt" = ${now}
      WHERE "projectId" = ${projectId} AND "surfaceId" = ${surfaceId} AND "id" = ANY(${plan.toOrphan}::text[])`]),

    // 원문이 바뀐 키 → base 아닌 번역에 needsReview 전파.
    // base 로케일 번역은 제외한다 — 원문 자체라 검토 대상이 아니다.
    ...(plan.staleKeyIds.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "Translation" SET "needsReview" = true, "updatedAt" = ${now}
      WHERE "projectId" = ${projectId}
        AND "surfaceId" = ${surfaceId}
        AND "keyId" = ANY(${plan.staleKeyIds}::text[])
        AND "localeCode" <> ${payload.format.baseLocale}`]),
  ];

  const translations = payload.translations
    .map((t) => ({ ...t, keyId: idByKey.get(t.key) }))
    // 로케일 파일에만 있고 base에 없는 키는 적재 대상이 아니다 — 조용히 버린다.
    // `""`도 적재하지 않는다 — 리포의 빈 값·부재는 "모름"이지 "삭제"가 아니다(ARCHITECTURE §0 불변식 3,
    // §5.5.2). pull이 DB의 `""`를 부재로 내보내므로 여기서 비우면 다음 PR에서 그 키가 통째로 사라진다.
    // 코드에서 번역을 지우는 길은 없다 — 지우려면 UI에서 비운다.
    .filter((t): t is typeof t & { keyId: string } => t.keyId !== undefined && t.value !== "");
  const uniqueTranslations = lastWins(translations, (t) => `${t.keyId}\u0000${t.locale}`);

  const refs = payload.refs
    .map((r) => ({ ...r, keyId: idByKey.get(r.key) }))
    .filter((r): r is typeof r & { keyId: string } => r.keyId !== undefined);

  const rest = [
    // **strict 덮어쓰기.** 리포 값이 DB를 덮는다 (ARCHITECTURE §0 불변식 2) — 변경 감지도 병합도 없다.
    // ⚠️ 단 **미전달 편집(토큰 있는 셀)은 덮지 않는다** (sync-edit-protection, 2026-09-18). CI는 그런 셀이 하나라도 있으면
    //    애초에 적재를 보류하고(`applyProtectedPush`), 수동 Sync는 OWNER가 승인한 토큰만 덮는다. 값 비교가 아니라 토큰 유무다.
    // needsReview는 건드리지 않는다 — 원문 변경 전파(위 문장)가 그 축을 담당한다.
    ...(uniqueTranslations.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "Translation" ("id", "projectId", "surfaceId", "keyId", "localeCode", "value", "description", "placeholders", "needsReview", "updatedAt")
      SELECT v."id", v."projectId", v."surfaceId", v."keyId", v."localeCode", v."value", v."description", v."placeholders"::jsonb, v."needsReview", v."updatedAt"
      FROM unnest(
        ${uniqueTranslations.map(() => randomUUID())}::text[],
        ${uniqueTranslations.map(() => projectId)}::text[],
        ${uniqueTranslations.map(() => surfaceId)}::text[],
        ${uniqueTranslations.map((t) => t.keyId)}::text[],
        ${uniqueTranslations.map((t) => t.locale)}::text[],
        ${uniqueTranslations.map((t) => t.value)}::text[],
        ${uniqueTranslations.map((t) => t.description ?? null)}::text[],
        -- jsonb[]로 바로 못 받는다: Prisma가 배열을 text[]로 보내므로 text로 받아 SELECT에서
        -- 행마다 캐스팅한다. 그래서 SELECT * 가 아니라 컬럼을 이름으로 세운다.
        ${uniqueTranslations.map((t) => (t.placeholders === undefined ? null : JSON.stringify(t.placeholders)))}::text[],
        ${uniqueTranslations.map(() => false)}::boolean[],
        ${uniqueTranslations.map(() => now)}::timestamp[]
      ) AS v("id", "projectId", "surfaceId", "keyId", "localeCode", "value", "description", "placeholders", "needsReview", "updatedAt")
      ON CONFLICT ("keyId", "localeCode") DO UPDATE SET
        "value" = EXCLUDED."value",
        -- strict라 chrome 필드도 리포 값이 덮는다 (ARCHITECTURE §0 불변식 2). 리포에서 사라졌으면 DB에서도 빠진다.
        "description" = EXCLUDED."description",
        "placeholders" = EXCLUDED."placeholders",
        -- **덮인 값의 저자는 리포다** (translation-ui design §3.6). 사람 이름을 남기면 거짓이고,
        -- 미배포 집계(isUnpublished)가 push 직후 전 키를 "안 보낸 편집"으로 센다.
        "updatedBy" = NULL,
        -- 덮인 셀의 편집은 더 이상 존재하지 않는다 — 토큰도 비운다. 페이로드에 없는 셀(실패 파일·빈 값)은
        -- 이 문장이 안 닿아 토큰이 남는다 (sync-edit-protection design §2).
        "pendingEditToken" = NULL,
        "updatedAt" = ${now}
      -- ⚠️ **토큰 있는 셀은 덮지 않는다** — 값을 견주지 않고 "아직 전달 확인되지 않은 편집인가"만 본다 (sync-edit-protection design §3).
      -- 승인된 폐기(수동 Sync)의 토큰만 예외다. 조건 불일치는 0행이라 조용하므로 CI 경로는 재집계가 그 무음을 깬다.
      WHERE "Translation"."pendingEditToken" IS NULL OR "Translation"."pendingEditToken" = ANY(${[...(options.approvedTokens ?? [])]}::text[])`]),

    // KeyRef 전체 교체. 증분 갱신은 삭제 케이스를 놓치고, 스캔이 전수라 교체가 더 정확하다.
    ...(options.refsMode === "preserve" ? [] : [prisma.$executeRaw`
      DELETE FROM "KeyRef" WHERE "keyId" IN (SELECT "id" FROM "StringKey" WHERE "projectId" = ${projectId} AND "surfaceId" = ${surfaceId})`]),
    ...(options.refsMode === "preserve" || refs.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "KeyRef" ("id", "keyId", "path", "line")
      SELECT * FROM unnest(
        ${refs.map(() => randomUUID())}::text[],
        ${refs.map((r) => r.keyId)}::text[],
        ${refs.map((r) => r.path)}::text[],
        ${refs.map((r) => r.line)}::int[]
      )`]),

    // 포맷과 커밋 SHA는 pull이 읽는다.
    prisma.translationSurface.update({
      where: { id: surfaceId, projectId },
      data: {
        adapterName: payload.format.adapter,
        pathTemplate: payload.format.pathTemplate,
        nested: payload.format.nested,
        // 없으면 컬럼을 건드리지 않는다 — 옛 값이 남아도 경로가 안 맞으면 write가 폴백하므로
        // 무해하고, `Prisma.DbNull`을 쓰려면 이 모듈이 생성 클라이언트를 값으로 물어야 한다.
        ...(payload.format.nestedByPath === undefined ? {} : { nestedByPath: payload.format.nestedByPath }),
        baseLocale: payload.format.baseLocale,
        /**
         * **허가를 쓴 push만 선언을 비운다 — 일회용이다** (design §3.13, 6b-3).
         *
         * ⚠️ **push마다 비우면 기능이 흔한 경로에서 무력화된다** (code-review 2026-09-09). OWNER가
         * base를 선언한 뒤 워크플로를 고치기 전에 평범한 CI push 한 번이 오면(base 브랜치에 머지가
         * 있을 때마다 온다) 허가가 조용히 사라지고 **두 화면의 대기 배너도 함께 사라진다** — OWNER는
         * 반영된 줄 알지만 아무것도 안 바뀌었고 신호가 없다.
         *
         * `baseChanged`가 곧 "허가가 쓰였다"다: `checkFormat`이 payload의 base를 **현실 또는 선언**으로만
         * 통과시키므로, 현실과 다른 base가 여기까지 왔다면 그 값은 선언과 같다. 남는 경우(선언 == 현실)는
         * `basePending`이 false라 배너가 없고, `checkFormat`의 그 갈래도 현실과 같은 값이라 예외가 아니다.
         */
        ...(baseChanged ? { declaredBaseLocale: null } : {}),
        importRevision: { increment: 1 },
        lastCommitSha: payload.commitSha,
        // 다음 push의 역행 판정 기준이 된다 (ARCHITECTURE §5.5.5).
        lastCommitAt: new Date(payload.commitAt),
      },
    }),
    // 성공도 자기 실행만 끝낸다 — A 성공이 B의 표시를 비우면 뒤늦은 B 실패까지 조건부 쓰기에서 탈락한다.
    // 데이터와 결과는 같은 트랜잭션에 남겨 성공 후 별도 기록이 실패하는 창을 만들지 않는다.
    prisma.translationSurface.updateMany({
      where: { id: surfaceId, projectId, lastImportToken: options.token },
      data: { ...importOutcomeFields(options.importOutcome ?? null, new Date()), lastImportToken: null },
    }),
  ];

  // **한 트랜잭션이다.** 문장 순서가 곧 결과 인덱스이므로 보고값을 꺼내려면 그 순서를 알아야 한다.
  const staleAt =
    1 +
    (liveLocales.length === 0 ? 0 : 1) +
    (plan.toInsert.length === 0 ? 0 : 1) +
    (plan.toUpdate.length === 0 ? 0 : 1) +
    (plan.toOrphan.length === 0 ? 0 : 1);
  const filledAt = staleAt + (plan.staleKeyIds.length === 0 ? 0 : 1);

  const results = await execute([...statements, ...rest]);
  const staleTranslations = plan.staleKeyIds.length === 0 ? 0 : numberAt(results, staleAt);
  const translationsFilled = uniqueTranslations.length === 0 ? 0 : numberAt(results, filledAt);
  const orphanedLocales = liveLocales.length === 0 ? 0 : numberAt(results, 1);

  return {
    plan,
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    orphaned: plan.toOrphan.length,
    unorphaned: plan.toUnorphan.length,
    staleTranslations,
    refs: options.refsMode === "preserve" ? 0 : refs.length,
    translationsFilled,
    orphanedLocales,
  };
}

/** 트랜잭션 결과에서 영향 행수를 꺼낸다. 형태가 예상과 다르면 0으로 — 보고값이라 던지지 않는다. */
function numberAt(results: readonly unknown[], index: number): number {
  const v = results[index];
  return typeof v === "number" ? v : 0;
}
