import "server-only";

import { AppError, logCaught } from "@/lib/failure";
import { createGitClient } from "@/lib/github";
import { GITHUB_WAIT_MS, withinGithubWait } from "@/lib/github-wait";
import { homeOpenPrMemo } from "@/lib/projects/open-pr-memo";
import { openPrGateApplies } from "@/lib/protection/plan";
import { syncBranchFor } from "@/lib/pull/sync-branch";

/**
 * CI 적재 게이트의 입력 (nightly-sync). `installationId`·`repositoryId`가 null이면 **`null`(게이트 없음)** 이다 — PR을 낼 수 없는 프로젝트엔
 * 열린 Malmoi PR도 없다. `loadOpenPrUrl`은 `repositoryId null`을 `undefined`로 읽는데, 그대로 쓰면 고정 전 옛 행의 CI가 영구 보류된다.
 */
export async function loadOpenPrForImportGate(
  slug: string,
  project: { repoOwner: string; repoName: string; installationId: string | null; repositoryId: string | null; archivedAt: Date | null },
): Promise<string | null | undefined> {
  if (!openPrGateApplies(project)) return null;
  return loadOpenPrUrl(slug, project);
}

/**
 * sync 브랜치에 열린 Malmoi PR — `null`은 없음, **`undefined`는 모름**(실패·마감·리포 id 없음)이다. 게이트가 모름을 보류로 읽는다(fail-closed).
 * GitHub 2회(리포 신원 확인 + PR 목록)이고 **언제나 실물을 본다** — 게이트·설정·MCP·Publish 미리보기가 이것을 부른다.
 * Home 표시만 `loadOpenPrUrlMemo`를 지난다.
 */
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

/**
 * **Home 표시 전용** (ux-drift-unify U15) — `loadOpenPrUrl`을 `OPEN_PR_MEMO_TTL_MS` 동안 기억한다. 호출부는 Home 하나다(`open-pr-memo.test.ts` 배선).
 * ⚠️ **게이트에 쓰지 않는다** — 옛 "없음"이 적재를 통과시킨다. Publish·수동 Sync가 그 프로젝트의 항목을 지운다(`forgetOpenPr`).
 */
export function loadOpenPrUrlMemo(slug: string, project: Parameters<typeof loadOpenPrUrl>[1]): Promise<string | null | undefined> {
  return homeOpenPrMemo.load(slug, project, () => loadOpenPrUrl(slug, project));
}
