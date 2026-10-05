import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor, isAdapterName } from "@/lib/adapters";
import { lockCredential } from "@/lib/auth/lock";
import type { Credential } from "@/lib/auth/subject";
import { templatePaths } from "@/lib/onboarding/confirm";
import { prepareFirstSnapshot, type FirstSnapshotInput } from "@/lib/onboarding/ingest";
import { runTokenFor } from "@/lib/events/payload";
import { recordEvent, recordRun } from "@/lib/events/record";
import { applyPushInTransaction } from "@/lib/push/apply";
import { releaseOrphanedApproved } from "@/lib/protection/release-orphaned";
import { resolveLocalePaths } from "@/lib/pull/plan";
import { planSurfaceSlug, surfaceOwnership } from "./plan";
import { planSurfaceRevival } from "./plan-revival";

export type AddSurfaceErrorCode = "not-found" | "forbidden" | "archived" | "repo-replaced" | "path-conflict" | "ingest-failed"
  /** MCP 토큰 주체만 — 잠금 뒤 다시 읽은 토큰이 무효이거나 grant가 없다(`lockCredential`). */
  | "unauthorized" | "token-scope";
export class SurfaceCreationError extends Error {
  constructor(readonly code: AddSurfaceErrorCode, readonly conflicts: { path: string; surfaceSlugs: string[] }[] = []) {
    super(code);
  }
}

export type AddSurfaceSnapshot = Omit<FirstSnapshotInput, "surfaceId" | "surfaceSlug" | "startedAt" | "token" | "projectSlug"> & {
  userId: string;
  repository: { repositoryId: string; installationId: string; repoOwner: string; repoName: string; baseBranch: string };
};

/** GitHub I/O는 호출부가 끝낸다. 잠금 후 재조회한 경계와 첫 적재만 원자적으로 확정한다. */
/** 모든 파싱을 잠금 전에 끝내고 검증된 payload만 같은 tx로 쓴다. */
export async function addSurfacesFromSnapshot(prisma: PrismaClient, input: { projectSlug: string; inputs: readonly AddSurfaceSnapshot[]; credential: Credential | undefined }) {
  const first = input.inputs[0];
  if (!first || input.inputs.some(item => item.projectId !== first.projectId || item.userId !== first.userId)) throw new SurfaceCreationError("ingest-failed");
  if (new Set(input.inputs.map(item => item.format.pathTemplate)).size !== input.inputs.length) throw new SurfaceCreationError("path-conflict");
  const prepared = input.inputs.map(item => {
    const surfaceId = randomUUID(), token = randomUUID(), startedAt = new Date();
    const result = prepareFirstSnapshot({ ...item, surfaceId, surfaceSlug: "pending", projectSlug: input.projectSlug, token, startedAt });
    if (result.payload === null) throw new SurfaceCreationError("ingest-failed");
    return { item, surfaceId, token, startedAt, payload: result.payload, result: result.result };
  });
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${first.projectId} FOR UPDATE`;
    // MCP 토큰은 잠금 직후 다시 읽는다(mcp-connector design §1.25) — grant 거부는 역할·보관 판정 뒤다.
    const token = await lockCredential(tx, { credential: input.credential, userId: first.userId, projectId: first.projectId, grant: "project:settings" });
    if (token.status !== "ok") throw new SurfaceCreationError(token.status);
    const project = await tx.project.findUnique({ where: { id: first.projectId } });
    if (!project) throw new SurfaceCreationError("not-found");
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: first.projectId, userId: first.userId } } });
    if (member?.role !== "OWNER") throw new SurfaceCreationError("forbidden");
    if (project.archivedAt !== null) throw new SurfaceCreationError("archived");
    // grant는 멤버십·역할·보관 뒤다(`planToolAccess`와 같은 순서).
    if (token.grant === "token-scope") throw new SurfaceCreationError("token-scope");
    for (const { repository: expected } of input.inputs) {
      if (project.repositoryId !== expected.repositoryId || project.installationId !== expected.installationId || project.repoOwner !== expected.repoOwner || project.repoName !== expected.repoName || project.baseBranch !== expected.baseBranch) throw new SurfaceCreationError("repo-replaced");
    }
    const surfaces = await tx.translationSurface.findMany({ where: { projectId: first.projectId }, include: { locales: { where: { orphaned: false } } } });
    const slugs = surfaces.map(surface => surface.slug);
    const owners = surfaces.filter(surface => surface.archivedAt === null).map(surface => {
      if (!surface.adapterName || !isAdapterName(surface.adapterName) || !surface.pathTemplate) throw new SurfaceCreationError("ingest-failed");
      const format = { adapter: surface.adapterName, pathTemplate: surface.pathTemplate, locales: surface.locales.map(locale => locale.code) };
      const layout = adapterFor(format).layout;
      const saved = layout === "per-locale" ? resolveLocalePaths(format, layout, first.paths).map(path => path.path) : [];
      return { surfaceId: surface.id, surfaceSlug: surface.slug, paths: [...saved, ...templatePaths(surface.adapterName, surface.pathTemplate, first.paths)] };
    });
    /**
     * ⚠️ **제거된 소스의 재추가는 그 행을 되살린다** (sources-add-remove — ARCHITECTURE §5.9). 되살릴 행의 id가 `prepared`의 난수 id를
     * **대신한다** — 그 id가 owners·사건·적재·실행 기록으로 그대로 흐르므로 여기 한 곳에서 바꾼다. slug 계획은 새 행에만 돈다.
     */
    const revivals = planSurfaceRevival(prepared.map(value => ({ pathTemplate: value.item.format.pathTemplate, adapter: value.item.format.adapter })), surfaces);
    const additions = prepared.map((value, index) => {
      const revival = revivals[index];
      const revive = revival?.kind === "revive" ? revival : null;
      const surfaceId = revive?.surfaceId ?? value.surfaceId;
      const slug = revive?.slug ?? planSurfaceSlug(value.item.format.pathTemplate, slugs);
      if (revive === null) slugs.push(slug);
      owners.push({ surfaceId, surfaceSlug: slug, paths: [...value.item.targets, ...resolveLocalePaths(value.item.format, adapterFor(value.item.format).layout, value.item.paths).map(path => path.path)] });
      return { ...value, surfaceId, slug, revived: revive !== null };
    });
    const ownership = surfaceOwnership(owners);
    if (!ownership.ok) throw new SurfaceCreationError("path-conflict", ownership.conflicts);
    const results = [];
    let changedValues = 0;
    for (const { item, surfaceId, slug, revived, token, startedAt, payload, result } of additions) {
      let approvedTokens: string[] = [];
      if (revived) {
        /**
         * ⚠️ **커밋 기준·실패 표시를 비운다** — 옛 `lastCommitAt`이 남으면 지금 head가 그보다 옛 커밋일 때 첫 적재가 `stale-commit`으로
         * 막히고, 옛 실패가 되살린 소스의 상태로 선다. 첫 적재 의미는 `previousBaseLocale: null`이 든다(아래).
         */
        await tx.translationSurface.update({
          where: { id: surfaceId, projectId: first.projectId },
          data: {
            archivedAt: null, adapterName: item.format.adapter, pathTemplate: item.format.pathTemplate, baseLocale: item.baseLocale, declaredBaseLocale: null,
            lastCommitSha: null, lastCommitAt: null, lastImportError: null, lastImportFailedAt: null, lastImportStartedAt: startedAt, lastImportToken: token,
          },
        });
        /**
         * ⚠️ **그 소스의 미전달 토큰 전부를 승인한다 — orphaned 포함** (편집을 버리는 셋째 길, ARCHITECTURE §0). 사람의 승인은 제거 때
         * 그 소스에만 묶인 지문으로 받았다. 같은 장치(`approvedTokens`)라 리포에 값이 없는 칸은 덮이지 않고 미전달로 남는다.
         */
        const pending = await tx.translation.findMany({ where: { projectId: first.projectId, surfaceId, pendingEditToken: { not: null } }, select: { pendingEditToken: true } });
        approvedTokens = pending.flatMap(row => row.pendingEditToken === null ? [] : [row.pendingEditToken]);
      } else {
        await tx.translationSurface.create({ data: { id: surfaceId, projectId: first.projectId, slug, adapterName: item.format.adapter, pathTemplate: item.format.pathTemplate, baseLocale: item.baseLocale, lastImportStartedAt: startedAt, lastImportToken: token } });
      }
      /**
       * ⚠️ **소스당 하나다** (결정 13) — 생성 때 붙은 소스와 나중에 추가한 소스가 **같은 모양**으로
       * 남아야 소스 필터가 둘을 같이 다룬다.
       */
      await recordEvent(tx, {
        projectId: first.projectId,
        subtype: "surface.added",
        actor: { kind: "USER", userId: first.userId },
        surfaceIds: [surfaceId],
        payload: { kind: "SURFACE", surfaceSlug: slug, adapter: item.format.adapter, baseLocale: { before: null, after: item.baseLocale } },
      });
      const applied = await applyPushInTransaction(tx, { projectId: first.projectId, surfaceId }, { ...payload, surfaceSlug: slug }, {
        refsMode: "replace", previousBaseLocale: null, startedAt, token, importOutcome: result.failed === 0 ? null : "partial-import", approvedTokens,
        // 다운로드·파싱 실패가 있으면 빠진 파일의 옛 키를 삭제로 읽지 않는다(audit #7) — 되살린 행에만 옛 키가 있다. 아래 해제와 짝이다.
        suppressOrphan: result.errors.length > 0,
      });
      /**
       * ⚠️ **이번 적재로 orphan인 승인 셀의 토큰을 푼다** — 수동 Sync와 같은 장치(delivery-invariants D1). 제거된 동안 리포가 키를 지웠으면
       * 그 셀은 덮일 자리가 없어 토큰이 남고, 화면엔 0인데 그 키를 되살린 CI가 매번 `deferred`다(리뷰 B1 🔴1).
       */
      await releaseOrphanedApproved(tx, { projectId: first.projectId, surfaceId }, approvedTokens);
      changedValues += applied.changedValues;
      results.push({ pathTemplate: item.format.pathTemplate, surfaceSlug: slug, count: result.count, failed: result.failed });
    }

    /**
     * 최초 적재 실행 **하나** — 소스별로 행을 복제하지 않고 대상 집합과 소스별 결과를 싣는다
     * (결정 14 · T5f). 실행 식별자는 첫 표면의 lease 토큰이다.
     */
    const runner = additions[0];
    if (runner !== undefined) {
      const failed = additions.filter(value => value.result.failed > 0).length;
      await recordRun(tx, {
        projectId: first.projectId,
        subtype: "import.first",
        actor: { kind: "USER", userId: first.userId },
        surfaceIds: additions.map(value => value.surfaceId),
        // 전부 성공이면 `Imported`, 하나라도 부분 실패면 `Partially completed`다 — 숨기지 않는다(불변식 9).
        result: failed === 0 ? "imported" : "partial",
        occurredAt: runner.startedAt,
        finishedAt: new Date(),
        runToken: runTokenFor({ kind: "import", token: runner.token }),
        payload: {
          kind: "IMPORT", source: "first",
          surfaceSlugs: additions.map(value => value.slug),
          keys: additions.reduce((sum, value) => sum + value.result.count, 0),
          pendingEdits: null,
          surfaces: additions.map(value => ({
            surfaceSlug: value.slug,
            status: value.result.failed === 0 ? ("imported" as const) : ("partial" as const),
            count: value.result.count,
            reason: null,
          })),
          errorCode: null, refusal: null, deferReason: null, changedValues,
        },
      });
    }
    return results;
  }, { maxWait: 10_000, timeout: 30_000 });
}
