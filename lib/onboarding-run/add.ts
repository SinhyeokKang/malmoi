import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { isAdapterName } from "@/lib/adapters";
import type { AccessError } from "@/lib/auth/message";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { openRepoReader } from "@/lib/github";
import { requireEnv } from "@/lib/env";
import { logFailure } from "@/lib/github-connect/log";
import type { ConnectError } from "@/lib/github-connect/message";
import { readFiles, snapshotError } from "@/lib/import/read";
import { isLocaleShaped, isPathSafeLocale } from "@/lib/locale-code";
import { IngestBudgetError } from "@/lib/onboarding/budget";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import type { OnboardError } from "@/lib/onboarding/message";
import { renderSurfaceWorkflowStep, workflowApiUrl } from "@/lib/onboarding/workflow";
import { addSurfacesFromSnapshot, SurfaceCreationError, type AddSurfaceErrorCode, type AddSurfaceSnapshot } from "@/lib/surfaces/create";

import { planSampleConfirmations } from "@/lib/mcp/confirm";

import { checkRepoAccess } from "./access";

export const AddSurfacesInput = z.object({ slug: z.string().min(1).max(40), picks: z.array(z.object({ adapter: z.string(), pathTemplate: z.string().min(1).max(500), baseLocale: z.string().min(1) })).min(1).max(200) });

export type AddSurfacesResult =
  | { ok: true; results: import("@/lib/surfaces/plan-add").SurfaceAdded[]; yaml: string }
  | { ok: false; error: OnboardError | AccessError | AddSurfaceErrorCode | "invalid input" | ConnectError; conflicts?: { path: string; surfaceSlugs: string[] }[]; index?: number };

/**
 * **소스 추가의 공유 코어** (mcp-connector T4-c) — 편집 UI와 MCP `add_sources`. 리포 확인(쓰기 권한 포함)·다운로드·포맷 재검증을
 * 여기서 조립하고, 표면 생성 tx는 `addSurfacesFromSnapshot`이 든다(잠금 뒤 토큰 재읽기 포함). 재검증은 호출자의 몫이다 — 성공이면
 * 커밋된 것이다.
 */
export async function addSources(
  prisma: PrismaClient,
  subject: Subject,
  input: z.infer<typeof AddSurfacesInput>,
  /** MCP `add_sources`만 — `input.picks`와 같은 순서의 샘플 확인값(`createProjectFromRepo`와 같은 계약). 웹은 주지 않는다. */
  options: {
    confirmations?: readonly (string | undefined)[];
    /** 요청이 들어온 앱 origin(검증된 값) — step의 `api-url`을 정한다(`workflowApiUrl`). */
    origin?: string | null;
  } = {},
): Promise<AddSurfacesResult> {
  const { userId } = subject;
  // ⚠️ 비밀값은 아래 try **밖에서** 읽는다 — 안에서 던지면 catch가 `ingest-failed`로 접어 설정 오류가 적재 실패로 둔갑한다(design §2.2).
  const secret = options.confirmations === undefined ? null : requireEnv("APP_SIGNING_SECRET");
  if (new Set(input.picks.map(pick => pick.pathTemplate)).size !== input.picks.length || input.picks.some(pick => !isAdapterName(pick.adapter) || !isPathSafeLocale(pick.baseLocale) || !isLocaleShaped(pick.baseLocale))) return { ok: false, error: "invalid input" };
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const project = await prisma.project.findUnique({ where: { id: access.projectId } });
  if (!project) return { ok: false, error: "not-found" };
  if (project.archivedAt !== null) return { ok: false, error: "archived" };
  const inputs: AddSurfaceSnapshot[] = [];
  let results: import("@/lib/surfaces/plan-add").SurfaceAdded[];
  try {
    const repo = await checkRepoAccess(prisma, userId, project.repoOwner, project.repoName, true);
    if (repo.status !== "ok") return { ok: false, error: repo.error };
    if (repo.repositoryId !== project.repositoryId || repo.installationId !== project.installationId) return { ok: false, error: "repo-replaced" };
    const reader = await openRepoReader(repo.repoOwner, repo.repoName, repo.installationId, repo.repositoryId);
    const snapshot = await reader.snapshot(project.baseBranch);
    if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };
    if (options.confirmations !== undefined && secret !== null) {
      // 같은 스냅샷의 head로 대조한다 — 아래 다운로드는 이 트리의 blob sha로만 읽는다.
      const verdict = planSampleConfirmations({
        candidates: input.picks.map((pick, index) => ({ ...pick, confirmation: options.confirmations?.[index] })),
        context: { userId, repositoryId: repo.repositoryId, installationId: repo.installationId, ref: project.baseBranch, headSha: snapshot.headSha },
        secret,
        now: new Date(),
      });
      // `index`는 어느 후보가 실패했는지다 — 에이전트가 그 후보만 다시 탐지한다.
      if (verdict.status !== "ok") return { ok: false, error: verdict.status === "invalid-input" ? "invalid input" : verdict.status, index: verdict.index };
    }
    const paths = snapshot.files.map(file => file.path);
    const selected = input.picks.map(pick => {
      if (!isAdapterName(pick.adapter)) throw new SurfaceCreationError("ingest-failed");
      return { pick: { ...pick, adapter: pick.adapter }, targets: templatePaths(pick.adapter, pick.pathTemplate, paths) };
    });
    // 합집합을 한 번 내려받아 요청 전체 예산을 적용한다. 표면별 다운로드는 상한을 N배로 넓힌다.
    const files = await readFiles(reader, snapshot, [...new Set(selected.flatMap(item => item.targets))]);
    for (const { pick, targets } of selected) {
      const relevant = files.filter(file => targets.includes(file.path));
      const confirmed = planConfirmedFormat(pick, relevant);
      if (confirmed.status !== "ok") return { ok: false, error: relevant.length < targets.length ? "unavailable" : "manual-no-match" };
      inputs.push({ projectId: access.projectId, userId,
        repository: { repositoryId: repo.repositoryId, installationId: repo.installationId, repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch },
        format: confirmed.format, baseLocale: confirmed.baseLocale, paths, targets, blobs: new Map(relevant.map(file => [file.path, file.content])), headSha: snapshot.headSha, headCommittedAt: snapshot.headCommittedAt });
    }
    results = await addSurfacesFromSnapshot(prisma, { projectSlug: input.slug, inputs, credential: subject.credential });
  } catch (error) {
    if (error instanceof IngestBudgetError) return { ok: false, error: "resource-limit" };
    if (error instanceof SurfaceCreationError) return { ok: false, error: error.code, conflicts: error.conflicts };
    logFailure("onboard-add-surfaces", error);
    return { ok: false, error: "ingest-failed" };
  }
  const apiUrl = workflowApiUrl(options.origin);
  const yaml = results.map((result, index) => {
    const source = inputs[index]!;
    return renderSurfaceWorkflowStep({ slug: input.slug, surfaceSlug: result.surfaceSlug, pathTemplate: source.format.pathTemplate, adapter: source.format.adapter, baseLocale: source.baseLocale,
      ...(apiUrl === undefined ? {} : { apiUrl }) });
  }).join("\n");
  return { ok: true, results, yaml };

}
