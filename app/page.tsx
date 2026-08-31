import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

/**
 * 로그인 진입점. 미들웨어가 세션 없는 `/keys` 요청을 여기로 보낸다.
 *
 * 이미 로그인돼 있으면 바로 `/keys`로 — 로그인 화면을 두 번 보여줄 이유가 없다.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/keys");

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
