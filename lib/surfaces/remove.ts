import "server-only";
import { z } from "zod";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { lockProjectAccess } from "@/lib/auth/lock";
import type { AccessError } from "@/lib/auth/message";
import type { Subject } from "@/lib/auth/subject";
import { recordEvent } from "@/lib/events/record";
import { readLocaleChangeStates } from "@/lib/import/approval";
import { hasActiveImport } from "@/lib/import/plan";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { removalFingerprint, sameFingerprint } from "@/lib/protection/fingerprint";
import { getSurfaceAccess } from "./access";
import { planSurfaceRemoval, type RemovalRefusal, type SourceRemovalError } from "./plan-removal";

/**
 * **소스 제거의 공유 코어** (sources-add-remove — ARCHITECTURE §5.9). 편집 UI의 `removeSource`·`previewSourceRemoval`과 MCP
 * `detach_source`·`preview_source_detach`이 같은 인가·잠금 tx·사건을 지난다. 인가는 `project:settings`다.
 *
 * ⚠️ **번역을 건드리지 않는다** — 편집 폐기는 그 소스를 다시 추가할 때의 첫 적재가 한다(`createSurfaces`의 revive 갈래).
 * 그래서 미전달이 있으면 승인을 **제거 시점에** 받는다(지문).
 */

export const RemoveSourceInput = z.object({ slug: z.string().min(1), surfaceSlug: z.string().min(1), approval: z.string().min(1).nullable() });
export const PreviewSourceRemovalInput = z.object({ slug: z.string().min(1), surfaceSlug: z.string().min(1) });

export type { SourceRemovalError };
export type SourceRemovalResult = { ok: true } | { ok: false; error: SourceRemovalError };

/** `openPr` — `open`은 열린 Malmoi PR이 있다, `unknown`은 조회 실패(확인 창 줄만 바뀌고 제거를 막지 않는다). */
export type SourceRemovalPreview =
  | { ok: true; pendingCount: number; approval: string | null; openPr: "open" | "none" | "unknown" }
  | { ok: false; error: AccessError | RemovalRefusal };

/**
 * 판정 입력 — 잠금 뒤(실행)와 잠금 없는 읽기(미리보기)가 같은 질의를 지난다. 사본 둘이면 세는 집합이 갈린다.
 *
 * ⚠️ **토큰은 `surfaceId` 전체에서 읽는다 — orphaned 키·로케일 포함** (POSTMORTEM "세는 집합 ≠ 바꾸는 집합"). 되살림이 승인하는
 * 집합이 그것이라, 화면용 `pendingWhere`(활성만)로 세면 확인 창이 말하지 않은 편집이 덮인다.
 */
async function readRemoval(db: Prisma.TransactionClient | PrismaClient, projectId: string, surfaceId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { archivedAt: true, defaultSurfaceId: true } });
  const active = await db.translationSurface.findMany({ where: { projectId, archivedAt: null }, select: { id: true, slug: true, lastImportStartedAt: true } });
  const pending = await db.translation.findMany({
    where: { projectId, surfaceId, pendingEditToken: { not: null } },
    select: { id: true, pendingEditToken: true },
  });
  const target = active.find(surface => surface.id === surfaceId);
  const verdict = planSurfaceRemoval({
    targetId: surfaceId,
    active,
    defaultSurfaceId: project?.defaultSurfaceId ?? null,
    projectArchived: project === null || project.archivedAt !== null,
    importing: target !== undefined && hasActiveImport(target.lastImportStartedAt, new Date()),
  });
  // 그 소스의 언어 변경 상태 — 제거가 의도 행·전달 목록을 지우므로 승인에 묶는다(locale-add design §5 "소스 제거·재등록").
  const localeChanges = await readLocaleChangeStates(db, projectId, surfaceId);
  return { verdict, pending: pending.flatMap(row => row.pendingEditToken === null ? [] : [{ id: row.id, token: row.pendingEditToken }]), localeChanges };
}

/** 승인이 필요한가 — 미전달 편집이나 언어 변경 상태가 있으면 그것을 버리는 제거다. */
const needsApproval = (read: { pending: readonly unknown[]; localeChanges: readonly unknown[] }) => read.pending.length > 0 || read.localeChanges.length > 0;

export async function previewSurfaceRemoval(prisma: PrismaClient, subject: Subject, input: z.infer<typeof PreviewSourceRemovalInput>): Promise<SourceRemovalPreview> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  if (access.archived) return { ok: false, error: "archived" };
  const { projectId, surfaceId } = access;
  const read = await readRemoval(prisma, projectId, surfaceId);
  const { verdict, pending, localeChanges } = read;
  if (!verdict.ok) return { ok: false, error: verdict.error };
  const approval = needsApproval(read) ? removalFingerprint({ userId: subject.userId, projectId, surfaceId, pending, localeChanges }) : null;
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { repoOwner: true, repoName: true, repoHost: true, installationId: true, gitlabConnectionId: true, repositoryId: true, archivedAt: true },
  });
  const pr = await loadOpenPrUrl(input.slug, project);
  return { ok: true, pendingCount: pending.length, approval, openPr: pr === undefined ? "unknown" : pr === null ? "none" : "open" };
}

export async function removeSurface(prisma: PrismaClient, subject: Subject, input: z.infer<typeof RemoveSourceInput>): Promise<SourceRemovalResult> {
  const { userId, credential } = subject;
  const access = await getSurfaceAccess(prisma, { userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId, surfaceId } = access;

  return prisma.$transaction(async (tx) => {
    // CI 적재·Publish와 같은 잠금 순서(Project → Surface). 동시 제거 둘이 여기서 줄을 서야 `last-source`가 참이다.
    const locked = await lockProjectAccess(tx, { projectId, userId, permission: "project:settings", surfaceId, credential });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const read = await readRemoval(tx, projectId, surfaceId);
    const { verdict, pending, localeChanges } = read;
    if (!verdict.ok) return { ok: false, error: verdict.error } as const;
    if (needsApproval(read) && !sameFingerprint(input.approval, removalFingerprint({ userId, projectId, surfaceId, pending, localeChanges }))) {
      return { ok: false, error: "stale-approval" } as const;
    }
    const surface = await tx.translationSurface.update({ where: { id: surfaceId, projectId }, data: { archivedAt: new Date() }, select: { slug: true, adapterName: true } });
    /**
     * ⚠️ **그 소스의 언어 변경 의도와 전달 목록을 지운다** (locale-add design §1 끝) — 남기면 되살린 소스(다른 설정일 수 있다)의 다음 Publish가 이전 삭제를
     * 다시 싣는다. 존재는 되살림의 첫 strict 적재가 리포대로 정한다. 로케일·번역 행은 그대로다(불변식 3). 위 승인이 이 집합을 묶었다.
     */
    await tx.localeChange.deleteMany({ where: { projectId, surfaceId } });
    await tx.$executeRaw`UPDATE "DeliveryConfirmation" SET "deliveredLocaleChanges" = NULL WHERE "projectId" = ${projectId} AND "surfaceId" = ${surfaceId}`;
    // ⚠️ 복합 FK `(id, defaultSurfaceId)`가 같은 프로젝트를 강제한다 — 승계 대상은 잠금 뒤 읽은 활성 목록에서만 나온다.
    if (verdict.nextDefaultId !== null) await tx.project.update({ where: { id: projectId }, data: { defaultSurfaceId: verdict.nextDefaultId } });
    await recordEvent(tx, {
      projectId,
      subtype: "surface.removed",
      actor: { kind: "USER", userId },
      surfaceIds: [surfaceId],
      payload: { kind: "SURFACE", surfaceSlug: surface.slug, adapter: surface.adapterName, baseLocale: null },
    });
    return { ok: true } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}
