// `server-only`를 붙이지 않는다 — `__tests__/trigger.test.ts`가 GitHub·DB만 바꿔 끼우고 이 조립을
// 직접 지난다. 클라이언트 유입은 `lib/db.ts`·`lib/keys/query.ts`의 `server-only`가 막는다.
import { fail } from "@/lib/failure";
import type { PrismaClient } from "@/generated/prisma/client";
import { createGitClient } from "@/lib/github";
import { invalidateDeliveryConfirmations, loadPullState, saveLastPulledAt } from "./load";
import { runPull, type PullResult } from "./run";
import { syncBranchFor } from "./sync-branch";

/**
 * pull 한 번. **진입점 둘이 같은 조립을 반복하지 않게** 여기 모은다 —
 * `/api/pull`(cron)과 편집 UI의 Server Action이 이 함수를 부른다.
 *
 * 진입점이 둘인 것은 의도된 것이다 (CLAUDE.md "데이터 변경 경로"): 외부(cron)는 Route Handler, 내부(편집 UI)는
 * Server Action. **Action이 `/api/pull`을 fetch하지 않는다** — 내부 쓰기에 Route Handler를
 * 새로 만들지 않는 규칙의 반대편이고, 그러면 세션 쿠키·절대 URL 배선이 따라온다.
 */

/**
 * ⚠️ **형식 판정은 `./ref-slug`가 든다.** 여기서 정의하면 `lib/onboarding/slug.ts`가 그것을 import하면서
 * 이 파일의 그래프(octokit·ts-morph)를 함께 끌어오고, 그 그래프가 클라이언트 번들에 7.2MB 청크로
 * 들어간다 (2026-09-07). **호출부를 위해 그대로 재수출한다** — 기존 import 경로가 갈리지 않게.
 */
export { REF_SAFE_SLUG, isRefSafeSlug } from "./ref-slug";

/**
 * @param runId 이 실행의 `SyncRun.id`. 있으면 성공 확정이 그 실행권으로 전달 확인을 쓴다(translation-rework — ARCHITECTURE §5.8).
 *   `null`이면 확인을 쓰지 않는다 — 실행권 없이는 교체된 늦은 성공을 가를 수 없다. **인자를 생략할 수 없게 둔 것이 요지다.**
 */
export async function triggerPull(prisma: PrismaClient, slug: string, runId: string | null): Promise<PullResult> {
  const result = await runPull({
    loadState: () => loadPullState(prisma, slug),
    createClient: async (project) => {
      // `runPull`이 이미 null을 걸렀다 — 여기 오면 값이 있다.
      if (project.installationId === null) fail("installationId is missing", "not-installed");
      if (!project.repositoryId) fail("repository identity is not pinned; reconnect the project", "not-installed");
      return createGitClient(project.repoOwner, project.repoName, project.installationId, project.repositoryId);
    },
    saveLastPulledAt: (projectId, at, published, delivered, contexts, withheld) =>
      saveLastPulledAt(prisma, projectId, at, published, delivered, runId === null ? undefined : { runId, contexts, withheld }),
    invalidateDelivery: (projectId) => invalidateDeliveryConfirmations(prisma, projectId),
    syncBranch: syncBranchFor(slug),
  });

  // ⚠️ **경고가 있으면 쓰기 전에 멈추고 `lastPulledAt`을 안 쓴다** (sync-edit-protection T10, 2026-09-18). 2026-09-04 audit #35는
  // 반대를 골랐다 — `missingOriginal` 같은 **지속 상태** 경고에서 매일 밤 트리·blob 전량 읽기가 영구화된다는 근거였다.
  // 그 대가를 이제 감수한다: 경고를 실어 보내면 버린 값의 편집 토큰까지 전달 확인으로 비워져 보내지 않은 편집이 사라진다.
  // 1층이 토큰으로 판정하므로 미전달 편집이 없는 프로젝트는 여전히 GitHub을 안 부른다. 로그에는 계속 남긴다 —
  // cron 응답 JSON을 놓쳐도 Vercel 로그에서 찾을 수 있어야 한다.
  if (result.status === "skipped" && result.reason === "writer-warnings") {
    for (const w of result.warnings) console.warn(`[pull:${slug}] ${w}`);
  }
  // 보류도 남긴다 — 사람이 파일을 되돌리거나 Revert할 때까지 매 밤 같은 판정이 반복되는데, cron 응답을 놓치면 흔적이 없다(delivery-invariants D3).
  const withheld = result.status === "committed" || (result.status === "skipped" && (result.reason === "no-changes" || result.reason === "withheld")) ? result.withheld : undefined;
  if (withheld !== undefined) console.warn(`[pull:${slug}] withheld edits: ${withheld.file} missing file, ${withheld.key} missing key`);
  return result;
}
