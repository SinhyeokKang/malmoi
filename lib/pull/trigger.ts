// `server-only`를 붙이지 않는다 — `__tests__/trigger.test.ts`가 GitHub·DB만 바꿔 끼우고 이 조립을
// 직접 지난다. 클라이언트 유입은 `lib/db.ts`·`lib/keys/query.ts`의 `server-only`가 막는다.
import { fail } from "@/lib/failure";
import { isRefSafeSlug } from "./ref-slug";
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
 * ⚠️ **형식 판정은 `./ref-slug`가 든다.** 여기서 정의하면 `lib/onboarding/slug.ts`가 그것을 import하면서
 * 이 파일의 그래프(octokit·ts-morph)를 함께 끌어오고, 그 그래프가 클라이언트 번들에 7.2MB 청크로
 * 들어간다 (2026-09-07). **호출부를 위해 그대로 재수출한다** — 기존 import 경로가 갈리지 않게.
 */
export { REF_SAFE_SLUG, isRefSafeSlug } from "./ref-slug";

/**
 * 프로젝트의 sync 브랜치 이름. **누적 히스토리가 아니라 "현재 DB 상태의 스냅샷"이라**
 * 매 pull마다 force update된다 (ARCHITECTURE §3).
 *
 * ⚠️ **slug가 이름에 들어가는 것이 요지다.** 예전에는 상수 `l10n/sync` 하나였는데, 한 리포에
 * 번역 표면이 둘이면 Project가 둘이 되고(SAAS.md §7.1) **그 둘이 같은 브랜치를 force update로
 * 서로 덮는다.** TASKS §7의 실물 검증에서 순차 실행으로 피해 갔던 자리이고, bugshot-2가 정확히
 * 그 모양이다 (`_locales` 4키 + `ts-dict` 903키).
 *
 * `Project.slug`에는 형식 제약이 없으므로(`slug String @unique`) **여기가 유일한 방어선이다.**
 * 안 막으면 `createRef`가 422로 죽고 원인이 "GitHub이 거절함"으로만 보인다.
 */
export function syncBranchFor(slug: string): string {
  if (!isRefSafeSlug(slug)) {
    fail(`project slug is not usable as a git branch name: ${JSON.stringify(slug)}`);
  }
  return `l10n/sync-${slug}`;
}

export async function triggerPull(prisma: PrismaClient, slug: string): Promise<PullResult> {
  const result = await runPull({
    loadState: () => loadPullState(prisma, slug),
    createClient: async (project) => {
      // `runPull`이 이미 null을 걸렀다 — 여기 오면 값이 있다.
      if (project.installationId === null) fail("installationId is missing", "not-installed");
      return createGitClient(project.repoOwner, project.repoName, project.installationId);
    },
    saveLastPulledAt: (projectId, at, published) => saveLastPulledAt(prisma, projectId, at, published),
    syncBranch: syncBranchFor(slug),
  });

  // ⚠️ **warnings는 실행별 진단이고 큐가 아니다** (2026-09-04 audit #35). 2층까지 통과하면
  // `lastPulledAt`이 갱신되므로 다음 밤은 1층에서 끝나고 이 경고가 다시 나오지 않는다. 그
  // 갱신을 막는 쪽(경고가 있으면 안 쓰기)은 `missingOriginal`처럼 **지속 상태**인 경고에서
  // 매일 밤 트리·blob 전량 읽기를 영구화한다. 그래서 스킵 판정은 그대로 두고 **로그에 남긴다** —
  // cron 응답 JSON을 놓쳐도 Vercel 로그에서 찾을 수 있어야 한다.
  if (result.warnings !== undefined) {
    for (const w of result.warnings) console.warn(`[pull:${slug}] ${w}`);
  }
  return result;
}
