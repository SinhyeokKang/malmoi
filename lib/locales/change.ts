import "server-only";
import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { LockedAccess, ProjectAccess } from "@/lib/auth/access";
import { lockProjectAccess } from "@/lib/auth/lock";
import type { Subject } from "@/lib/auth/subject";
import { baseFilePath } from "@/lib/adapters/base-path";
import { recordEvent, recordEvents } from "@/lib/events/record";
import { readRestoreConfirmation } from "@/lib/keys/revert";
import type { LocaleChangeDetail, LocaleChangeSubtype } from "@/lib/events/payload";
import { sameFingerprint } from "@/lib/protection/fingerprint";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import type { SurfacePaths } from "@/lib/surfaces/plan";
import { planPublishBarrier, uncertainPublishWhere } from "@/lib/sync/execution";
import { planWriteLock } from "@/lib/sync/plan";
import { planKeyRevert } from "@/lib/translations/baseline";

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
export const PreviewLocaleAddInput = LocaleTarget;
export const PreviewLocaleRemovalInput = LocaleTarget;
export const RemoveLocaleInput = LocaleTarget.extend({ approval: z.string().min(1).nullable() });
export const CancelLocaleRemovalInput = LocaleTarget;

/**
 * `baseline-unknown`·`baseline-stale` — **제거가** 폐기할 미전달 셀에 마지막 전달 값(복원 기준)이 없거나 낡았다. Revert의 같은 이름 사유와 같은 판정이다
 * (R-B1 Y1). 추가 취소는 값을 되돌리지 않으므로 이 거부가 없다.
 */
export type LocaleChangeError = Exclude<ProjectAccess, { status: "ok" }>["status"] | Exclude<LockedAccess, { status: "ok" }>["status"] | LocaleChangeRefusal
  | "baseline-unknown" | "baseline-stale"
  /** 수동 Sync 적재 lease 중의 제거 — 저장·Revert와 같은 거부다(`planWriteLock`). */
  | "sync-running";

export type AddLocaleResult = { ok: true; action: "create" | "revive"; path: string; reissued: number } | { ok: false; error: LocaleChangeError };

/** 추가 미리보기 — 실행이 낼 `action`·`path`와, 되살림이면 토큰을 다시 받을 셀 수(`revive` = 실행의 `reissued`). 거부 코드는 실행과 같다. */
export type LocaleAddPreview = { ok: true; action: "create" | "revive"; path: string; revive: number } | { ok: false; error: LocaleChangeError };

/**
 * 제거·추가 취소 미리보기. `translations`는 그 언어의 값 있는 번역 수(활성 키), `pendingCount`는 폐기될 그 언어 미전달 편집 수,
 * `delivered`는 그 언어의 파일 변경이 이미 PR/MR에 실렸나다. `approval`은 실행이 다시 대조할 서버 지문이다 — 승인은 항상 요구한다.
 */
export type LocaleRemovalPreview =
  /** `delivered: null` — 확인이 무효화 중이라 실렸는지 모른다. `path: null` — 추가 취소에 언어별 파일 경로가 없다. */
  | { ok: true; kind: "request-removal" | "cancel-add"; path: string | null; translations: number; pendingCount: number; delivered: boolean | null; approval: string }
  | { ok: false; error: LocaleChangeError };

export type RemoveLocaleResult = { ok: true; kind: "request-removal" | "cancel-add"; discarded: number } | { ok: false; error: LocaleChangeError };

/** `delivered` — 취소한 제거가 이미 PR/MR에 실렸다. 다음 Publish가 그 삭제를 지울 때까지 그 언어는 Unsent다(spec 11). */
export type CancelLocaleRemovalResult = { ok: true; delivered: boolean | null } | { ok: false; error: LocaleChangeError };

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
async function readChangeState(db: Prisma.TransactionClient, scope: Scope, code: string) {
  const { projectId, surfaceId } = scope;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { archivedAt: true, repositoryImportToken: true, repositoryImportStartedAt: true } });
  const surface = await db.translationSurface.findFirst({
    where: { id: surfaceId, projectId },
    select: { slug: true, adapterName: true, pathTemplate: true, basePath: true, baseLocale: true, declaredBaseLocale: true },
  });
  const locales = await db.locale.findMany({ where: { projectId, surfaceId }, select: { code: true, orphaned: true } });
  const changes = await db.localeChange.findMany({ where: { projectId, surfaceId }, select: { localeCode: true, operation: true, requestedAt: true } });
  const others = await db.translationSurface.findMany({
    where: { projectId, archivedAt: null, id: { not: surfaceId } },
    select: { id: true, slug: true, pathTemplate: true, basePath: true, baseLocale: true, locales: { where: { orphaned: false }, select: { code: true } } },
  });
  const pending = await db.translation.findMany({
    where: { projectId, surfaceId, localeCode: code, pendingEditToken: { not: null } },
    select: { id: true, keyId: true, value: true, needsReview: true, pendingEditToken: true, stringKey: { select: { key: true } } },
  });
  // 제거의 폐기는 Revert와 같은 의미다 — 같은 기준 행·같은 확인 판정(`readRestoreConfirmation`)을 읽는다(design §3, R-B1 Y1).
  const baselines = await db.translationBaseline.findMany({ where: { projectId, surfaceId, localeCode: code }, select: { keyId: true, restoreValue: true, revision: true } });
  const restore = await readRestoreConfirmation(db, projectId, surfaceId, new Date());
  const confirmation = await db.deliveryConfirmation.findUnique({
    where: { projectId_surfaceId: { projectId, surfaceId } },
    select: { revision: true, deliveredLocaleChanges: true, invalidatedAt: true },
  });
  const counts = await readLocaleValueCounts(db, projectId, [surfaceId], [code]);
  return {
    surfaceId,
    project,
    surface,
    locales,
    changes,
    otherSurfaces: others.map((other): SurfacePaths => ({ surfaceId: other.id, surfaceSlug: other.slug, paths: surfacePaths(other, other.locales.map(locale => locale.code)) })),
    pending: pending.flatMap(row => row.pendingEditToken === null ? [] : [{ id: row.id, token: row.pendingEditToken, keyId: row.keyId, key: row.stringKey.key, value: row.value, needsReview: row.needsReview }]),
    baselines,
    restoreConfirmation: restore.confirmation,
    /** 그 언어의 값 있는 번역 수(활성 키) — 미리보기 수이자 ADD 효과가 현재 목록에 있는지의 판정이다. */
    valueCount: counts.get(surfaceId)?.get(code) ?? 0,
    delivery: confirmation === null ? null : { revision: confirmation.revision, invalidated: confirmation.invalidatedAt !== null },
    // ⚠️ **저장된 목록 그대로다** — 작업 수·만료의 `deliveredForRequests`(확인 뒤 요청의 옛 효과를 가림)를 쓰지 않는다(F1 fix2 — R-F1 Y1).
    // 여기서 답하는 것은 취소의 결과("열린 PR에 그 효과가 남았나")이고, 취소 뒤에는 행이 없어 작업 판정도 저장 목록으로 돌아간다. 좁힌 목록으로
    // 답하면 확인 뒤 재요청을 다시 취소했을 때 `delivered: false`라 말하는데 작업은 1이고 열린 PR에는 옛 삭제가 남는다. 새 요청은 `hasDelivered`가 가른다.
    delivered: deliveredOf(confirmation),
    unsettled: await publishUnsettled(db, projectId),
  };
}

type ChangeState = Awaited<ReturnType<typeof readChangeState>>;

/**
 * 다른 소스가 쥔 파일 경로 — 템플릿에 활성 로케일을 넣는다. `{locale}`이 없으면(공유 파일) 템플릿이 곧 경로다. 기준 언어 파일이 템플릿 밖이면
 * 그 경로(basePath)를 쥔다 — 빠지면 다중 소스 겹침을 놓친다(mobile-strings design §2).
 */
export function surfacePaths(surface: { pathTemplate: string | null; basePath: string | null; baseLocale: string | null }, codes: readonly string[]): string[] {
  const { pathTemplate, basePath, baseLocale } = surface;
  if (pathTemplate === null) return [];
  if (!pathTemplate.includes("{locale}")) return [pathTemplate];
  return [...new Set(codes.map(code => code === baseLocale ? baseFilePath({ pathTemplate, basePath }, code) : pathTemplate.replaceAll("{locale}", code)))];
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
    surface: { adapterName: state.surface.adapterName, pathTemplate: state.surface.pathTemplate, baseLocale: state.surface.baseLocale, declaredBaseLocale: state.surface.declaredBaseLocale, basePath: state.surface.basePath },
    delivery: state.delivery,
    pending: state.pending.map(cell => ({ id: cell.id, token: cell.token })),
  });
}

type DiscardWrite = { keyId: string; key: string; before: string; value: string; token: string };
type Judgement = { ok: true; transition: LocaleTransition; discard: DiscardWrite[] } | { ok: false; error: LocaleChangeError };

/**
 * 판정 = 전이(`planLocaleChange`) + 폐기 계획. 미리보기와 실행이 같은 함수를 지난다 — 미리보기가 통과한 것을 실행이 다른 이유로 거부하는 일은
 * 그 사이 상태가 바뀐 경우뿐이다.
 */
function judge(state: ChangeState, request: LocaleChangeRequest, approval: ApprovalState): Judgement {
  if (state.surface === null) return { ok: false, error: "not-found" };
  const { surface } = state;
  const row = state.changes.find(change => change.localeCode === request.code);
  const cancel = (request.kind === "remove" && row?.operation === "ADD") || (request.kind === "cancel-removal" && row?.operation === "REMOVE");
  const inCurrent = row?.operation === "REMOVE" || (row?.operation === "ADD" && state.valueCount > 0);
  const verdict = planLocaleChange({
    request,
    projectArchived: state.project === null || state.project.archivedAt !== null,
    // ⚠️ **확인이 무효화된 동안(`delivered: null`)은 효과가 현재 목록에 있는 취소를 막는다** (design §3, R-B1 🔴 R1). 무효화는 시간으로 풀리지 않고
    // 다음 성공 확인만 푼다 — 그 사이 취소를 받으면 작업이 0으로 접혀 Publish가 돌지 않고 열린 PR의 stale 파일이 남는다. 행이 남아 있으면 작업이
    // 1 이상이라 Publish가 확인을 다시 세우고, 그 뒤 취소는 정상 경로다. 새 요청은 작업을 늘리는 쪽이고 값 0개 ADD는 보낸 파일이 없다.
    publishUnsettled: state.unsettled || (cancel && inCurrent && state.delivered === null),
    // ⚠️ 선언된 기준 언어도 제거할 수 없다 — 다음 적재가 그 언어를 기준으로 세우는데 Publish가 그 파일을 지우면 기준 파일이 사라진다.
    surface: { id: state.surfaceId, adapterName: surface.adapterName, pathTemplate: surface.pathTemplate,
      baseLocale: request.kind === "remove" && surface.declaredBaseLocale === request.code ? request.code : surface.baseLocale },
    locales: state.locales,
    changes: state.changes,
    otherSurfaces: state.otherSurfaces,
    approval,
  });
  if (!verdict.ok) return verdict;
  // 되돌리는 폐기는 제거에만 건다 — 추가 취소는 토큰만 비우고 값을 남긴다(아래 `clearApprovedTokens`, design §3 2026-10-14 정정).
  if (verdict.transition.kind !== "request-removal") return { ok: true, transition: verdict.transition, discard: [] };
  // 폐기 = Revert라 적재 lease 판정도 같다(`planWriteLock` — R-B1b Z2). 잠금 뒤 읽은 lease다.
  if (state.project !== null && planWriteLock({ now: new Date(), ...state.project }) !== null) return { ok: false, error: "sync-running" };
  const discard = planDiscard(state);
  return discard.ok ? { ok: true, transition: verdict.transition, discard: discard.writes } : discard;
}

/**
 * **제거의 폐기 = Revert** (design §3 "폐기는 값을 마지막 전달 값으로 되돌린다", R-B1 Y1). 토큰만 비우면 값이 DB에 남아 제거를 취소한 뒤 다음 Publish에
 * 추적 없이 실린다. 판정은 Revert의 `planKeyRevert` 그대로다 — 기준이 없거나(`baseline-unknown`) 낡았거나(`baseline-stale`) 확인이 교체 실행 뒤에 서지
 * 않았으면 쓰기 0으로 거부한다(fail-closed — 먼저 Publish 또는 Revert). 부분 폐기는 없다.
 */
function planDiscard(state: ChangeState): { ok: true; writes: DiscardWrite[] } | { ok: false; error: LocaleChangeError } {
  if (state.pending.length === 0) return { ok: true, writes: [] };
  const cells = new Map(state.pending.map(cell => [cell.keyId, cell]));
  const plan = planKeyRevert({
    // ⚠️ `planKeyRevert`는 키 하나의 언어들을 받는다 — 여기는 한 언어의 키들이라 식별자 자리(`localeCode`)에 keyId를 싣는다. 판정은 식별자를 비교만 한다.
    targets: state.pending.map(cell => ({ localeCode: cell.keyId, token: cell.token, currentValue: cell.value, needsReview: cell.needsReview })),
    baselines: new Map(state.baselines.map(baseline => [baseline.keyId, { restoreValue: baseline.restoreValue, revision: baseline.revision }])),
    confirmation: state.restoreConfirmation,
    canRevert: true,
    draftDirty: false,
    // 진행 중 Publish는 앞의 `publish-unsettled`가 막았다.
    busy: false,
  });
  if (!plan.ok) return { ok: false, error: plan.reason === "baseline-stale" ? "baseline-stale" : plan.reason === "unsettled" ? "publish-unsettled" : "baseline-unknown" };
  return {
    ok: true,
    writes: plan.writes.flatMap(write => {
      const cell = cells.get(write.localeCode);
      return cell === undefined ? [] : [{ keyId: cell.keyId, key: cell.key, before: cell.value, value: write.value, token: write.expectedToken }];
    }),
  };
}

function approvalState(approved: string | null, current: string | null): ApprovalState {
  if (approved === null) return "missing";
  return current !== null && sameFingerprint(approved, current) ? "valid" : "stale";
}

/**
 * 그 언어의 효과가 저장된 전달 목록에 있나 — 취소(`cancel-removal`·`cancel-add`)의 답이다. 확인이 무효화 중이면 `null` — "전달 안 됨"으로 말하지 않는다.
 * ⚠️ 행이 없으면(새 제거 요청의 미리보기) `false`다 — 아직 내지 않은 요청은 어느 확인보다도 뒤다. 남은 옛 목록(전달 후 취소)과 견주면 PR이 이미
 * 닫혔어도 "보냈다"고 말한다(F1 fix1).
 */
function hasDelivered(state: ChangeState, code: string, effect: "create" | "delete"): boolean | null {
  if (state.delivered === null) return null;
  if (!state.changes.some(change => change.localeCode === code)) return false;
  return state.delivered.some(item => item.localeCode === code && item.effect === effect);
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

/**
 * 승인된 그 언어의 미전달 셀을 마지막 전달 값으로 되돌린다 — Revert의 쓰기와 같다(값 · 토큰 해제 · 저자는 되돌린 사람 · 기준 행 삭제 · `translation.reverted`).
 * 잠금 뒤 다시 읽어 지문으로 대조한 집합이고, 토큰이 그대로인 셀만 쓴다 — 어긋나면 던져서 전부 롤백한다. 다른 언어·다른 소스는 대상이 아니다.
 * ⚠️ 한 문장이다 — 한 언어의 미전달이 수백 셀일 수 있어 셀마다 왕복하면 잠금 tx가 길어진다(#145).
 */
/**
 * **추가 취소의 폐기** — 승인된 그 언어의 토큰만 비우고 값은 남긴다. 언어가 orphan으로 돌아가 렌더에서 빠지므로 값이 새지 않고, 재추가가 값 있는 셀에
 * 토큰을 다시 발급해 되살린다(design §3 2026-10-14 정정). 그래서 복원 기준을 요구하지 않는다 — 첫 확인 전 소스에서도 취소할 수 있다.
 * ⚠️ raw SQL이다 — 값이 안 바뀌었으니 `@updatedAt`을 올리지 않는다(`releaseOrphanedApproved`와 같은 이유). 기준 행은 건드리지 않는다.
 */
async function clearApprovedTokens(tx: Prisma.TransactionClient, scope: Scope, code: string, tokens: readonly string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  return tx.$executeRaw`
    UPDATE "Translation" SET "pendingEditToken" = NULL
    WHERE "projectId" = ${scope.projectId} AND "surfaceId" = ${scope.surfaceId} AND "localeCode" = ${code}
      AND "pendingEditToken" = ANY(${[...tokens]}::text[])`;
}

async function discardApproved(tx: Prisma.TransactionClient, input: { scope: Scope; code: string; userId: string; surfaceSlug: string; writes: readonly DiscardWrite[] }): Promise<number> {
  const { scope, code, writes } = input;
  if (writes.length === 0) return 0;
  const updated = await tx.$executeRaw`
    UPDATE "Translation" AS t SET "value" = v."value", "pendingEditToken" = NULL, "updatedBy" = ${input.userId}, "updatedAt" = CURRENT_TIMESTAMP
    FROM unnest(${writes.map(write => write.keyId)}::text[], ${writes.map(write => write.value)}::text[], ${writes.map(write => write.token)}::text[]) AS v("keyId", "value", "token")
    WHERE t."projectId" = ${scope.projectId} AND t."surfaceId" = ${scope.surfaceId} AND t."localeCode" = ${code}
      AND t."keyId" = v."keyId" AND t."pendingEditToken" = v."token"`;
  if (updated !== writes.length) throw new Error("discard target changed under lock");
  // 전달 기준은 미전달 셀의 작업 상태다 — 되돌린 셀은 더 이상 미전달이 아니다.
  await tx.translationBaseline.deleteMany({ where: { projectId: scope.projectId, surfaceId: scope.surfaceId, localeCode: code, keyId: { in: writes.map(write => write.keyId) } } });
  await recordEvents(tx, writes.map(write => ({
    projectId: scope.projectId,
    subtype: "translation.reverted",
    actor: { kind: "USER" as const, userId: input.userId },
    surfaceIds: [scope.surfaceId],
    payload: { kind: "TRANSLATION" as const, surfaceSlug: input.surfaceSlug, key: write.key, locale: code, before: write.before, after: write.value },
  })));
  return writes.length;
}

/**
 * 되살림이 새 편집 토큰을 줄 셀 — 그 소스·언어의 값 있는 활성 키(`t`·`k` 별칭). 미리보기의 수(`revive`)와 실행의 쓰기(`reissued`)가 이 술어 하나를
 * 지난다 — 사본 둘이면 Dialog가 말한 수와 실제로 되살린 수가 갈린다.
 */
function reviveCellsWhere(scope: Scope, code: string): Prisma.Sql {
  return Prisma.sql`t."projectId" = ${scope.projectId} AND t."surfaceId" = ${scope.surfaceId} AND t."localeCode" = ${code} AND t."value" <> ''
    AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId" AND NOT k."orphaned"`;
}

type AddJudgement = { ok: true; action: "create" | "revive"; path: string; surfaceSlug: string } | { ok: false; error: LocaleChangeError };

/** 추가 판정 — 실행(잠금 뒤)과 미리보기(스냅샷)가 같은 읽기·같은 `judge`를 지난다(POSTMORTEM 2026-09-16 — 미리보기 경로 = 실행 경로). */
async function judgeAdd(tx: Prisma.TransactionClient, scope: Scope, code: string): Promise<AddJudgement> {
  const state = await readChangeState(tx, scope, code);
  const verdict = judge(state, { kind: "add", code }, "missing");
  if (!verdict.ok) return verdict;
  if (verdict.transition.kind !== "add" || state.surface === null) return { ok: false, error: "not-found" };
  return { ok: true, action: verdict.transition.action, path: verdict.transition.path, surfaceSlug: state.surface.slug };
}

export async function addLocale(prisma: PrismaClient, subject: Subject, input: z.infer<typeof AddLocaleInput>): Promise<AddLocaleResult> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const scope = { projectId: access.projectId, surfaceId: access.surfaceId };
  const code = input.localeCode;

  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId: scope.projectId, userId: subject.userId, permission: "project:settings", surfaceId: scope.surfaceId, credential: subject.credential });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const verdict = await judgeAdd(tx, scope, code);
    if (!verdict.ok) return verdict;
    const { action, path } = verdict;
    if (action === "create") {
      await tx.locale.create({ data: { projectId: scope.projectId, surfaceId: scope.surfaceId, code, name: code, isBase: false } });
    } else {
      await tx.locale.update({ where: { projectId_surfaceId_code: { projectId: scope.projectId, surfaceId: scope.surfaceId, code } }, data: { orphaned: false, isBase: false } });
    }
    // 되살림 — 값 있는 활성 셀에 새 편집 토큰. 값·저자는 그대로이고 복원 기준(`TranslationBaseline`)은 만들지 않는다(design §4).
    const reissued = action === "create" ? 0 : await tx.$executeRaw`
      UPDATE "Translation" AS t SET "pendingEditToken" = gen_random_uuid()::text
      FROM "StringKey" k
      WHERE ${reviveCellsWhere(scope, code)}`;
    await tx.localeChange.create({ data: { projectId: scope.projectId, surfaceId: scope.surfaceId, localeCode: code, operation: "ADD" } });
    await recordLocaleEvent(tx, { scope, userId: subject.userId, surfaceSlug: verdict.surfaceSlug, subtype: "surface.localeAdded",
      detail: { locale: code, operation: "ADD", revived: action === "revive", discarded: null, outcome: null, reissued: action === "revive" ? reissued : null, pullRequest: null, via: null } });
    return { ok: true, action, path, reissued } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}

/**
 * 추가 Dialog가 열릴 때 — **읽기만 한다.** 인가는 실행과 같은 `getSurfaceAccess(project:settings)`이고 판정은 `judgeAdd` 그대로다. 실행처럼 잠그지 않고
 * 한 스냅샷(RepeatableRead)에서 읽는다 — 판정 입력과 되살릴 수를 다른 순간에 읽으면 둘이 어느 상태도 가리키지 않는다.
 * ⚠️ 승인 지문이 없다 — 추가는 버리는 것이 없어 실행이 승인을 요구하지 않는다. 그 사이 상태가 바뀌면 실행이 잠금 뒤 다시 판정한다.
 */
export async function previewLocaleAdd(prisma: PrismaClient, subject: Subject, input: z.infer<typeof PreviewLocaleAddInput>): Promise<LocaleAddPreview> {
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug: input.slug, surfaceSlug: input.surfaceSlug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const scope = { projectId: access.projectId, surfaceId: access.surfaceId };
  const code = input.localeCode;
  return prisma.$transaction(async (tx) => {
    const verdict = await judgeAdd(tx, scope, code);
    if (!verdict.ok) return verdict;
    if (verdict.action === "create") return { ok: true, action: verdict.action, path: verdict.path, revive: 0 } as const;
    const [row] = await tx.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS "count" FROM "Translation" AS t, "StringKey" AS k WHERE ${reviveCellsWhere(scope, code)}`;
    return { ok: true, action: verdict.action, path: verdict.path, revive: row?.count ?? 0 } as const;
  }, { isolationLevel: "RepeatableRead" });
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
    return {
      ok: true,
      kind: transition.kind,
      path: transition.path,
      translations: state.valueCount,
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
    const discarded = transition.kind === "request-removal"
      ? await discardApproved(tx, { scope, code, userId: subject.userId, surfaceSlug: state.surface.slug, writes: verdict.discard })
      : await clearApprovedTokens(tx, scope, code, state.pending.map(cell => cell.token));
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
      detail: { locale: code, operation: transition.kind === "request-removal" ? "REMOVE" : "ADD", revived: null, discarded, outcome: null, reissued: null, pullRequest: null, via: null },
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
      detail: { locale: code, operation: "REMOVE", revived: null, discarded: null, outcome: null, reissued: null, pullRequest: null, via: null } });
    return { ok: true, delivered: hasDelivered(state, code, "delete") } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}
