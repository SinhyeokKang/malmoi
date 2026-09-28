import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AccessError } from "@/lib/auth/message";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { listBranches } from "@/lib/github";

import { checkRepoAccess, type OnboardFailure } from "./access";

/**
 * **브랜치 목록의 공유 코어** (mcp-connector T4-c) — 편집 UI와 MCP `list_branches`. 신규(①)와 기존 프로젝트(설정)의 인가가 다르다.
 */
export type BranchesResult =
  | { ok: true; names: string[]; defaultBranch: string; truncated: boolean }
  | { ok: false; error: OnboardFailure; defaultBranch?: string };

/**
 * ①의 브랜치 목록 (DESIGN §6.7).
 *
 * ⚠️ **인가는 `checkRepoAccess`를 그대로 지난다.** 그 함수가 ARCHITECTURE §6의 3중 검증이고, 존재
 * 오라클을 막는 **순서**(사용자 토큰으로 먼저 보고 없으면 `repo-not-installed` 한 갈래로 접는다)가
 * 거기 있다 — 여기서 갈래를 나누면 sec-audit 발견 5가 그대로 돌아온다.
 *
 * `defaultBranch`는 같은 호출이 이미 들고 있다 — **GitHub을 한 번 더 부르지 않는다.**
 */
export async function listNewRepoBranches(prisma: PrismaClient, subject: Subject, input: { owner: string; repo: string }): Promise<BranchesResult> {
  const { userId } = subject;
  const access = await checkRepoAccess(prisma, userId, input.owner, input.repo, true);
  if (access.status !== "ok") return { ok: false, error: access.error };

  const list = await listBranches(access.repoOwner, access.repoName, access.installationId, access.repositoryId);
  // 조회 실패는 ①을 막지 않는다 — 화면이 default branch 하나로 접고 그 사실을 말한다 (예외 D).
  if (list.status !== "ok") return { ok: false, error: "unavailable", defaultBranch: access.defaultBranch };

  return { ok: true, names: list.names, defaultBranch: access.defaultBranch, truncated: list.truncated };
}

export type ProjectBranchesResult = BranchesResult | { ok: false; error: AccessError };

/**
 * **연결된 프로젝트 설정의 브랜치 목록** (malmoi#123). `listRepoBranches`는 온보딩 ①이라 리포 쓰기 권한을 요구하는데
 * (토큰을 받을 사람이다 — sec-audit-3 1a), 설정의 Base branch 목록은 **읽기**다: 저장(`updateRepositorySettings`)도
 * 쓰기 권한을 요구하지 않고 기존 프로젝트에는 소급하지 않는다. 그래서 `requirePush: false`로 부른다(Sync와 같은 예외).
 *
 * ⚠️ **클라이언트가 보낸 owner/repo·플래그로 가르지 않는다** — 그러면 ①이 같은 플래그로 쓰기 확인을 건너뛸 수 있다.
 * 프로젝트 slug로 인가(`project:settings`)하고 리포는 **저장된 행**에서 읽으며, 확인한 리포 id를 고정된
 * `Project.repositoryId`와 대조한다.
 */
export async function listLinkedBranches(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<ProjectBranchesResult> {
  const { userId } = subject;
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const project = await prisma.project.findUnique({
    where: { id: access.projectId },
    select: { repoOwner: true, repoName: true, installationId: true, repositoryId: true },
  });
  if (project === null) return { ok: false, error: "not-found" };
  if (project.installationId === null || project.repositoryId === null) return { ok: false, error: "repo-not-installed" };
  const repo = await checkRepoAccess(prisma, userId, project.repoOwner, project.repoName, false);
  if (repo.status !== "ok") return { ok: false, error: repo.error };
  if (repo.repositoryId !== project.repositoryId) return { ok: false, error: "repo-forbidden" };

  const list = await listBranches(repo.repoOwner, repo.repoName, repo.installationId, repo.repositoryId);
  if (list.status !== "ok") return { ok: false, error: "unavailable", defaultBranch: repo.defaultBranch };
  return { ok: true, names: list.names, defaultBranch: repo.defaultBranch, truncated: list.truncated };
}
