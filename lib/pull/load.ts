import { randomUUID } from "node:crypto";

import { fail } from "@/lib/failure";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { countPending, pendingWhere } from "@/lib/protection/where";
import { planPublishBaselines, restoreValueOf } from "@/lib/translations/baseline";
import { deliveryContextFingerprint } from "@/lib/translations/context";
import type { DeliveryContext, PendingEdit, PullState } from "./run";

/**
 * pull이 필요한 DB 상태를 읽고, 성공 후 `lastPulledAt`을 쓴다.
 *
 * **`lib/db.ts`를 import하지 않는다** — 그 파일의 `server-only` 때문에 스크립트·테스트가 이
 * 모듈을 열 수조차 없어진다 (ARCHITECTURE §5.5.4에서 이미 밟은 함정). 클라이언트는 라우트나
 * Server Action이 주입한다.
 *
 * ⚠️ **모든 쿼리를 `projectId`로 좁힌다.** 인덱스가 전부 `projectId` 선두 복합이고, 더 중요하게는
 * RLS가 없어 애플리케이션이 유일한 테넌트 방어선이다 (CLAUDE.md).
 */

export async function loadPullState(prisma: PrismaClient, slug: string): Promise<PullState> {
  return prisma.$transaction((tx) => loadSnapshot(tx, slug), { isolationLevel: "RepeatableRead" });
}

async function loadSnapshot(prisma: Prisma.TransactionClient, slug: string): Promise<PullState> {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      repoOwner: true,
      repoName: true,
      baseBranch: true,
      installationId: true,
      repositoryId: true,
      lastPulledAt: true,
      // ⚠️ **사라진 로케일은 빼고 읽는다.** 안 빼면 개발자가 지운 로케일 파일을 pull이 되살린다 —
      // 행은 DB에 남아 있고 번역도 남아 있으므로 write가 내용을 만들어 커밋에 싣는다 (ARCHITECTURE §0 불변식 2).
      surfaces: { where: { archivedAt: null }, include: {
        locales: { where: { orphaned: false }, select: { code: true }, orderBy: { code: "asc" } },
      } },
    },
  });
  if (!project) fail(`project not found: ${slug}`);

  const { surfaces, ...rest } = project;

  const keys = await prisma.stringKey.findMany({
    where: { projectId: project.id, surfaceId: { in: surfaces.map(s => s.id) } },
    // ⚠️ **가독성·디버깅 목적이다, 결정성의 근거가 아니다.** `orderedEntries`가 동률을 키로 갈라
    // 전순서를 만들므로 DB 순서는 바이트에 영향을 줄 수 없다. 조회 결과와 파일 순서가 눈으로
    // 대응해야 순서 문제를 진단할 수 있어서 맞춰 둔다.
    // ⚠️ `lib/keys/query.ts`에도 같은 `orderBy`가 있는데 **그쪽은 편집 UI 행 순서의 유일한
    //    출처라 절대 바꾸지 않는다.** grep하면 둘 다 잡힌다.
    orderBy: [{ sortIndex: "asc" }, { key: "asc" }],
    select: {
      id: true,
      surfaceId: true,
      key: true,
      sourceText: true,
      description: true,
      sortIndex: true,
      orphaned: true,
      // 로케일별 chrome 필드도 여기서 온다 — `StringKey.description`(키 단위)과 다른 값이다.
      translations: { select: { localeCode: true, value: true, description: true, placeholders: true } },
    },
  });

  /**
   * ⚠️ **JSON `null`인 placeholders 좌표** (audit #52). Prisma는 Json 컬럼의 SQL NULL(부재)과 JSON null(`"placeholders": null`)을
   * **둘 다 `null`로** 읽는다 — 구별하지 않으면 그 필드가 pull에서 빠져 값 편집 0건인 Publish가 줄을 지운다. 같은 스냅샷에서 센다.
   */
  const jsonNull = await prisma.$queryRaw<{ keyId: string; localeCode: string }[]>`
    SELECT "keyId", "localeCode" FROM "Translation"
    WHERE "projectId" = ${project.id} AND "surfaceId" = ANY(${surfaces.map(s => s.id)}::text[]) AND jsonb_typeof("placeholders") = 'null'`;
  const nullPlaceholders = new Set(jsonNull.map(row => `${row.keyId}\u0000${row.localeCode}`));

  // `lastPulledAt`에 캡처될 값. **`projectId`로 좁힌다** — 안 좁히면 다른 프로젝트의 편집이 이 프로젝트의
  // pull을 깨우고, 그쪽 `updatedAt`이 이쪽 `lastPulledAt`에 박힌다.
  const agg = await prisma.translation.aggregate({
    where: { projectId: project.id },
    _max: { updatedAt: true },
  });
  // 1층 판정값 — `countUnpublished`와 같은 토큰 술어다. 시각으로 세면 push가 올린 `updatedAt`이 편집으로 읽히고
  // (T0), 저자·시각으로 세면 같은 밀리초 재저장과 전달 확인을 못 가른다 (sync-edit-protection T8).
  const unpublished = await countPending(prisma, project.id);
  // 전달 확인할 편집 — export와 **같은 스냅샷**에서 읽어야 "PR에 실린 값의 토큰"이 된다 (sync-edit-protection — ARCHITECTURE §5의 `pendingEditToken`).
  // 0이면 조회하지 않는다 — 관계 조인이 낡은 통계에서 인덱스를 버리는 창이 있다(`countPending` 주석). 같은 스냅샷이라 결과가 같다.
  // 좌표와 값도 같은 스냅샷에서 읽는다 — 캡처 뒤 재편집된 셀의 복원 기준이 이 값이다 (translation-rework — ARCHITECTURE §5.8).
  const pending = unpublished === 0 ? [] : await prisma.translation.findMany({
    where: pendingWhere(project.id),
    select: { id: true, pendingEditToken: true, surfaceId: true, keyId: true, localeCode: true, value: true, stringKey: { select: { sourceText: true } } },
  });
  const surfaceById = new Map(surfaces.map(surface => [surface.id, surface]));

  return {
    project: rest,
    surfaces: surfaces.map(surface => ({ ...surface,
    localeCodes: surface.locales.map((l) => l.code),
    keys: keys.filter(k => k.surfaceId === surface.id).map((k) => ({
      id: k.id,
      key: k.key,
      sourceText: k.sourceText,
      description: k.description,
      sortIndex: k.sortIndex,
      orphaned: k.orphaned,
      // 로케일 코드 → 셀. 행이 없는 로케일은 미번역이라 키 자체가 없어야 한다
      // (`undefined`와 `{ value: "" }`가 base 폴백에서 갈린다).
      cells: Object.fromEntries(
        k.translations.map((t) => [
          t.localeCode,
          {
            value: t.value,
            ...(t.description === null ? {} : { description: t.description }),
            // Prisma의 Json 컬럼은 비어 있으면 `null`을 준다 — 없는 것과 같게 다루되, JSON null은 위에서 따로 센 좌표로 되살린다.
            ...(t.placeholders !== null ? { placeholders: t.placeholders }
              : nullPlaceholders.has(`${k.id}\u0000${t.localeCode}`) ? { placeholders: null } : {}),
          },
        ]),
      ),
    })),
    })),
    maxUpdatedAt: agg._max.updatedAt,
    unpublished,
    pendingEdits: pending.flatMap(t => {
      if (t.pendingEditToken === null) return [];
      // 실제 적용 base로 판정한다 — 선언만 바뀐 base(`declaredBaseLocale`)는 export에 쓰이지 않았다.
      const isBase = surfaceById.get(t.surfaceId)?.baseLocale === t.localeCode;
      const restoreValue = restoreValueOf({ value: t.value, isBase, sourceText: t.stringKey.sourceText });
      return [{ id: t.id, token: t.pendingEditToken, cell: { surfaceId: t.surfaceId, keyId: t.keyId, localeCode: t.localeCode, restoreValue } }];
    }),
    deliveryContexts: surfaces.map(surface => ({ surfaceId: surface.id, fingerprint: contextOf(project, surface) })),
  };
}

function contextOf(
  project: { repositoryId: string | null; baseBranch: string },
  surface: { id: string; importRevision: number; adapterName: string | null; pathTemplate: string | null; nested: boolean | null; nestedByPath: unknown; baseLocale: string | null },
): string {
  return deliveryContextFingerprint({ repositoryId: project.repositoryId, baseBranch: project.baseBranch, surface });
}

/**
 * **첫 외부 쓰기 직전의 무효화** (ARCHITECTURE §0 불변식 9 · §5.8). 이미 무효인 행의 시각은 바꾸지 않는다 — 처음 무효가 된 순간이
 * 남아야 한다. 되살리는 길은 성공 확정 tx(`saveLastPulledAt`의 `delivery`) 하나뿐이다.
 * base branch 변경도 이 함수를 같은 tx에서 부른다 — A → B → A로 되돌려도 지문만으로는 옛 확인이 부활하기 때문이다.
 */
export async function invalidateDeliveryConfirmations(
  db: { deliveryConfirmation: Pick<Prisma.TransactionClient["deliveryConfirmation"], "updateMany"> },
  projectId: string,
): Promise<void> {
  await db.deliveryConfirmation.updateMany({ where: { projectId, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
}

/**
 * 2층까지 통과했을 때의 갱신. **`published`가 있으면 같은 `update`에 함께 실린다** — 왕복을 두 번
 * 만들지 않는다.
 *
 * ⚠️ **`skipped`는 `lastPublishedAt`을 건드리지 않는다** — 그 컬럼은 "마지막으로 **보낸**" 시각이지
 * "마지막으로 시도한" 시각이 아니다 (ARCHITECTURE §3). 반대로 `lastPulledAt`은 변경 없는
 * 스킵에도 전진한다(그 순간 export == base 트리가 검증된 상태다).
 *
 * 시각은 **여기서** 잰다 — `lastPulledAt`에 들어가는 캡처 값(`max(updatedAt)`)은 벽시계가 아니라
 * 그 둘이 같은 값이면 안 된다.
 */
export async function saveLastPulledAt(
  prisma: PrismaClient,
  projectId: string,
  at: Date,
  published: { prUrl: string } | undefined,
  delivered: readonly PendingEdit[],
  /**
   * 실행권과 캡처 context. 없으면(실행 행 없는 호출) 전달 확인·기준을 건드리지 않는다 — 늦은 성공을 가를 수 없다.
   * `withheld`는 이번 PR에 못 실은 캡처 편집이다 — 토큰은 그대로 두고 기준 행의 revision만 새 확인으로 다시 찍는다.
   */
  delivery?: { runId: string; contexts: readonly DeliveryContext[]; withheld?: readonly PendingEdit[] },
): Promise<void> {
  const project = {
    where: { id: projectId },
    data: {
      lastPulledAt: at,
      ...(published === undefined ? {} : { lastPublishedAt: new Date(), lastPrUrl: published.prUrl }),
    },
  };
  if (delivery !== undefined) {
    await prisma.$transaction(tx => confirmDelivery(tx, projectId, project, delivered, delivery));
    return;
  }
  if (delivered.length === 0) {
    await prisma.project.update(project);
    return;
  }
  // 같은 트랜잭션이다 — `lastPulledAt`만 전진하고 해제가 빠지면 옛 술어는 0인데 토큰이 남는 "유령 pending"이 된다
  // (ARCHITECTURE §3). 두 쓰기를 `Promise.all`로 겹치지 않는다(POSTMORTEM 2026-09-16).
  await prisma.$transaction(async (tx) => {
    await tx.project.update(project);
    await acknowledgeDelivered(tx, projectId, delivered);
  });
}

/**
 * **캡처한 토큰이 아직 그대로인 셀만** 해제한다 — 캡처 뒤 같은 셀을 다시 저장했으면 토큰이 달라 남는다(같은 밀리초여도).
 *
 * ⚠️ **선조회 후 무조건 UPDATE로 바꾸지 않는다** — 이 조건부 UPDATE 한 문장이 방어선이다 (ARCHITECTURE §3).
 * ⚠️ `updatedAt`을 건드리지 않는다 — raw SQL이라 `@updatedAt`이 개입하지 않는다. 시각이 움직이면 방금 쓴
 * `lastPulledAt`(= 캡처한 `max(updatedAt)`)보다 뒤가 되어 옛 술어가 전달한 편집을 다시 센다.
 * ⚠️ orphan 키·로케일·보관 표면 셀은 캡처 뒤 그렇게 됐어도 여기서 바꾸지 않는다 (완료 조건 9).
 */
async function acknowledgeDelivered(tx: Prisma.TransactionClient, projectId: string, delivered: readonly PendingEdit[]): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Translation" AS t SET "pendingEditToken" = NULL
    FROM unnest(${delivered.map(d => d.id)}::text[], ${delivered.map(d => d.token)}::text[]) AS v("id", "token"),
      "TranslationSurface" s, "StringKey" k, "Locale" l
    WHERE t."projectId" = ${projectId}
      AND t."id" = v."id" AND t."pendingEditToken" = v."token"
      AND s."projectId" = t."projectId" AND s."id" = t."surfaceId" AND s."archivedAt" IS NULL
      AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId" AND k."orphaned" = false
      AND l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode" AND l."orphaned" = false`;
}


/**
 * **성공 확정 tx** — `lastPulledAt` · 토큰 CAS · 기준 해제/교체 · 소스별 전달 확인이 한 트랜잭션이다 (ARCHITECTURE §5.8).
 *
 * ⚠️ **잠금은 Project → 정렬된 Surface다** — 번역 저장과 같은 순서라, 기준을 고르는 사이 저장이 끼어 토큰을 바꾸지 못한다.
 * ⚠️ **토큰 CAS와 기준 교체를 같은 조건으로 묶지 않는다** — 캡처 뒤 재편집된 셀은 pending이 남고 기준은 캡처값이다(현재 DB 값이 아니다).
 * ⚠️ 실행권(RUNNING)을 잃었거나 캡처 뒤 context가 바뀐 소스는 확인을 쓰지 않는다 — 늦은 Publish가 무효화를 덮지 않는다.
 * 그때도 `lastPulledAt`·CAS는 기존대로 간다 — 전달 자체는 일어났고, 그 판정은 이 기능 전부터의 계약이다.
 */
async function confirmDelivery(
  tx: Prisma.TransactionClient,
  projectId: string,
  project: { where: { id: string }; data: Prisma.ProjectUpdateInput },
  delivered: readonly PendingEdit[],
  delivery: { runId: string; contexts: readonly DeliveryContext[]; withheld?: readonly PendingEdit[] },
): Promise<void> {
  const surfaceIds = [...new Set(delivery.contexts.map(c => c.surfaceId))].sort();
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  // ⚠️ 한 문장·id 순이다 — 잠금 순서가 고정돼야 저장과 교착하지 않는다.
  if (surfaceIds.length > 0) {
    await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ANY(${surfaceIds}::text[]) ORDER BY "id" FOR UPDATE`;
  }

  // CAS가 토큰을 비우기 전에 읽는다 — "캡처 뒤 바뀌었나"는 지금 값과 캡처 값의 비교다.
  const current = delivered.length === 0 ? [] : await tx.translation.findMany({
    where: { projectId, id: { in: delivered.map(d => d.id) } },
    select: { id: true, pendingEditToken: true },
  });
  await tx.project.update(project);
  if (delivered.length > 0) await acknowledgeDelivered(tx, projectId, delivered);

  const cellById = new Map(delivered.flatMap(d => d.cell === undefined ? [] : [[d.id, d.cell] as const]));
  const plan = planPublishBaselines(
    delivered.flatMap(d => d.cell === undefined ? [] : [{ cellId: d.id, token: d.token, restoreValue: d.cell.restoreValue }]),
    new Map(current.map(row => [row.id, row.pendingEditToken])),
  );
  const released = plan.release.flatMap(id => { const cell = cellById.get(id); return cell === undefined ? [] : [cell]; });
  if (released.length > 0) {
    await tx.translationBaseline.deleteMany({ where: { projectId, OR: released.map(c => ({ surfaceId: c.surfaceId, keyId: c.keyId, localeCode: c.localeCode })) } });
  }

  const run = await tx.syncRun.findFirst({ where: { id: delivery.runId, projectId }, select: { status: true } });
  if (run?.status !== "RUNNING") return;

  // 순차로 읽는다 — 대화형 트랜잭션은 커넥션 하나라 `Promise.all`이 왕복을 줄이지 못한다(POSTMORTEM 2026-09-16).
  const owner = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { repositoryId: true, baseBranch: true } });
  const rows = await tx.translationSurface.findMany({ where: { projectId, id: { in: surfaceIds }, archivedAt: null } });
  const now = new Date();
  const revisionBySurface = new Map<string, string>();
  /** 보류 셀 기준을 옮길 수 있는 표면 — 같은 context의 직전 확인 revision → 새 revision. 아래 재갱신 주석이 이유다. */
  const restamp = new Map<string, { from: string; to: string }>();
  for (const context of delivery.contexts) {
    const row = rows.find(r => r.id === context.surfaceId);
    if (row === undefined || contextOf(owner, row) !== context.fingerprint) continue;
    const revision = randomUUID();
    revisionBySurface.set(row.id, revision);
    // 덮기 전에 읽는다 — 직전 확인이 어느 context의 것이었는지가 재갱신의 자격이다.
    const prior = await tx.deliveryConfirmation.findUnique({
      where: { projectId_surfaceId: { projectId, surfaceId: row.id } }, select: { revision: true, contextFingerprint: true },
    });
    if (prior !== null && prior.contextFingerprint === context.fingerprint) restamp.set(row.id, { from: prior.revision, to: revision });
    const data = { revision, confirmedAt: now, syncRunId: delivery.runId, contextFingerprint: context.fingerprint, invalidatedAt: null };
    await tx.deliveryConfirmation.upsert({
      where: { projectId_surfaceId: { projectId, surfaceId: row.id } },
      create: { projectId, surfaceId: row.id, ...data },
      update: data,
    });
  }
  /**
   * ⚠️ **보류 셀의 기준을 새 revision으로 다시 찍는다** (delivery-invariants D3). 표면 확인은 새 revision으로 바뀌었는데 보류 셀의 기준
   * 행이 옛 revision이면 Revert가 `baseline-stale`로 막힌다 — 보류가 풀리는 길 하나(OWNER Revert)가 닫힌다. `restoreValue`는 불변이다
   * (마지막 전달 값 그대로). 기준 행이 없는 셀은 만들지 않는다 — 그 셀은 원래 unknown이다.
   * 확인 등식("미전달이 아닌 셀은 export 값 = 기준")은 pending 셀에 걸리지 않으므로 보류 셀이 등식을 깨지 않는다.
   *
   * ⚠️ **같은 context의 직전 확인에서 온 기준만 옮긴다** (coordinator review r1). 직전 확인의 지문이 지금과 같고, 기준 행의 revision이 그
   * 확인의 것일 때만이다. base branch가 main → release로 바뀐 뒤 release에 파일이 없으면, main에서 확인된 기준을 release의 revision으로
   * 찍는 순간 Revert가 release에서 한 번도 확인된 적 없는 값을 복원하고 토큰을 비운다(불변식 9). 그 셀은 `baseline-stale`로 남는 것이 맞다.
   */
  const withheldCells = (delivery.withheld ?? []).flatMap(edit => edit.cell === undefined ? [] : [edit.cell]);
  for (const [surfaceId, { from, to }] of restamp) {
    const cells = withheldCells.filter(cell => cell.surfaceId === surfaceId);
    if (cells.length === 0) continue;
    await tx.translationBaseline.updateMany({
      where: { projectId, surfaceId, revision: from, OR: cells.map(cell => ({ keyId: cell.keyId, localeCode: cell.localeCode })) },
      data: { revision: to },
    });
  }
  for (const { cellId, restoreValue } of plan.rebase) {
    const cell = cellById.get(cellId);
    const revision = cell === undefined ? undefined : revisionBySurface.get(cell.surfaceId);
    if (cell === undefined || revision === undefined) continue;
    const key = { projectId, surfaceId: cell.surfaceId, keyId: cell.keyId, localeCode: cell.localeCode };
    await tx.translationBaseline.upsert({
      where: { projectId_surfaceId_keyId_localeCode: key },
      create: { ...key, restoreValue, revision, recordedAt: now },
      update: { restoreValue, revision, recordedAt: now },
    });
  }
}
