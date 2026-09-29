import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { recordImportRefusal } from "@/lib/events/record";
import { openRepoReader } from "@/lib/github";
import { logFailure } from "@/lib/github-connect/log";
import type { RepositoryImportError, RepositoryImportOutcome } from "@/lib/import/result";
import { runRepositoryImportFromReader } from "@/lib/import/run";
import { planProjectReadiness } from "@/lib/onboarding/readiness";

import { checkRepoAccess } from "./access";

/**
 * ⚠️ **`approval`은 불투명 지문 하나다** — 호출자는 `prepareSync`가 준 값을 되돌려 줄 뿐이고, 서버가 잠금 뒤 재계산해 대조한다
 * (`lib/import/run.ts`). boolean 동의(`discard: true`)를 받지 않는다 — 그 뒤의 모든 편집을 버리는 포괄 권한이 된다.
 */
export const RepositoryImportInput = z.object({ slug: z.string().min(1), approval: z.string().max(128).nullable() });

/**
 * **수동 Sync의 공유 코어** (mcp-connector T4-c) — 편집 UI와 MCP `sync_repository`. 리포 접근 확인(읽기만 — 쓰기 권한 없이 초대된 OWNER도
 * 통과)·실행 준비를 조립하고 실행은 `runRepositoryImportFromReader`가 든다(실행권 tx에서 토큰 재읽기).
 * `attempted`가 재검증 신호다 — 인가를 지나 실행에 들어갔으면 거부·실패라도 목록 상태가 바뀌었을 수 있다.
 */
export async function importRepository(
  prisma: PrismaClient, subject: Subject, input: z.infer<typeof RepositoryImportInput>,
): Promise<{ outcome: RepositoryImportOutcome; attempted: boolean }> {
  const { userId } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return { outcome: { ok: false, error: access.status }, attempted: false };
  return { outcome: await runAuthorized(prisma, subject, access.projectId, input.approval), attempted: true };
}

/** 인가를 지난 뒤 — 여기서 나는 거부는 이력에 남는다(`refuse`). 던지지 않는다: 호출자가 직렬화 경계다. */
async function runAuthorized(prisma: PrismaClient, subject: Subject, projectId: string, approval: string | null): Promise<RepositoryImportOutcome> {
  const { userId } = subject;
  const refuse = async (error: RepositoryImportError): Promise<RepositoryImportOutcome> => {
    try { await recordImportRefusal(prisma, { projectId, userId, error }); }
    catch (recordError) { logFailure("repository-import-event", recordError); }
    return { ok: false, error };
  };
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { surfaces: true } });
    if (project === null) return { ok: false, error: "not-found" };
    if (project.archivedAt !== null) return await refuse("archived");
    if (planProjectReadiness(project) !== "ready") return await refuse("not-ready");
    if (project.installationId === null || project.repositoryId === null) return { ok: false, error: "not-connected" };
    // 재적재는 리포를 읽기만 한다 — 쓰기 권한 없이 초대된 OWNER도 여기선 통과한다 (sec-audit-3 1a 범위 밖).
    const connected = await checkRepoAccess(prisma, userId, project.repoOwner, project.repoName, false);
    if (connected.status !== "ok") return await refuse(connected.error);
    if (connected.repositoryId !== project.repositoryId || connected.installationId !== project.installationId) return await refuse("repo-replaced");
    const { installationId, repositoryId } = project;
    return await runRepositoryImportFromReader(prisma, { projectId, userId, approval, credential: subject.credential,
      repository: { repositoryId, installationId, repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch },
    }, () => openRepoReader(project.repoOwner, project.repoName, installationId, repositoryId));
  } catch (error) {
    logFailure("repository-import-action", error);
    return { ok: false, error: "ingest-failed" };
  }
}
