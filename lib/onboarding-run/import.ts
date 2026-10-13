import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { recordImportRefusal } from "@/lib/events/record";
import { openRepoReader } from "@/lib/repo-host";
import type { RepoReader } from "@/lib/repo-host/reader";
import { repoLocatorOf, repoTargetOf, sameAccessedRepository } from "@/lib/repo-host/target";
import { logFailure } from "@/lib/github-connect/log";
import type { RepositoryImportError, RepositoryImportOutcome } from "@/lib/import/result";
import { runRepositoryImportFromReader } from "@/lib/import/run";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { forgetOpenPr } from "@/lib/projects/open-pr-memo";
import { classifySyncError } from "@/lib/sync/plan";

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
  // ⚠️ **Home의 열린 PR 메모를 지운다** (U15) — 리포에서 PR을 머지한 사람이 다음에 누르는 버튼이 이것이라, 그 뒤 Home이 TTL 동안
  // 옛 "PR 열림"을 말하지 않게 한다. 거부·실패에도 지운다 — 사람이 다시 확인하러 온 순간이다.
  try {
    return { outcome: await runAuthorized(prisma, subject, access.projectId, input.approval), attempted: true };
  } finally {
    forgetOpenPr(input.slug);
  }
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
    // ⚠️ **`not-connected`가 아니다** (ux-drift-unify r1) — 그 코드는 아래 `checkRepoAccess`가 "계정이 연결되지 않았다"로 낸다. 설치 없음은 readiness가 먼저 걸렀다.
    const connection = repoTargetOf(project);
    // GitLab의 연결 없음은 연결자가 떠난 것이다 — 설정에서 재연결한다(GitHub `unpinned`의 짝).
    if (connection.status !== "ok") return { ok: false, error: project.repoHost === "gitlab" ? "gitlab-project-disconnected" : "unpinned" };
    // 재적재는 리포를 읽기만 한다 — 쓰기 권한 없이 초대된 OWNER도 여기선 통과한다 (sec-audit-3 1a 범위 밖).
    const connected = await checkRepoAccess(prisma, userId, repoLocatorOf(project), { requirePush: false });
    if (connected.status !== "ok") return await refuse(connected.error);
    if (!sameAccessedRepository(connected, connection.target)) return await refuse("repo-replaced");
    // 호출자 접근을 확인한 뒤에도 리더는 **프로젝트 쪽 연결**로 연다. 잠금 안 재검증이 이 대상과 저장된 열을 다시 대조한다.
    const target = connection.target;
    let openReader = () => openRepoReader(target);
    if (target.host === "gitlab") {
      /*
        ⚠️ **GitLab 리더는 실행권 전에 연다** (감사 E4 · 결정 R6) — 위 호출자 확인은 호출자 PAT라 토큰 주인 쪽(저장 만료·철회·보관)을 못 본다. 실행권을
        얻은 뒤 리더 열기에서 드러나면 모든 소스가 실패 상태(`ingest-failed`)로 남았다 — 재연결이 고치는 것(`not-installed`)은 거부로 돌린다.
        건강성 판정(`loadConnectionHealth`)을 쓰지 않는다: 그것은 주인의 push 권한까지 보지만 Sync는 읽기라 Reporter 주인에서도 돈다(#123).
        일시 장애는 거부로 접지 않고 실행이 지금처럼 실패로 기록한다. 연 리더는 실행이 그대로 쓴다(원격 왕복을 한 번 더 하지 않는다).
      */
      const opened = await openRepoReader(target).then(
        (reader): { ok: true; reader: RepoReader } => ({ ok: true, reader }),
        (error: unknown): { ok: false; error: unknown } => ({ ok: false, error }),
      );
      if (!opened.ok && classifySyncError(opened.error).code === "not-installed") return await refuse("gitlab-project-disconnected");
      openReader = opened.ok ? () => Promise.resolve(opened.reader) : () => Promise.reject(opened.error);
    }
    return await runRepositoryImportFromReader(prisma, { projectId, userId, approval, credential: subject.credential,
      repository: { repoHost: project.repoHost, repositoryId: project.repositoryId, installationId: project.installationId, gitlabConnectionId: project.gitlabConnectionId,
        repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch },
    }, openReader);
  } catch (error) {
    logFailure("repository-import-action", error);
    return { ok: false, error: "ingest-failed" };
  }
}
