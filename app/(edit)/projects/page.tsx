import { ProjectList } from "@/components/projects/project-list";
import { ContentPanel } from "@/components/shell/content-panel";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { loadProjectList } from "@/lib/keys/query";
import { firstQueryValues, type Raw } from "@/lib/search-params";

/**
 * 내 프로젝트 목록. **로그인 후 착지점**이고, 인가 거부의 redirect 목적지다.
 *
 * ⚠️ **`requireProjectAccess`를 지나지 않는다 — 지날 대상이 없다.** 이 화면은 특정 프로젝트가
 * 아니라 "내 멤버십"을 보여주므로 인가 단위가 사용자다. 그래서 `requireUser`가 쓰인다.
 *
 * ⚠️ **본문은 `components/projects/project-list.tsx`에 있다** — `/projects/new`가 같은 목록을
 * 모달 뒤에 그리기 때문이다. **`<ContentPanel>`만 여기 남는다**: 공유 컴포넌트로 올리면
 * `shell-layout.test.ts`가 두 라우트에서 0을 세어 red다.
 *
 * ⚠️ **여기만 페이지가 패널을 든다** (8-2). 형제 셋(`/account`·`/projects/[slug]`…)은 각자 레이아웃이
 * 드는데, 이 화면은 `projects/` 디렉터리를 `[slug]`와 공유해서 그 층에 레이아웃을 두면 프로젝트
 * 화면이 **두 겹**으로 감싸인다.
 */

/**
 * ⚠️ **이 화면은 2026-09-13부터 GitHub도 기다린다** (보관 제외 전 프로젝트의 compare·PR, 동시 3).
 * 형제 라우트(`/projects/new`)가 같은 조회를 돌면서 60을 들고 있는데 **여기만 빠져 있었다** —
 * 로그인 직후의 착지점이자 인가 거부의 리다이렉트 목적지가 플랫폼 기본값에서 잘리면 그 거부 사유가
 * 통째로 사라진다. 지연 자체는 `loadRemoteSignals`의 마감이 먼저 접고, 이 값은 그 바깥의 상한이다.
 */
export const maxDuration = 60;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Raw<"e" | "q">>;
}) {
  const { userId } = await requireUser();
  /**
   * `requireProjectAccess`가 거부 사유를 `?e=`로 넘긴다. 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시.
   *
   * ⚠️ **GitHub 연결 실패도 여기로 온다.** state가 무효면 돌아갈 slug를 믿을 수 없어 callback이
   * 이 화면으로 보낸다 (ARCHITECTURE §6.4). `isAccessError` 하나만 보면 그 사유가 **통째로 무음**이고,
   * 사용자에게는 버튼이 안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06). 두 union은 `unavailable`
   * 하나만 겹치고 뜻이 같으므로 먼저 보는 쪽이 이겨도 문제가 없다.
   */
  // ⚠️ **옛 `?filter=`는 읽지 않는다** — 그 키가 있어도 조용히 무시되고 전체 목록이 뜬다
  // (projects-list §1.2). 리다이렉트를 만들지 않는 것이 옛 `?focus=`와 같은 관용구다.
  const { e, q } = firstQueryValues(await searchParams);
  const message = isAccessError(e)
    ? accessErrorMessage(e)
    : isConnectError(e)
      ? connectErrorMessage(e)
      : null;

  /**
   * ⚠️ **셸의 `loadMemberships`와 다른 함수다** — 그쪽에 목록 전용 집계를 얹으면 모든 페이지가 문다.
   */
  const view = await loadProjectList(getPrisma(), userId);

  return (
    <ContentPanel>
      <ProjectList all={view.rows} q={q} message={message} />
    </ContentPanel>
  );
}
