import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { signInErrorMessage } from "@/lib/auth/message";
import { readSession } from "@/lib/auth/read-session";
import { cn } from "@/lib/utils";

/**
 * 로그인 진입점. 미들웨어가 세션 없는 보호 라우트 요청을 여기로 보낸다.
 *
 * 이미 로그인돼 있으면 바로 `/projects`로 — 로그인 화면을 두 번 보여줄 이유가 없다.
 *
 * ⚠️ **거부 사유를 여기서 보인다.** `signIn` 콜백이 false를 내면 Auth.js가 `pages.error`로 보내고,
 * 그것을 이 화면으로 돌려놨다 — 기본 `/api/auth/error`는 우리 디자인 밖의 무스타일 페이지다.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await readSession();
  if (session.status === "ok") redirect("/projects");
  // 세션을 못 읽었으면 `?error=`가 없어도 장애 문구를 보인다 — 로그인 버튼만 보이면 사용자가 헛로그인한다.
  const shown = error ?? (session.status === "unavailable" ? "Unavailable" : undefined);

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-lg font-semibold tracking-tight">말모이</h1>
      <p className="text-muted-foreground text-sm">
        초대받은 프로젝트의 번역을 보고 고칠 수 있어요.
      </p>
      {shown !== undefined && (
        <p className="text-destructive text-sm">{signInErrorMessage(shown)}</p>
      )}
      <div className="flex flex-col gap-2">
        <ProviderButton provider="github" label="GitHub으로 로그인" primary />
        <ProviderButton provider="google" label="Google로 로그인" />
      </div>
    </main>
  );
}

function ProviderButton({
  provider,
  label,
  primary,
}: {
  provider: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn(provider, { redirectTo: "/projects" });
      }}
    >
      <button
        type="submit"
        className={cn(
          "focus-visible:ring-ring w-full rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none",
          primary
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-input hover:bg-accent border",
        )}
      >
        {label}
      </button>
    </form>
  );
}
