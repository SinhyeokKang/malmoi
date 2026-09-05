import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

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
  const session = await auth();
  if (session?.user) redirect("/projects");

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-lg font-semibold tracking-tight">말모이</h1>
      <p className="text-muted-foreground text-sm">
        초대받은 프로젝트의 번역을 보고 고칠 수 있어요.
      </p>
      {error !== undefined && (
        <p className="text-destructive text-xs">
          {error === "AccessDenied"
            ? "이 계정으로는 들어올 수 없어요 — 이메일이 검증되지 않았거나, 같은 이메일로 다른 방식으로 가입한 계정이 있어요."
            : "로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요."}
        </p>
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
        className={
          primary
            ? "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring w-full rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
            : "border-input hover:bg-accent focus-visible:ring-ring w-full rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
        }
      >
        {label}
      </button>
    </form>
  );
}
