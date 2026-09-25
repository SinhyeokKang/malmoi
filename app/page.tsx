import { redirect } from "next/navigation";

import { LandingShell } from "@/components/landing/shell/landing-shell";
import { mockupScenes } from "@/components/landing/mockup";
import { Stage } from "@/components/landing/stage";
import { ButtonLink } from "@/components/ui/button";
import { rootView } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * **루트는 랜딩이다** (Claude Design `Landing.dc.html` 1a–1d). 로그인 화면은 `/signin`이 그린다.
 *
 * ⚠️ **로그인 상태로 오면 여전히 `/projects`다** — *"로그인 이후 랜딩 못 가게"*가 2026-09-10 사용자 결정이고,
 * 판정은 `rootView`가 든다. 그래서 랜딩을 보는 사람은 늘 비로그인이고 CTA는 `Get started` 하나다.
 *
 * ⚠️ **`unavailable`도 랜딩이다**(옛: `/signin?error=Unavailable`) — 공개 화면이 세션 장애로 안 열리는 것이 더 나쁘다.
 * 장애 신호는 보호 라우트의 `rejectTarget`이 계속 든다.
 *
 * ⚠️ **`?error=`·`?sessions=`를 여기서 읽지 않는다.** 그 쿼리를 실어 보내는 자리는 전부 `routes.signIn({...})`을 지나
 * `/signin`으로 간다.
 */
export default async function Root() {
  const session = await readSession();
  const view = rootView(session.status);
  if ("redirect" in view) redirect(view.redirect);

  const { hero, stage, closing, mockup, shell } = m.landing;
  return (
    <LandingShell>
      <section aria-labelledby="landing-hero" className="flex flex-col items-center px-8 pt-30 text-center">
        {/* h1·CTA h2는 48/600 — DESIGN §4가 예고한 weight 600의 첫 소비자다(spec 결정 6). */}
        <h1 id="landing-hero" className="m-0 text-5xl leading-[1.1] font-semibold">
          {hero.title[0]}
          <br />
          {hero.title[1]}
        </h1>
        <p className="mt-5 max-w-[44em] text-lg leading-[1.6] text-balance">{hero.body}</p>
        <div className="mt-5 flex gap-2">
          <ButtonLink href={routes.docs()} size="lg">{shell.docs}</ButtonLink>
          <ButtonLink href={routes.signIn()} variant="primary" size="lg">{shell.getStarted}</ButtonLink>
        </div>
      </section>
      <Stage
        label={stage.label}
        captions={stage.captions}
        typed={mockup.selected.typed}
        scenes={mockupScenes()}
        closing={
          <section aria-labelledby="landing-closing" className="flex flex-col items-center px-8 py-30 text-center">
            <h2 id="landing-closing" className="m-0 text-5xl leading-[1.1] font-semibold">{closing.title}</h2>
            <p className="mt-5 max-w-[40em] text-lg leading-[1.6] text-balance">{closing.body}</p>
            <div className="mt-5 flex">
              <ButtonLink href={routes.signIn()} variant="primary" size="lg">{shell.getStarted}</ButtonLink>
            </div>
          </section>
        }
      />
    </LandingShell>
  );
}
