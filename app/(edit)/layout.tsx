import { auth, signIn, signOut } from "@/auth";

/**
 * 편집 UI 게이트. **인가는 `auth.ts`의 `signIn` 콜백이 이미 했다** — 여기는 세션 유무만 본다.
 * 세션이 있다는 것은 허용 목록을 통과했다는 뜻이다.
 *
 * 미들웨어가 아니라 레이아웃에서 막는다: 미들웨어는 Edge에서 돌아 `lib/db.ts` 같은 Node 전용
 * 모듈을 못 물고, 이 그룹 밖에 보호할 라우트가 없다.
 */
export default async function EditLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-8">
        <h1 className="text-lg font-semibold tracking-tight">i18n-poc</h1>
        <p className="text-muted-foreground text-sm">
          GitHub 계정으로 로그인한다. 허용 목록에 없는 계정은 들어올 수 없다.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/keys" });
          }}
        >
          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring w-full rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
          >
            GitHub으로 로그인
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-svh">
      <header className="border-border flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium">i18n-poc</span>
        <div className="flex items-center gap-3">
          {/* 핸들은 mono가 아니다 — 식별자지만 사용자 이름이라 산문 쪽에 가깝다 */}
          <span className="text-muted-foreground text-xs">{session.user.login ?? "?"}</span>
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
      {children}
    </div>
  );
}
