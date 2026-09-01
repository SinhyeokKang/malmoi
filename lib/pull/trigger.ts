import type { PrismaClient } from "@/generated/prisma/client";
import { createGitClient } from "@/lib/github";
import { loadPullState, saveLastPulledAt } from "./load";
import { runPull, type PullResult } from "./run";

/**
 * pull 한 번. **진입점 둘이 같은 조립을 반복하지 않게** 여기 모은다 —
 * `/api/pull`(cron)과 편집 UI의 Server Action이 이 함수를 부른다.
 *
 * 진입점이 둘인 것은 의도된 것이다 (MVP §5): 외부(cron)는 Route Handler, 내부(편집 UI)는
 * Server Action. **Action이 `/api/pull`을 fetch하지 않는다** — 내부 쓰기에 Route Handler를
 * 새로 만들지 않는 규칙의 반대편이고, 그러면 세션 쿠키·절대 URL 배선이 따라온다.
 */

/**
 * 고정 브랜치. **누적 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다** — 매 pull마다
 * force update된다 (ARCHITECTURE §3). 여러 개를 쓰지 않으므로 설정이 아니라 상수다.
 */
export const SYNC_BRANCH = "l10n/sync";

export async function triggerPull(prisma: PrismaClient, slug: string): Promise<PullResult> {
  return runPull({
    loadState: () => loadPullState(prisma, slug),
    createClient: async (project) => {
      // `runPull`이 이미 null을 걸렀다 — 여기 오면 값이 있다.
      if (project.installationId === null) throw new Error("installationId가 없다");
      return createGitClient(project.repoOwner, project.repoName, project.installationId);
    },
    saveLastPulledAt: (projectId, at) => saveLastPulledAt(prisma, projectId, at),
    syncBranch: SYNC_BRANCH,
  });
}
