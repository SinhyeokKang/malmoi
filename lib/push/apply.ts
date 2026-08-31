import { randomUUID } from "node:crypto";

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
 * 클라이언트를 **주입받는다** — `lib/db.ts`를 직접 import하면 그 파일의 `server-only` 때문에
 * 스크립트·테스트에서 이 모듈을 열 수조차 없다. 라우트가 `getPrisma()`를 넘긴다.
 */

export type PushOutcome = {
  plan: PushPlan;
  inserted: number;
  updated: number;
  orphaned: number;
  unorphaned: number;
  /** 원문이 바뀌어 `needsReview`가 실제로 세워진 **번역 행** 수 (키 수가 아니다). */
  staleTranslations: number;
  refs: number;
  /**
   * **실제로 삽입된** 번역 행 수. 후보 수가 아니다 — `ON CONFLICT DO NOTHING`이라
   * 재전송에서는 0이어야 하고, 후보 수를 보고하면 CI 로그가 매번 거짓을 말한다.
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
  const plan = planPush(existing, payload.keys);

  // 2) Locale upsert — Translation의 FK 대상이라 먼저 있어야 한다.
  //    isBase는 payload의 baseLocale 하나만 true다.
  const localeRows = payload.locales.map((code) => ({
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
      ON CONFLICT ("projectId", "code") DO UPDATE SET "isBase" = EXCLUDED."isBase"`,

    // StringKey insert — id를 JS에서 만든다. cuid() 기본값은 Prisma 클라이언트가 적용하는
    // 것이라 raw SQL에는 오지 않는다.
    ...(plan.toInsert.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "StringKey" ("id", "projectId", "key", "namespace", "sourceText", "sourceHash", "description", "orphaned", "updatedAt")
      SELECT * FROM unnest(
        ${plan.toInsert.map(() => randomUUID())}::text[],
        ${plan.toInsert.map(() => projectId)}::text[],
        ${plan.toInsert.map((k) => k.key)}::text[],
        ${plan.toInsert.map((k) => k.namespace)}::text[],
        ${plan.toInsert.map((k) => k.sourceText)}::text[],
        ${plan.toInsert.map((k) => k.sourceHash)}::text[],
        ${plan.toInsert.map((k) => k.description ?? null)}::text[],
        ${plan.toInsert.map(() => false)}::boolean[],
        ${plan.toInsert.map(() => new Date())}::timestamp[]
      )`]),

    // StringKey update — orphaned는 여기서 false로 되돌린다(돌아온 키).
    ...(plan.toUpdate.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "StringKey" AS s SET
        "namespace" = v."namespace",
        "sourceText" = v."sourceText",
        "sourceHash" = v."sourceHash",
        "description" = v."description",
        "orphaned" = false,
        "updatedAt" = now()
      FROM unnest(
        ${plan.toUpdate.map((k) => k.key)}::text[],
        ${plan.toUpdate.map((k) => k.namespace)}::text[],
        ${plan.toUpdate.map((k) => k.sourceText)}::text[],
        ${plan.toUpdate.map((k) => k.sourceHash)}::text[],
        ${plan.toUpdate.map((k) => k.description ?? null)}::text[]
      ) AS v("key", "namespace", "sourceText", "sourceHash", "description")
      WHERE s."projectId" = ${projectId} AND s."key" = v."key"`]),

    // orphaned 표시. **삭제하지 않는다** — 되돌릴 수 있어야 한다 (MVP §2).
    ...(plan.toOrphan.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "StringKey" SET "orphaned" = true, "updatedAt" = now()
      WHERE "projectId" = ${projectId} AND "id" = ANY(${plan.toOrphan}::text[])`]),

    // 원문이 바뀐 키 → base 아닌 번역에 needsReview 전파.
    // base 로케일 번역은 제외한다 — 원문 자체라 검토 대상이 아니다.
    ...(plan.staleKeyIds.length === 0 ? [] : [prisma.$executeRaw`
      UPDATE "Translation" SET "needsReview" = true, "updatedAt" = now()
      WHERE "projectId" = ${projectId}
        AND "keyId" = ANY(${plan.staleKeyIds}::text[])
        AND "localeCode" <> ${payload.format.baseLocale}`]),
  ];

  // $executeRaw는 영향 행수를 돌려준다 — 배열형 트랜잭션의 결과가 문장 순서대로 온다.
  const firstResults = await prisma.$transaction(statements);
  // needsReview 문장은 항상 마지막이다(있을 때만 추가된다).
  const staleTranslations = plan.staleKeyIds.length === 0
    ? 0
    : numberAt(firstResults, firstResults.length - 1);

  // 3) 키 id를 확보한 뒤 번역·refs를 처리한다. 앞 트랜잭션이 끝나야 id가 존재한다.
  const idByKey = new Map(
    (await prisma.stringKey.findMany({ where: { projectId }, select: { id: true, key: true } }))
      .map((r) => [r.key, r.id] as const),
  );

  const translations = payload.translations
    .map((t) => ({ ...t, keyId: idByKey.get(t.key) }))
    // 로케일 파일에만 있고 base에 없는 키는 적재 대상이 아니다 — 조용히 버린다.
    .filter((t): t is typeof t & { keyId: string } => t.keyId !== undefined && t.value !== "");

  const refs = payload.refs
    .map((r) => ({ ...r, keyId: idByKey.get(r.key) }))
    .filter((r): r is typeof r & { keyId: string } => r.keyId !== undefined);

  const second = [
    // **insert-if-absent.** 기존 행은 손대지 않는다 — DB가 번역의 진실이다 (MVP §3.1).
    ...(translations.length === 0 ? [] : [prisma.$executeRaw`
      INSERT INTO "Translation" ("id", "projectId", "keyId", "localeCode", "value", "needsReview", "updatedAt")
      SELECT * FROM unnest(
        ${translations.map(() => randomUUID())}::text[],
        ${translations.map(() => projectId)}::text[],
        ${translations.map((t) => t.keyId)}::text[],
        ${translations.map((t) => t.locale)}::text[],
        ${translations.map((t) => t.value)}::text[],
        ${translations.map(() => false)}::boolean[],
        ${translations.map(() => new Date())}::timestamp[]
      )
      ON CONFLICT ("keyId", "localeCode") DO NOTHING`]),

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
        baseLocale: payload.format.baseLocale,
        lastCommitSha: payload.commitSha,
      },
    }),
  ];

  const secondResults = await prisma.$transaction(second);
  // 번역 삽입 문장은 있을 때만 맨 앞이다.
  const translationsFilled = translations.length === 0 ? 0 : numberAt(secondResults, 0);

  return {
    plan,
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    orphaned: plan.toOrphan.length,
    unorphaned: plan.toUnorphan.length,
    staleTranslations,
    refs: refs.length,
    translationsFilled,
  };
}

/** 트랜잭션 결과에서 영향 행수를 꺼낸다. 형태가 예상과 다르면 0으로 — 보고값이라 던지지 않는다. */
function numberAt(results: readonly unknown[], index: number): number {
  const v = results[index];
  return typeof v === "number" ? v : 0;
}
