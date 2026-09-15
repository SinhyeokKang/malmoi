import "server-only";

import { createGitClient } from "@/lib/github";
import { syncBranchFor } from "@/lib/pull/trigger";

export async function loadOpenPrUrl(
  slug: string,
  project: {
    repoOwner: string;
    repoName: string;
    baseBranch: string;
    installationId: string | null;
    repositoryId: string | null;
    archivedAt: Date | null;
  },
): Promise<string | null | undefined> {
  // ⚠️ **이미 보관됐으면 묻지 않는다** — 그 상태의 카드는 [Restore project] 하나이고 Dialog가 없다.
  // 쓰이지 않는 값을 위해 왕복을 하나 늘리는 셈이고, `createGitClient`는 호출마다 설치 토큰을 새로 뽑는다.
  if (project.archivedAt !== null) return null;
  if (project.installationId === null) return null;
  if (project.repositoryId === null) return undefined;
  try {
    const client = await createGitClient(project.repoOwner, project.repoName, project.installationId, project.repositoryId);
    return await client.findOpenPrUrl(`${project.repoOwner}:${syncBranchFor(slug)}`, project.baseBranch);
  } catch {
    return undefined;
  }
}
