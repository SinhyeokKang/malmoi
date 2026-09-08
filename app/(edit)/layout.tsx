import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { loadMemberships } from "@/lib/keys/query";

/**
 * 편집 UI 셸 — 사이드바 + top bar (DESIGN §6.5).
 *
 * ⚠️ **레이아웃의 조건부 반환은 차단이 아니다.** App Router는 레이아웃과 페이지를 병렬로
 * 렌더하므로, 여기서 `children`을 안 써도 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를
 * 응답에 싣는다. 실측으로 1446키가 세션 없이 1.3MB 응답에 노출됐다 —
 * `docs/POSTMORTEM.md` 2026-08-31 항목. 렌더 전 차단은 미들웨어가 하고, 여기서는 `redirect()`를
 * **던져** 응답을 중단시킨다(조건부 렌더가 아니다).
 *
 * ⚠️ **Publish 버튼이 여기 없다.** 그 조작은 프로젝트에 속하는데 이 레이아웃은 `/projects`
 * 목록도 감싸므로 slug가 없다 — 번역 화면이 직접 든다.
 *
 * ⚠️ **breadcrumb도 여기 없다** — 레이아웃은 페이지 props를 못 받는다. 페이지 콘텐츠의 첫 줄이 든다.
 */
export default async function EditLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();

  // 2차 방어. 차단의 1차는 미들웨어다(위 주석) — 장애는 `requireUser`와 같은 목적지로 보내
  // 비로그인과 같은 응답을 내지 않는다.
  if (session.status === "unavailable") redirect("/?error=Unavailable");
  if (session.status === "none") redirect("/");

  // 사이드바가 프로젝트 컨텍스트를 알아야 하는데 레이아웃은 `[slug]` params를 못 받는다 —
  // 멤버십 목록을 넘기면 클라이언트가 pathname으로 그 안에서 찾는다 (design §2).
  // **`userId`로 좁힌다** (POSTMORTEM 2026-09-06). 사용자당 3개 제한이라 가볍다.
  const memberships = await loadMemberships(getPrisma(), session.userId);

  // GitHub 핸들이 사라진 자리다 — Google로 로그인한 사용자에게는 핸들이 없다.
  // `User.id`는 사람이 읽을 값이 아니므로 이름·이메일 순으로 떨어진다.
  const name = session.name ?? session.email ?? "?";

  // Server Action을 클라이언트 컴포넌트에 **참조로** 넘긴다 — 그래야 사이드바가 `@/auth`를 물지 않는다.
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    /**
     * ⚠️ **`h-svh` + `overflow-hidden`이지 `min-h-svh`가 아니다** (malmoi#13). `min-`은 "최소 한 화면"이라
     * 콘텐츠가 길면 컨테이너가 함께 자라고, 그러면 `aside`가 stretch로 **문서 높이만큼** 늘어나
     * 하단 항목(Sign out·Collapse sidebar)이 화면 밖으로 나간다 — 24키 화면에서도 그랬다.
     * 스크롤은 아래 콘텐츠 컬럼이 자기 안에서 든다.
     */
    <div className="flex h-svh overflow-hidden">
      <Sidebar memberships={memberships} signOut={signOutAction} />
      {/* `min-w-0`이 없으면 번역 표의 가로 스크롤이 이 컬럼을 밀어 사이드바까지 움직인다 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar name={name} email={session.email} signOut={signOutAction} />
        {/* 페이지가 여기서 스크롤한다 — top bar와 사이드바는 위에서 고정된 채 남는다 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
