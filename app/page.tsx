import { ArrowRight, CircleHelp, LogIn } from "lucide-react";
import NextLink from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { mockupScenes } from "@/components/landing/mockup";
import { Stage } from "@/components/landing/stage";
import { PublicShell } from "@/components/public-shell/public-shell";
import { GithubIcon } from "@/components/signin/brand-icons";
import { ButtonLink } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { appVersion } from "@/lib/app-version";
import { rootView } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";
import type { Messages } from "@/lib/i18n";
import { getMessages, getUiLocale } from "@/lib/i18n/server";
import { en } from "@/messages/en";
import { GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";
import { navFooterItems } from "@/lib/shell/nav";
import { jsonLdHtml, LANDING_LD } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/site";


/** 제목만 absolute다 — 템플릿(`%s · Malmoi`)을 지나면 브랜드가 두 번 선다. */
export const metadata: Metadata = {
  ...pageMetadata({ title: en.seo.homeTitle, description: en.landing.hero.body, path: "/" }),
  title: { absolute: en.seo.homeTitle },
};

/**
 * 마무리 CTA `Docs`의 아이콘은 앱 셸의 `Docs` 항목(`navFooterItems`)과 같은 것이다 — 같은 행선지가 화면마다 다른 글리프를 쓰지 않게
 * 정의에서 읽는다. 항목이 사라지면 지금의 글리프로 떨어진다.
 */
const docsIcon = (m: Messages) => navFooterItems(m).find((item) => item.key === "docs")?.icon ?? CircleHelp;

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
  const [m, uiLocale] = await Promise.all([getMessages(), getUiLocale()]);
  const DocsIcon = docsIcon(m);
  const session = await readSession();
  const view = rootView(session.status);
  if ("redirect" in view) redirect(view.redirect);

  const { hero, stage, closing, mockup, shell } = m.landing;
  return (
    <PublicShell m={m} account={null}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(LANDING_LD) }} />
      <section aria-labelledby="landing-hero" className="flex flex-col items-center px-8 pt-30 text-center">
        {/*
          최신 릴리스 알약(2026-09-30 사용자) — 버전은 빌드가 박은 `APP_VERSION`이다. ⚠️ GitHub Releases를 부르지 않는다 — 랜딩 첫 진입이
          외부 API(콜드 캐시 최대 3초)에 묶이지 않게. 머지마다 릴리스라 배포 버전이 곧 최신 릴리스다.
        */}
        <NextLink
          href={routes.changelog()}
          data-landing-latest
          className="bg-muted hover:bg-foreground/[0.07] focus-visible:ring-ring mb-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          {hero.latest(appVersion())}
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </NextLink>
        {/* h1·CTA h2는 48/600 — DESIGN §4가 예고한 weight 600의 첫 소비자다(§6.615). */}
        <h1 id="landing-hero" className="m-0 text-5xl leading-[1.1] font-semibold">
          {hero.title[0]}
          <br />
          {hero.title[1]}
        </h1>
        <p className="mt-5 max-w-[44em] text-lg leading-body text-balance">{hero.body}</p>
        <p data-landing-fact className="text-muted-foreground mt-3 text-sm">{hero.fact}</p>
        <div data-landing-cta className="mt-5 flex gap-2">
          {/* 선행 아이콘은 `Button`의 svg 슬롯(16 · gap 8)에 맡긴다 — 크기를 여기서 주지 않는다(DESIGN §6.615). */}
          {/* ⚠️ ButtonLink external은 native <a>다. newTab으로 새 탭을 열고 기존 rel에 noopener·noreferrer를 보존·추가한다(DESIGN §6.3). */}
          <ButtonLink size={"lg"} external href={GITHUB_REPO_URL} newTab rel="noreferrer"
            >
            <GithubIcon />{shell.github}
          </ButtonLink>
          <ButtonLink href={routes.signIn()} variant="primary" size="lg"><LogIn aria-hidden />{shell.getStarted}</ButtonLink>
        </div>
      </section>
      <Stage
        label={stage.label}
        captions={stage.captions}
        typed={mockup.selected.typed}
        scenes={mockupScenes(m, uiLocale)}
        closing={
          // 위아래 여백은 섹션 자신의 padding-block 240이다(2026-09-27 사용자 — 120의 두 배). 이웃의 margin으로 만들지 않는다.
          <section aria-labelledby="landing-closing" className="flex flex-col items-center px-8 py-60 text-center">
            <h2 id="landing-closing" className="m-0 text-5xl leading-[1.1] font-semibold">{closing.title}</h2>
            <p className="mt-5 max-w-[40em] text-lg leading-body text-balance">{closing.body}</p>
            <nav aria-label={closing.links.label} data-landing-doc-links className="text-muted-foreground mt-3 text-sm">
              {closing.links.label}: <Link href={routes.docs("reference/formats")}>{closing.links.formats}</Link>
              {" · "}<Link href={routes.docs("ai-agents")}>{closing.links.aiAgents}</Link>
              {" · "}<Link href={routes.docs("faq")}>{closing.links.faq}</Link>
            </nav>
            <div data-landing-cta className="mt-5 flex gap-2">
              <ButtonLink href={routes.docs()} size="lg"><DocsIcon aria-hidden />{shell.docs}</ButtonLink>
              <ButtonLink href={routes.signIn()} variant="primary" size="lg"><LogIn aria-hidden />{shell.getStarted}</ButtonLink>
            </div>
          </section>
        }
      />
    </PublicShell>
  );
}
