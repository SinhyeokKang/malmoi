import "server-only";
import { z } from "zod";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { LockedAccess, ProjectAccess } from "@/lib/auth/access";
import { lockProjectAccess } from "@/lib/auth/lock";
import type { Subject } from "@/lib/auth/subject";
import { recordEvent } from "@/lib/events/record";
import type { LocaleChangeDetail, LocaleChangeSubtype } from "@/lib/events/payload";
import { sameFingerprint } from "@/lib/protection/fingerprint";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import type { SurfacePaths } from "@/lib/surfaces/plan";
import { planPublishBarrier, uncertainPublishWhere } from "@/lib/sync/execution";

import { planLocaleChange, type ApprovalState, type LocaleChangeRefusal, type LocaleChangeRequest, type LocaleTransition } from "./change-plan";
import { localeChangeFingerprint } from "./fingerprint";
import { deliveredOf, readLocaleValueCounts } from "./work";

/**
 * **언어 추가·제거·취소의 공유 코어** (locale-add design §3 — tasks §3). 편집 UI의 Action과 MCP 도구(`add_locale`·`preview_locale_removal`·
 * `remove_locale`·`cancel_locale_removal`)가 같은 인가·잠금 tx·사건을 지난다. 인가는 `project:settings`(OWNER)다.
 *
 * 쓰기 순서: `lockProjectAccess`(Project → Surface 잠금 + 인가 재판정) → 상태 재조회 → 순수 판정(`planLocaleChange`) →
 * Locale·LocaleChange·토큰·ProjectEvent를 **같은 tx**에서 바꾼다. CI 적재·Publish 확정·저장과 같은 잠금 순서라 교착하지 않는다.
 *
 * ⚠️ **결과 미확정 Publish 중에는 바꾸지 않는다** (`publish-unsettled`) — 응답이 유실된 실행은 원격에 파일을 실었을 수 있는데 전달 목록은
 * 갱신되지 않았다. 판정은 수동 실행권과 같은 장벽(`planPublishBarrier`)이고, 실행권도 같은 `Project` 잠금 안에서 잡히므로 둘은 직렬이다.
 * ⚠️ **로케일·번역 행을 지우지 않는다** — 추가 취소는 orphan, 제거는 의도 행만 남긴다(불변식 3).
 * ⚠️ 토큰 갱신은 raw SQL이다 — `@updatedAt`을 올리지 않는다(값은 바뀌지 않았다. `releaseOrphanedApproved`와 같은 이유).
 * ⚠️ revalidate는 호출자(Action·MCP)의 몫이다.
 */

const LocaleTarget = z.object({ slug: z.string().min(1), surfaceSlug: z.string().min(1), localeCode: z.string().min(1) });
export const AddLocaleInput = LocaleTarget;
export const PreviewLocaleRemovalInput = LocaleTarget;
export const RemoveLocaleInput = LocaleTarget.extend({ approval: z.string().min(1).nullable() });
export const CancelLocaleRemovalInput = LocaleTarget;

export type LocaleChangeError = Exclude<ProjectAccess, { status: "ok" }>["status"] | Exclude<LockedAccess, { status: "ok" }>["status"] | LocaleChangeRefusal;

export type AddLocaleResult = { ok: true; action: "create" | "revive"; path: string; reissued: number } | { ok: false; error: LocaleChangeError };

/**
 * 제거·추가 취소 미리보기. `translations`는 그 언어의 값 있는 번역 수(활성 키), `pendingCount`는 폐기될 그 언어 미전달 편집 수,
 * `delivered`는 그 언어의 파일 변경이 이미 PR/MR에 실렸나다. `approval`은 실행이 다시 대조할 서버 지문이다 — 승인은 항상 요구한다.
 */
export type LocaleRemovalPreview =
  | { ok: true; kind: "request-removal" | "cancel-add"; path: string; translations: number; pendingCount: number; delivered: boolean; approval: string }
  | { ok: false; error: LocaleChangeError };

export type RemoveLocaleResult = { ok: true; kind: "request-removal" | "cancel-add"; discarded: number } | { ok: false; error: LocaleChangeError };

/** `delivered` — 취소한 제거가 이미 PR/MR에 실렸다. 다음 Publish가 그 삭제를 지울 때까지 그 언어는 Unsent다(spec 11). */
export type CancelLocaleRemovalResult = { ok: true; delivered: boolean } | { ok: false; error: LocaleChangeError };

type Db = Prisma.TransactionClient | PrismaClient;
type Scope = { projectId: string; surfaceId: string };

/** 결과 미확정 Publish가 있나 — 수동 실행권의 장벽(`lib/sync/run.ts`)과 같은 판정이다. 새 사유 코드를 만들지 않는다. */
async function publishUnsettled(db: Db, projectId: string): Promise<boolean> {
  const now = new Date();
  const running = await db.syncRun.findFirst({ where: { projectId, status: "RUNNING" }, orderBy: { startedAt: "desc" }, select: { status: true, errorCode: true, startedAt: true } });
  const uncertain = await db.syncRun.findFirst({ where: uncertainPublishWhere(projectId, now), orderBy: { startedAt: "desc" }, select: { status: true, errorCode: true, startedAt: true } });
  return [running, uncertain].some(run => run !== null && planPublishBarrier(run, now) !== null);
}

/**
 * 판정 입력 — 잠금 뒤(실행)와 스냅샷 읽기(미리보기)가 같은 질의를 지난다. 사본 둘이면 세는 집합이 갈린다.
 * ⚠️ 토큰은 그 소스·언어 전체에서 읽는다 — orphan 키 포함. 폐기가 바꾸는 집합과 지문·미리보기가 세는 집합이 같아야 한다.
 */
async function readChangeState(db: Db, scope: Scope, code: string) {
  const { projectId, surfaceId } = scope;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { archivedAt: true } });
  const surface = await db.translationSurface.findFirst({
    where: { id: surfaceId, projectId },
    select: { slug: true, adapterName: true, pathTemplate: true, baseLocale: true, declaredBaseLocale: true },
  });
  const locales = await db.locale.findMany({ where: { projectId, surfaceId }, select: { code: true, orphaned: true } });
  const changes = await db.localeChange.findMany({ where: { projectId, surfaceId }, select: { localeCode: true, operation: true, requestedAt: true } });
  const others = await db.translationSurface.findMany({
    where: { projectId, archivedAt: null, id: { not: surfaceId } },
    select: { id: true, slug: true, pathTemplate: true, locales: { where: { orphaned: false }, select: { code: true } } },
  });
  const pending = await db.translation.findMany({ where: { projectId, surfaceId, localeCode: code, pendingEditToken: { not: null } }, select: { id: true, pendingEditToken: true } });
  const confirmation = await db.deliveryConfirmation.findUnique({
    where: { projectId_surfaceId: { projectId, surfaceId } },
    select: { deliveredLocaleChanges: true, invalidatedAt: true },
  });
  return {
    surfaceId,
    project,
    surface,
    locales,
    changes,
    otherSurfaces: others.map((other): SurfacePaths => ({ surfaceId: other.id, surfaceSlug: other.slug, paths: surfacePaths(other.pathTemplate, other.locales.map(locale => locale.code)) })),
    pending: pending.flatMap(row => row.pendingEditToken === null ? [] : [{ id: row.id, token: row.pendingEditToken }]),
    delivered: deliveredOf(confirmation),
    unsettled: await publishUnsettled(db, projectId),
  };
}

type ChangeState = Awaited<ReturnType<typeof readChangeState>>;

/** 다른 소스가 쥔 파일 경로 — 템플릿에 활성 로케일을 넣는다. `{locale}`이 없으면(공유 파일) 템플릿이 곧 경로다. */
function surfacePaths(pathTemplate: string | null, codes: readonly string[]): string[] {
  if (pathTemplate === null) return [];
  if (!pathTemplate.includes("{locale}")) return [pathTemplate];
  return [...new Set(codes.map(code => pathTemplate.replaceAll("{locale}", code)))];
}

function fingerprintOf(state: ChangeState, input: { userId: string; scope: Scope; code: string }): string | null {
  if (state.surface === null) return null;
  const row = state.changes.find(change => change.localeCode === input.code);
  return localeChangeFingerprint({
    userId: input.userId,
    projectId: input.scope.projectId,
    surfaceId: input.scope.surfaceId,
    localeCode: input.code,
    change: row === undefined ? null : { operation: row.operation, requestedAt: row.requestedAt.toISOString() },
    surface: { adapterName: state.surface.adapterName, pathTemplate: state.surface.pathTemplate, baseLocale: state.surface.baseLocale, declaredBaseLocale: state.surface.declaredBaseLocale },
    pending: state.pending,
  });
}

function judge(state: ChangeState, request: LocaleChangeRequest, approval: ApprovalState) {
  if (state.surface === null) return { ok: false, error: "not-found" } as const;
  const { surface } = state;
  return planLocaleChange({
    request,
    // 인가는 잠금(실행)·진입 판정(미리보기)이 이미 봤다 — 여기 닿으면 OWNER다.
    canManage: true,
    projectArchived: state.project === null || state.project.archivedAt !== null,
    publishUnsettled: state.unsettled,
    // ⚠️ 선언된 기준 언어도 제거할 수 없다 — 다음 적재가 그 언어를 기준으로 세우는데 Publish가 그 파일을 지우면 기준 파일이 사라진다.
    surface: { id: state.surfaceId, adapterName: surface.adapterName, pathTemplate: surface.pathTemplate,
      baseLocale: request.kind === "remove" && surface.declaredBaseLocale === request.code ? request.code : surface.baseLocale },
    locales: state.locales,
    changes: state.changes,
    otherSurfaces: state.otherSurfaces,
    approval,
  });
}

function approvalState(approved: string | null, current: string | null): ApprovalState {
  if (approved === null) return "missing";
  return current !== null && sameFingerprint(approved, current) ? "valid" : "stale";
}

function hasDelivered(state: ChangeState, code: string, effect: "create" | "delete"): boolean {
  return (state.delivered ?? []).some(item => item.localeCode === code && item.effect === effect);
}

/** 같은 tx에 남기는 언어 변경 사건 — 실패하면 상태 변경과 함께 롤백된다. */
async function recordLocaleEvent(tx: Prisma.TransactionClient, input: { scope: Scope; userId: string; surfaceSlug: string; subtype: LocaleChangeSubtype; detail: LocaleChangeDetail }) {
  await recordEvent(tx, {
    projectId: input.scope.projectId,
    subtype: input.subtype,
    actor: { kind: "USER", userId: input.userId },
    surfaceIds: [input.scope.surfaceId],
    payload: { kind: "SURFACE", surfaceSlug: input.surfaceSlug, adapter: null, baseLocale: null, localeChange: input.detail },
  });
}

/** 승인된 그 언어의 토큰만 비운다 — 잠금 뒤 다시 읽어 지문으로 대조한 집합이다. 다른 언어·다른 소스는 대상이 아니다. */
async function discardApproved(tx: Prisma.TransactionClient, scope: Scope, code: string, tokens: readonly string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  return tx.$executeRaw`
    UPDATE "Translation" SET "pendingEditToken" = NULL
    WHERE "projectId" = ${scope.projectId} AND "surfaceId" = ${scope.surfaceId} AND "localeCode" = ${code}
      AND "pendingEditToken" = ANY(${[...tokens]}::text[])`;
}

export async function addLocale(prisma: PrismaClient, subject: Subject, input: z.infer<typeof AddLocaleInput>): Promise<AddLocaleResult> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const scope = { projectId: access.projectId, surfaceId: access.surfaceId };
  const code = input.localeCode;

  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId: scope.projectId, userId: subject.userId, permission: "project:settings", surfaceId: scope.surfaceId, credential: subject.credential });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const state = await readChangeState(tx, scope, code);
    const verdict = judge(state, { kind: "add", code }, "missing");
    if (!verdict.ok) return { ok: false, error: verdict.error } as const;
    if (verdict.transition.kind !== "add" || state.surface === null) return { ok: false, error: "not-found" } as const;
    const { action, path } = verdict.transition;
    if (action === "create") {
      await tx.locale.create({ data: { projectId: scope.projectId, surfaceId: scope.surfaceId, code, name: code, isBase: false } });
    } else {
      await tx.locale.update({ where: { projectId_surfaceId_code: { projectId: scope.projectId, surfaceId: scope.surfaceId, code } }, data: { orphaned: false, isBase: false } });
    }
    // 되살림 — 값 있는 활성 셀에 새 편집 토큰. 값·저자는 그대로이고 복원 기준(`TranslationBaseline`)은 만들지 않는다(design §4).
    const reissued = action === "create" ? 0 : await tx.$executeRaw`
      UPDATE "Translation" AS t SET "pendingEditToken" = gen_random_uuid()::text
      FROM "StringKey" k
      WHERE t."projectId" = ${scope.projectId} AND t."surfaceId" = ${scope.surfaceId} AND t."localeCode" = ${code} AND t."value" <> ''
        AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId" AND NOT k."orphaned"`;
    await tx.localeChange.create({ data: { projectId: scope.projectId, surfaceId: scope.surfaceId, localeCode: code, operation: "ADD" } });
    await recordLocaleEvent(tx, { scope, userId: subject.userId, surfaceSlug: state.surface.slug, subtype: "surface.localeAdded",
      detail: { locale: code, operation: "ADD", revived: action === "revive", discarded: null, outcome: null } });
    return { ok: true, action, path, reissued } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function previewLocaleRemoval(prisma: PrismaClient, subject: Subject, input: z.infer<typeof PreviewLocaleRemovalInput>): Promise<LocaleRemovalPreview> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  if (access.archived) return { ok: false, error: "archived" };
  const scope = { projectId: access.projectId, surfaceId: access.surfaceId };
  const code = input.localeCode;
  // 읽기뿐이지만 한 스냅샷이어야 한다 — 토큰과 행을 다른 순간에 읽으면 지문이 어느 상태도 가리키지 않는다.
  return prisma.$transaction(async (tx) => {
    const state = await readChangeState(tx, scope, code);
    // 승인을 만들기 전의 판정이라 "유효"로 넣는다 — 상태 거부만 본다.
    const verdict = judge(state, { kind: "remove", code }, "valid");
    if (!verdict.ok) return { ok: false, error: verdict.error } as const;
    const transition = verdict.transition;
    const approval = fingerprintOf(state, { userId: subject.userId, scope, code });
    if ((transition.kind !== "request-removal" && transition.kind !== "cancel-add") || approval === null) return { ok: false, error: "not-found" } as const;
    const counts = await readLocaleValueCounts(tx, scope.projectId, [scope.surfaceId], [code]);
    return {
      ok: true,
      kind: transition.kind,
      path: transition.path,
      translations: counts.get(scope.surfaceId)?.get(code) ?? 0,
      pendingCount: state.pending.length,
      delivered: hasDelivered(state, code, transition.kind === "cancel-add" ? "create" : "delete"),
      approval,
    } as const;
  }, { isolationLevel: "RepeatableRead" });
}

export async function removeLocale(prisma: PrismaClient, subject: Subject, input: z.infer<typeof RemoveLocaleInput>): Promise<RemoveLocaleResult> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const scope = { projectId: access.projectId, surfaceId: access.surfaceId };
  const code = input.localeCode;

  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId: scope.projectId, userId: subject.userId, permission: "project:settings", surfaceId: scope.surfaceId, credential: subject.credential });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const state = await readChangeState(tx, scope, code);
    // 잠금 뒤 같은 입력으로 다시 계산해 대조한다 — 확인 창 뒤의 새 편집·요청·설정 변경이 옛 승인을 무효로 만든다.
    const verdict = judge(state, { kind: "remove", code }, approvalState(input.approval, fingerprintOf(state, { userId: subject.userId, scope, code })));
    if (!verdict.ok) return { ok: false, error: verdict.error } as const;
    const transition: LocaleTransition = verdict.transition;
    if ((transition.kind !== "request-removal" && transition.kind !== "cancel-add") || state.surface === null) return { ok: false, error: "not-found" } as const;
    const discarded = await discardApproved(tx, scope, code, state.pending.map(cell => cell.token));
    const where = { projectId_surfaceId_localeCode: { projectId: scope.projectId, surfaceId: scope.surfaceId, localeCode: code } };
    if (transition.kind === "request-removal") {
      // 바로 orphan하지 않는다 — base에 파일이 있고 취소하면 편집을 다시 허용해야 한다(design §1).
      await tx.localeChange.create({ data: { projectId: scope.projectId, surfaceId: scope.surfaceId, localeCode: code, operation: "REMOVE" } });
    } else {
      await tx.localeChange.delete({ where });
      await tx.locale.update({ where: { projectId_surfaceId_code: { projectId: scope.projectId, surfaceId: scope.surfaceId, code } }, data: { orphaned: true, isBase: false } });
    }
    await recordLocaleEvent(tx, {
      scope, userId: subject.userId, surfaceSlug: state.surface.slug,
      subtype: transition.kind === "request-removal" ? "surface.localeRemovalRequested" : "surface.localeChangeCancelled",
      detail: { locale: code, operation: transition.kind === "request-removal" ? "REMOVE" : "ADD", revived: null, discarded, outcome: null },
    });
    return { ok: true, kind: transition.kind, discarded } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function cancelLocaleRemoval(prisma: PrismaClient, subject: Subject, input: z.infer<typeof CancelLocaleRemovalInput>): Promise<CancelLocaleRemovalResult> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const scope = { projectId: access.projectId, surfaceId: access.surfaceId };
  const code = input.localeCode;

  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId: scope.projectId, userId: subject.userId, permission: "project:settings", surfaceId: scope.surfaceId, credential: subject.credential });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const state = await readChangeState(tx, scope, code);
    const verdict = judge(state, { kind: "cancel-removal", code }, "missing");
    if (!verdict.ok) return { ok: false, error: verdict.error } as const;
    if (state.surface === null) return { ok: false, error: "not-found" } as const;
    await tx.localeChange.delete({ where: { projectId_surfaceId_localeCode: { projectId: scope.projectId, surfaceId: scope.surfaceId, localeCode: code } } });
    await recordLocaleEvent(tx, { scope, userId: subject.userId, surfaceSlug: state.surface.slug, subtype: "surface.localeChangeCancelled",
      detail: { locale: code, operation: "REMOVE", revived: null, discarded: null, outcome: null } });
    return { ok: true, delivered: hasDelivered(state, code, "delete") } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}
