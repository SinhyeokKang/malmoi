import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { PullButton } from "@/components/pull-button";

/**
 * 편집 UI 셸. **인가는 `auth.ts`의 `signIn` 콜백이, 차단은 `middleware.ts`가 한다** —
 * 여기는 헤더를 얹는 역할이다. 로그인 화면은 `app/page.tsx`가 그린다.
 *
 * ⚠️ **레이아웃의 조건부 반환은 차단이 아니다.** App Router는 레이아웃과 페이지를 병렬로
 * 렌더하므로, 여기서 `children`을 안 써도 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를
 * 응답에 싣는다. 실측으로 1446키가 세션 없이 1.3MB 응답에 노출됐다 —
 * `docs/POSTMORTEM.md` 2026-08-31 항목. 차단은 미들웨어에만 의존한다.
 */
export default async function EditLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // 2차 방어. 차단의 1차는 미들웨어다(위 주석) — 여기서 `redirect`를 던지면 응답이 중단되므로
  // 병렬로 렌더된 페이지의 페이로드가 나가지 않는다. 미들웨어 matcher에서 라우트가 빠지는
  // 경우의 안전망이다.
  if (!session?.user) redirect("/");
  // GitHub 핸들이 사라진 자리다 — Google로 로그인한 사용자에게는 핸들이 없다.
  // `User.id`는 사람이 읽을 값이 아니므로 이름·이메일 순으로 떨어진다.
  const label = session.user.name ?? session.user.email ?? "?";

  return (
    // flex 컬럼이다 — 페이지가 "헤더를 뺀 나머지 높이"를 calc로 계산하지 않게 한다.
    // 계산으로 두면 헤더에 버튼 하나만 들어와도 그 값이 조용히 거짓이 된다(실제로 밟았다).
    <div className="flex min-h-svh flex-col">
      <header className="border-border flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium">말모이</span>
        <div className="flex items-center gap-3">
          <PullButton />
          {/* 이름은 mono가 아니다 — 식별자가 아니라 산문 쪽이다 (docs/DESIGN.md §4.1) */}
          <span className="text-muted-foreground text-xs">{label}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>
      {/* 남은 높이를 전부 받는다 — 페이지가 calc로 헤더 높이를 빼지 않아도 된다 */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
