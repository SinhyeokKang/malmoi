import "server-only";

import { AppError, logCaught } from "@/lib/failure";
import { createGitClient } from "@/lib/github";
import { GITHUB_WAIT_MS, withinGithubWait } from "@/lib/github-wait";
import { syncBranchFor } from "@/lib/pull/sync-branch";

export async function loadOpenPrUrl(
  slug: string,
  project: {
    repoOwner: string;
    repoName: string;
    installationId: string | null;
    repositoryId: string | null;
    archivedAt: Date | null;
  },
): Promise<string | null | undefined> {
  // ⚠️ **이미 보관됐으면 묻지 않는다** — 그 상태의 카드는 [Restore project] 하나이고 Dialog가 없다.
  // 쓰이지 않는 값을 위해 GitHub 왕복(리포 확인 + PR 목록)을 늘리는 셈이다.
  if (project.archivedAt !== null) return null;
  if (project.installationId === null) return null;
  if (project.repositoryId === null) return undefined;
  const { installationId, repositoryId } = project;
  // ⚠️ **마감이 probe와 같다** (`GITHUB_WAIT_MS`) — 넘기면 실패와 같은 `undefined`("확인하지 못했다")다.
  return withinGithubWait((async () => {
    try {
      const client = await createGitClient(project.repoOwner, project.repoName, installationId, repositoryId);
      const pr = await client.findOpenPr(`${project.repoOwner}:${syncBranchFor(slug)}`);
      return pr === null ? null : pr.url;
    } catch (error) {
      logCaught("open-pr", "find", error);
      return undefined;
    }
  })(), () => {
    logCaught("open-pr", "deadline", new AppError(`no response within ${GITHUB_WAIT_MS}ms`));
    return undefined;
  });
}
