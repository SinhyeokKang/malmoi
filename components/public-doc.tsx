import Link from "next/link";

import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * `/privacy`·`/docs`가 공유하는 껍데기 (8-1a).
 *
 * ⚠️ **셸 밖이라 사이드바도 푸터도 없다** — 돌아가는 링크가 없으면 뒤로가기 말고 길이 없다.
 * 로그인 화면 푸터가 이 둘을 가리키므로 **거기서 온 사람이 되돌아갈 수 있어야 한다.**
 *
 * ⚠️ **형은 8-1b가 시안대로 다시 잡는다** — 지금은 placeholder이고 내용도 "준비 중"이다.
 */
export function PublicDoc({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-4 px-8 py-12">
      <h1 className="text-lg font-medium tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">{body}</p>
      <Link
        href={routes.signIn()}
        className="focus-visible:ring-ring text-sm text-blue-600 underline focus-visible:ring-[3px] focus-visible:outline-none"
      >
        {m.publicDocs.back}
      </Link>
    </main>
  );
}
