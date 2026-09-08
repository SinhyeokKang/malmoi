import { randomUUID } from "node:crypto";
import { compareKeys } from "@/lib/adapters/shared";

import type { PrismaClient } from "@/generated/prisma/client";
import type { PushPayloadType } from "./plan";
import { planPush, type ExistingKey, type PushPlan } from "./plan";

/**
 * 계획(`plan.ts`)을 DB에 적용한다. **여기가 유일한 I/O 층이다.**
 *
 * ⚠️ **대화형 트랜잭션을 쓸 수 없다.** 런타임이 transaction 모드 pooler(6543)라
 * `$transaction(async tx => …)`은 문장마다 다른 백엔드로 갈 수 있어 세션을 못 잡는다.
 * 배열형 `$transaction([...])`은 한 번에 배치로 보내므로 pgbouncer에서도 원자적이다.
 *
 * ⚠️ **키마다 왕복하면 타임아웃이다.** skillflo가 1446키다. `unnest()`로 배열을 넘겨
 * 문장 하나가 전체를 처리한다.
 *
 * ⚠️ **트랜잭션은 하나다.** 전에는 둘이었다 — 키 id를 확보하려고 중간에 `findMany`를 한 번 더
 * 쳤기 때문이다. 두 번째가 실패하면 키·orphaned·needsReview만 새 상태이고 번역·refs·
 * `Project.lastCommit*`은 옛 상태인 **혼합 DB**가 남는다. 삽입 id는 이미 JS에서 만들므로
 * (`randomUUID` — `@default(cuid())`는 raw SQL에 오지 않는다) 그 값을 들고 있으면 조회가 없어진다.
 *
 * 클라이언트를 **주입받는다** — `lib/db.ts`를 직접 import하면 그 파일의 `server-only` 때문에
 * 스크립트·테스트에서 이 모듈을 열 수조차 없다. 라우트가 `getPrisma()`를 넘긴다.
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

export async function applyPush(
  prisma: PrismaClient,
  projectId: string,
  payload: PushPayloadType,
): Promise<PushOutcome> {
  // 1) 현재 키 상태를 한 번에 읽는다. 계획은 순수 함수가 세운다.
  const existing: ExistingKey[] = await prisma.stringKey.findMany({
    where: { projectId },
    select: { id: true, key: true, sourceHash: true, orphaned: true },
  });
  const plan = planPush(existing, lastWins(payload.keys, (k) => k.key));

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
      INSERT INTO "Locale" ("projectId", "code", "name", "isBase")
      SELECT * FROM unnest(
        ${localeRows.map((r) => r.projectId)}::text[],
        ${localeRows.map((r) => r.code)}::text[],
        ${localeRows.map((r) => r.name)}::text[],
        ${localeRows.map((r) => r.isBase)}::boolean[]
      )
      ON CONFLICT ("projectId", "code") DO UPDATE SET
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
        AND "orphaned" = false
        AND "code" <> ALL(${liveLocales}::text[])`]),

    // StringKey insert — id를 JS에서 만든다. cuid() 기본값은 Prisma 클라이언트가 적용하는
    // 것이라 raw SQL에는 오지 않는다.
    ...(plan.toInsert.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "StringKey" ("id", "projectId", "key", "namespace", "sourceText", "sourceHash", "description", "sortIndex", "orphaned", "updatedAt")
      SELECT * FROM unnest(
        ${insertIds}::text[],
        ${plan.toInsert.map(() => projectId)}::text[],
        ${plan.toInsert.map((k) => k.key)}::text[],
        ${plan.toInsert.map((k) => k.namespace)}::text[],
        ${plan.toInsert.map((k) => k.sourceText)}::text[],
        ${plan.toInsert.map((k) => k.sourceHash)}::text[],
        ${plan.toInsert.map((k) => k.description ?? null)}::text[],
        ${plan.toInsert.map((k) => k.sortIndex ?? null)}::int[],
        ${plan.toInsert.map(() => false)}::boolean[],
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
      WHERE s."projectId" = ${projectId} AND s."key" = v."key"`]),

    // orphaned 표시. **삭제하지 않는다** — 되돌릴 수 있어야 한다 (MVP §2).
    ...(plan.toOrphan.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "StringKey" SET "orphaned" = true, "updatedAt" = ${now}
      WHERE "projectId" = ${projectId} AND "id" = ANY(${plan.toOrphan}::text[])`]),

    // 원문이 바뀐 키 → base 아닌 번역에 needsReview 전파.
    // base 로케일 번역은 제외한다 — 원문 자체라 검토 대상이 아니다.
    ...(plan.staleKeyIds.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "Translation" SET "needsReview" = true, "updatedAt" = ${now}
      WHERE "projectId" = ${projectId}
        AND "keyId" = ANY(${plan.staleKeyIds}::text[])
        AND "localeCode" <> ${payload.format.baseLocale}`]),
  ];

  const translations = payload.translations
    .map((t) => ({ ...t, keyId: idByKey.get(t.key) }))
    // 로케일 파일에만 있고 base에 없는 키는 적재 대상이 아니다 — 조용히 버린다.
    .filter((t): t is typeof t & { keyId: string } => t.keyId !== undefined && t.value !== "");
  const uniqueTranslations = lastWins(translations, (t) => `${t.keyId}\u0000${t.locale}`);

  const refs = payload.refs
    .map((r) => ({ ...r, keyId: idByKey.get(r.key) }))
    .filter((r): r is typeof r & { keyId: string } => r.keyId !== undefined);

  const rest = [
    // **strict 덮어쓰기.** 리포 값이 DB를 덮는다 (MVP §3.1) — 변경 감지도 병합도 없다.
    // ⚠️ 대가: 번역자가 편집한 뒤 pull이 돌기 전에 push가 오면 그 편집이 사라진다.
    //    pull 주기가 곧 데이터 손실 창이다. 스펙에 감수하는 대가로 명시돼 있다.
    // needsReview는 건드리지 않는다 — 원문 변경 전파(위 문장)가 그 축을 담당한다.
    ...(uniqueTranslations.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "Translation" ("id", "projectId", "keyId", "localeCode", "value", "description", "placeholders", "needsReview", "updatedAt")
      SELECT v."id", v."projectId", v."keyId", v."localeCode", v."value", v."description", v."placeholders"::jsonb, v."needsReview", v."updatedAt"
      FROM unnest(
        ${uniqueTranslations.map(() => randomUUID())}::text[],
        ${uniqueTranslations.map(() => projectId)}::text[],
        ${uniqueTranslations.map((t) => t.keyId)}::text[],
        ${uniqueTranslations.map((t) => t.locale)}::text[],
        ${uniqueTranslations.map((t) => t.value)}::text[],
        ${uniqueTranslations.map((t) => t.description ?? null)}::text[],
        -- jsonb[]로 바로 못 받는다: Prisma가 배열을 text[]로 보내므로 text로 받아 SELECT에서
        -- 행마다 캐스팅한다. 그래서 SELECT * 가 아니라 컬럼을 이름으로 세운다.
        ${uniqueTranslations.map((t) => (t.placeholders === undefined ? null : JSON.stringify(t.placeholders)))}::text[],
        ${uniqueTranslations.map(() => false)}::boolean[],
        ${uniqueTranslations.map(() => now)}::timestamp[]
      ) AS v("id", "projectId", "keyId", "localeCode", "value", "description", "placeholders", "needsReview", "updatedAt")
      ON CONFLICT ("keyId", "localeCode") DO UPDATE SET
        "value" = EXCLUDED."value",
        -- strict라 chrome 필드도 리포 값이 덮는다 (MVP §3.1). 리포에서 사라졌으면 DB에서도 빠진다.
        "description" = EXCLUDED."description",
        "placeholders" = EXCLUDED."placeholders",
        -- **덮인 값의 저자는 리포다** (translation-ui design §3.6). 사람 이름을 남기면 거짓이고,
        -- 미배포 집계(isUnpublished)가 push 직후 전 키를 "안 보낸 편집"으로 센다.
        "updatedBy" = NULL,
        "updatedAt" = ${now}`]),

    // KeyRef 전체 교체. 증분 갱신은 삭제 케이스를 놓치고, 스캔이 전수라 교체가 더 정확하다.
    prisma.$executeRaw`
      DELETE FROM "KeyRef" WHERE "keyId" IN (SELECT "id" FROM "StringKey" WHERE "projectId" = ${projectId})`,
    ...(refs.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "KeyRef" ("id", "keyId", "path", "line")
      SELECT * FROM unnest(
        ${refs.map(() => randomUUID())}::text[],
        ${refs.map((r) => r.keyId)}::text[],
        ${refs.map((r) => r.path)}::text[],
        ${refs.map((r) => r.line)}::int[]
      )`]),

    // 포맷과 커밋 SHA는 pull이 읽는다.
    prisma.project.update({
      where: { id: projectId },
      data: {
        adapterName: payload.format.adapter,
        pathTemplate: payload.format.pathTemplate,
        nested: payload.format.nested,
        // 없으면 컬럼을 건드리지 않는다 — 옛 값이 남아도 경로가 안 맞으면 write가 폴백하므로
        // 무해하고, `Prisma.DbNull`을 쓰려면 이 모듈이 생성 클라이언트를 값으로 물어야 한다.
        ...(payload.format.nestedByPath === undefined ? {} : { nestedByPath: payload.format.nestedByPath }),
        baseLocale: payload.format.baseLocale,
        lastCommitSha: payload.commitSha,
        // 다음 push의 역행 판정 기준이 된다 (ARCHITECTURE §5.5.5).
        lastCommitAt: new Date(payload.commitAt),
      },
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

  const results = await prisma.$transaction([...statements, ...rest]);
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
    refs: refs.length,
    translationsFilled,
    orphanedLocales,
  };
}

/** 트랜잭션 결과에서 영향 행수를 꺼낸다. 형태가 예상과 다르면 0으로 — 보고값이라 던지지 않는다. */
function numberAt(results: readonly unknown[], index: number): number {
  const v = results[index];
  return typeof v === "number" ? v : 0;
}
