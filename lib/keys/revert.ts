import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { recordEvent } from "@/lib/events/record";
import { sameFingerprint } from "@/lib/protection/fingerprint";
import { pendingWhere } from "@/lib/protection/where";
import { STALE_AFTER_SECONDS } from "@/lib/sync/plan";
import { planKeyRevert, revertSettled, type RevertPlan } from "@/lib/translations/baseline";
import { revertFingerprint } from "@/lib/translations/context";

import { readDeliveryState } from "./delivery";

/**
 * **Revert to last sent** (translation-rework T11 — spec §3.6 · ARCHITECTURE §5.8).
 *
 * 기준값은 전달 확인된 **DB 스냅샷**이고 현재 리포를 읽지 않는다 — 값을 고르는 코드가 아니라 스냅샷이 지정한 값을 쓰는 명령이다.
 * 대상은 그 키의 활성 미전달 셀 **전부**이고, 하나라도 기준이 없거나 낡았으면 쓰기 0건이다(부분 복원 없음).
 *
 * ⚠️ Action의 OWNER 인가는 입구 검사다. 실행은 잠금 뒤에도 멤버십과 보관 상태를 다시 확인한다.
 * ⚠️ `server-only`를 붙이지 않는다 — 격리 PG 통합 테스트가 직접 부른다.
 */
export type RevertTarget = { projectId: string; surfaceId: string; surfaceSlug: string; keyId: string; userId: string };

type Blocked = { status: "blocked"; reason: Exclude<RevertPlan, { ok: true }>["reason"] | "key-unavailable"; localeCodes?: string[] };

export type RevertPreview = { status: "ready"; locales: { code: string; before: string; after: string }[]; confirmation: string } | Blocked;
export type RevertResult = { status: "reverted"; cells: { localeCode: string; value: string }[] } | { status: "reconfirm" } | Blocked;

type State =
  | { ok: false; blocked: Blocked }
  | { ok: true; key: string; writes: { localeCode: string; value: string; expectedToken: string }[]; before: Map<string, string>; fingerprint: string };

async function revertState(tx: Prisma.TransactionClient, target: RevertTarget): Promise<State> {
  const { projectId, surfaceId, keyId } = target;
  const key = await tx.stringKey.findFirst({ where: { id: keyId, projectId, surfaceId, orphaned: false }, select: { key: true } });
  if (key === null) return { ok: false, blocked: { status: "blocked", reason: "key-unavailable" } };

  // 미전달 판정은 `pendingWhere` 하나다 — orphan 로케일·보관 표면의 셀은 대상이 아니다.
  const targets = await tx.translation.findMany({
    where: { ...pendingWhere(projectId, surfaceId), keyId },
    select: { localeCode: true, pendingEditToken: true, value: true, needsReview: true },
    orderBy: { localeCode: "asc" },
  });
  const baselines = await tx.translationBaseline.findMany({ where: { projectId, surfaceId, keyId }, select: { localeCode: true, restoreValue: true, revision: true } });
  const delivery = await readDeliveryState(tx, projectId, surfaceId);
  const running = await tx.syncRun.count({ where: { projectId, status: "RUNNING" } });
  const importing = await tx.project.findUnique({ where: { id: projectId }, select: { repositoryImportToken: true } });
  // 확인을 세운 실행보다 먼저 시작해 실패한 실행 중 가장 늦은 것 — 그보다 이른 실행은 더 일찍 끝났다.
  const unsettled = delivery === null ? null : await tx.syncRun.findFirst({
    where: { projectId, status: "FAILED", startedAt: { lte: delivery.runStartedAt } },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });

  const cells = targets.flatMap(t => t.pendingEditToken === null ? [] : [{ localeCode: t.localeCode, token: t.pendingEditToken, currentValue: t.value, needsReview: t.needsReview }]);
  const plan = planKeyRevert({
    targets: cells,
    baselines: new Map(baselines.map(b => [b.localeCode, { restoreValue: b.restoreValue, revision: b.revision }])),
    confirmation: delivery === null ? null : {
      revision: delivery.revision,
      valid: delivery.valid,
      settled: revertSettled({ unsettledRunStartedAt: unsettled?.startedAt ?? null, confirmationRunStartedAt: delivery.runStartedAt, staleAfterSeconds: STALE_AFTER_SECONDS }),
    },
    canRevert: true,
    draftDirty: false,
    busy: running > 0 || importing?.repositoryImportToken != null,
  });
  if (!plan.ok) {
    const blocked: Blocked = { status: "blocked", reason: plan.reason };
    if (plan.reason === "baseline-unknown") blocked.localeCodes = plan.localeCodes;
    return { ok: false, blocked };
  }
  const fingerprint = revertFingerprint({
    userId: target.userId, projectId, surfaceId, keyId,
    targets: cells.map(c => ({ localeCode: c.localeCode, token: c.token })),
    baselines: baselines.map(b => ({ localeCode: b.localeCode, revision: b.revision })),
    contextFingerprint: delivery?.contextFingerprint ?? null,
  });
  return { ok: true, key: key.key, writes: plan.writes, before: new Map(cells.map(c => [c.localeCode, c.currentValue])), fingerprint };
}

export async function previewKeyRevert(prisma: PrismaClient, target: RevertTarget): Promise<RevertPreview> {
  // 읽기뿐이지만 한 스냅샷이어야 한다 — 토큰과 기준을 다른 순간에 읽으면 지문이 어느 상태도 가리키지 않는다.
  const state = await prisma.$transaction(tx => revertState(tx, target), { isolationLevel: "RepeatableRead" });
  if (!state.ok) return state.blocked;
  return {
    status: "ready",
    locales: state.writes.map(w => ({ code: w.localeCode, before: state.before.get(w.localeCode) ?? "", after: w.value })),
    confirmation: state.fingerprint,
  };
}

export async function executeKeyRevert(prisma: PrismaClient, target: RevertTarget & { confirmation: string }): Promise<RevertResult> {
  const { projectId, surfaceId, surfaceSlug, keyId, userId } = target;
  return prisma.$transaction(async (tx) => {
    // 저장·Publish 확정과 같은 잠금 순서다 — 잠금 뒤에 다시 판정해야 확인창 이후의 변화를 본다.
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
    await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${surfaceId} FOR UPDATE`;
    const member = await tx.projectMember.findFirst({ where: { projectId, userId, role: "OWNER" }, select: { userId: true } });
    if (member === null) return { status: "blocked", reason: "forbidden" } as const;
    const active = await tx.translationSurface.findFirst({
      where: { id: surfaceId, projectId, archivedAt: null, project: { archivedAt: null } },
      select: { id: true },
    });
    if (active === null) return { status: "blocked", reason: "key-unavailable" } as const;
    const state = await revertState(tx, target);
    if (!state.ok) return state.blocked;
    if (!sameFingerprint(target.confirmation, state.fingerprint)) return { status: "reconfirm" } as const;

    for (const write of state.writes) {
      // 캡처한 토큰 그대로인 셀만 쓴다 — 잠금 안이라 어긋날 수 없지만, 어긋나면 전부 롤백해 부분 복원을 만들지 않는다.
      const updated = await tx.translation.updateMany({
        where: { projectId, surfaceId, keyId, localeCode: write.localeCode, pendingEditToken: write.expectedToken },
        // ⚠️ needsReview를 건드리지 않는다 — 복원은 검토 완료가 아니다. 저자는 되돌린 사람이다.
        data: { value: write.value, pendingEditToken: null, updatedBy: userId },
      });
      if (updated.count !== 1) throw new Error("revert target changed under lock");
      await recordEvent(tx, {
        projectId,
        subtype: "translation.reverted",
        actor: { kind: "USER", userId },
        surfaceIds: [surfaceId],
        payload: { kind: "TRANSLATION", surfaceSlug, key: state.key, locale: write.localeCode, before: state.before.get(write.localeCode) ?? null, after: write.value },
      });
    }
    // 전달 기준은 미전달 셀의 작업 상태다 — 되돌린 셀은 더 이상 미전달이 아니다.
    await tx.translationBaseline.deleteMany({ where: { projectId, surfaceId, keyId, localeCode: { in: state.writes.map(w => w.localeCode) } } });
    return { status: "reverted", cells: state.writes.map(w => ({ localeCode: w.localeCode, value: w.value })) } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}
