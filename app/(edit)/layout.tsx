import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { rejectTarget } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { loadMemberships } from "@/lib/keys/query";

/**
 * 편집 UI 셸 — **캔버스 위에 패널이 떠 있는 구조다** (8-2, 시안 `212:937`).
 * 바깥 padding 8 · 패널 간 gap 8이고 예외를 만들지 않는다 (`features/ui-rework/README.md` 규약 3.5).
 *
 * ⚠️ **레이아웃의 조건부 반환은 차단이 아니다.** App Router는 레이아웃과 페이지를 병렬로
 * 렌더하므로, 여기서 `children`을 안 써도 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를
 * 응답에 싣는다. 실측으로 1446키가 세션 없이 1.3MB 응답에 노출됐다 —
 * `docs/POSTMORTEM.md` 2026-08-31 항목. 렌더 전 차단은 미들웨어가 하고, 여기서는 `redirect()`를
 * **던져** 응답을 중단시킨다(조건부 렌더가 아니다).
 *
 * ⚠️ **`{children}`을 흰 패널로 감싸지 않는다.** 감싸면 오른쪽 패널(`ProjectPanel`)이 그 안에 갇혀
 * "패널 둘이 gap 8로 나란히"가 성립하지 않는다 — `ContentPanel`은 각 갈래의 레이아웃이 들고,
 * 라우트마다 정확히 하나인지는 `__tests__/shell-layout.test.ts`가 체인을 훑어 센다.
 *
 * ⚠️ **Publish 버튼과 breadcrumb이 여기 없다.** 그 조작은 프로젝트에 속하는데 이 레이아웃은
 * `/projects` 목록도 감싸므로 slug가 없다 — 8-3이 그것을 `projects/[slug]/layout.tsx`로 옮긴다.
 */
export default async function EditLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();

  // 2차 방어. 차단의 1차는 미들웨어다(위 주석) — 장애는 `requireUser`와 같은 목적지로 보내
  // 비로그인과 같은 응답을 내지 않는다. 그 판정은 `rejectTarget`이 든다 (8-1a).
  if (session.status !== "ok") redirect(rejectTarget(session.status));

  // 사이드바가 프로젝트 컨텍스트를 알아야 하는데 레이아웃은 `[slug]` params를 못 받는다 —
  // 멤버십 목록을 넘기면 클라이언트가 pathname으로 그 안에서 찾는다 (design §2).
  // **`userId`로 좁힌다** (POSTMORTEM 2026-09-06). 사용자당 3개 제한이라 가볍다.
  const memberships = await loadMemberships(getPrisma(), session.userId);

  // GitHub 핸들이 사라진 자리다 — Google로 로그인한 사용자에게는 핸들이 없다.
  // `User.id`는 사람이 읽을 값이 아니므로 이름·이메일 순으로 떨어진다.
  const name = session.name ?? session.email ?? "?";

  // Server Action을 클라이언트 컴포넌트에 **참조로** 넘긴다 — 그래야 사이드바가 `@/auth`를 물지 않는다.
  // ⚠️ **`/`가 맞다 — 이관 누락이 아니다** (2026-09-10 사용자). **로그아웃은 랜딩으로 간다**:
  // 지금은 루트 껍데기가 `/signin`으로 한 홉 더 보내고, 랜딩이 서면 거기 착지한다.
  // `routes.signIn()`으로 바꾸면 그 결정이 조용히 뒤집힌다.
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    /**
     * ⚠️ **`h-svh` + `overflow-hidden`이지 `min-h-svh`가 아니다** (malmoi#13). `min-`은 "최소 한 화면"이라
     * 콘텐츠가 길면 컨테이너가 함께 자라고, 그러면 `aside`가 stretch로 **문서 높이만큼** 늘어나
     * 하단 항목(Sign out·Collapse sidebar)이 화면 밖으로 나간다 — 24키 화면에서도 그랬다.
     * 스크롤은 사이드바와 콘텐츠 패널이 각자 자기 안에서 든다.
     *
     * ⚠️ **`min-w-[1280px]`가 있어야 좁은 창에서 "가로 스크롤"이 된다** (8단계 규약 3). 없으면
     * 스크롤이 아니라 flex가 압축돼 **콘텐츠가 잘린다** — 둘은 다르다.
     */
    <div className="bg-canvas flex h-svh min-w-[1280px] flex-col gap-2 overflow-hidden p-2">
      <Header name={name} email={session.email} signOut={signOutAction} />
      <div className="flex min-h-0 flex-1 gap-2">
        {/*
          ⚠️ **넷만 넘긴다** (2026-09-09, sec-audit 발견 23 — 7단계가 `archived`를 더했다). `memberships`는 `MembershipRow`(여섯 필드)이고
          prop 타입은 `NavProject`(셋)인데, **신선한 리터럴이 아니라 초과 프로퍼티 검사가 안 걸렸다** —
          `installationId`·`lastCommitSha`가 `(edit)` 아래 **모든** 페이지의 RSC 페이로드에 실렸다.
          비밀은 아니지만 `lib/shell/nav.ts`가 좁힌 계약이 무의미해진다.
        */}
        <Sidebar
          memberships={memberships.map(({ slug, name, role, archivedAt }) => ({ slug, name, role, archived: archivedAt !== null }))}
          signOut={signOutAction}
        />
        {children}
      </div>
    </div>
  );
}
