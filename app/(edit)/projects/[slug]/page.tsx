import { ExternalLink, Languages } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectNotReady } from "@/components/project-not-ready";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { activeLocaleProgress, recentActivity, type ActivityItem } from "@/lib/home/overview";
import { m } from "@/lib/i18n";
import { loadActors, loadLocaleCounts, loadRecentEdits } from "@/lib/keys/query";
import { actorLabel } from "@/lib/keys/view";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";

/**
 * 프로젝트 Home — **진입의 착지점** (SAAS §7.7 결정 1, 6b-6).
 *
 * ⚠️ **착지 클릭 하나를 갚아야 한다.** 번역자의 일은 `translations` 하나이므로, 개요만 있고 링크가
 * 없으면 그 클릭이 **순손실**이다(결정 1이 받아들인 대가). 그래서 진행률 행이 그대로 `?focus=`
 * 링크이고, 활동 항목이 `?ns=`·`?focus=` 링크이며, 화면당 하나인 primary가 [Open translations]다.
 *
 * ⚠️ **다른 화면의 지표를 복제하지 않는다** (결정 2). 번역 화면 툴바가 키 수·미배포 건수·마지막
 * 전송·PR 링크를 들고 설정 화면이 리포·연결·적재 상태를 든다 — 세 번째 사본을 만들면 그중 하나가
 * 낡는다. **Home이 소유하는 것은 "한 화면에 모아야만 보이는 것"뿐이다**: 로케일별 진행률 대비와
 * 세 출처를 한 줄로 세운 최근 활동.
 *
 * ⚠️ **최근 활동은 지금 재료로만 낸다** — `logs`(7단계)가 `SyncRun`의 소비자이고(SAAS §6), 그
 * 테이블이 서면 이 블록이 거기로 갈아탄다. 지금 낼 수 있는 것은 그 부분집합이다.
 *
 * ⚠️ **최상단에서 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과 페이지를 병렬로
 * 렌더해 페이지가 이미 실행되고 RSC 페이로드에 데이터가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB).
 *
 * ⚠️ **`?e=` 슬롯이 없다** — 보내는 자리가 0이다(거부는 `/projects?e=`로 간다). 읽는 쪽만 두면
 * 도달 불가 코드이고, 그것을 두지 않는 것이 이 리포의 규칙이다.
 */

/** 활동 목록의 상한. 늘리면 그만큼 행을 읽는다 — `logs`(7단계)가 전체를 보여줄 자리다. */
const ACTIVITY_LIMIT = 8;

export default async function ProjectHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projectId, role } = await requireProjectAccess({ slug, permission: "translation:write" });

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      // readiness 판정의 재료 둘 (`planProjectReadiness`) — 컬럼을 새로 만들지 않는다.
      installationId: true,
      lastCommitSha: true,
      // 활동의 세 출처 중 둘. ⚠️ `lastPulledAt`은 읽지 않는다 — 그것은 미배포 집계의 기준선이고
      // 툴바의 것이다 (결정 2).
      lastCommitAt: true,
      lastPublishedAt: true,
      lastPrUrl: true,
      locales: { select: { code: true, isBase: true, orphaned: true } },
    },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 문구가 존재 여부를 말하지 않는 곳으로 보낸다.
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  /**
   * 첫 적재 전에는 볼 것이 없다 (design §3.7). **정책과 문구는 `ProjectNotReady`가 든다** — 번역
   * 화면도 같은 갈래를 만나고, 이 화면이 착지점이 된 뒤로 그것을 **먼저** 만나는 자리가 여기다.
   */
  if (planProjectReadiness(project) !== "ready") return <ProjectNotReady slug={slug} role={role} />;

  const [counts, edits] = await Promise.all([
    loadLocaleCounts(prisma, projectId),
    loadRecentEdits(prisma, projectId, ACTIVITY_LIMIT),
  ]);
  // **렌더되는 행만** 지난다 — 903키 리포에서 전 행의 편집자를 조회하지 않는다.
  const actors = await loadActors(prisma, [...new Set(edits.map((e) => e.updatedBy))]);

  const locales = activeLocaleProgress({
    locales: project.locales,
    total: counts.total,
    cells: counts.cells,
  });
  const activity = recentActivity({
    edits: edits.map((e) => ({ ...e, actor: actorLabel(e.updatedBy, actors) })),
    lastCommitAt: project.lastCommitAt,
    lastPublishedAt: project.lastPublishedAt,
    lastPrUrl: project.lastPrUrl,
    limit: ACTIVITY_LIMIT,
  });

  // 기준 시각을 서버에서 한 번 만든다 — 항목마다 부르면 상대 시각의 기준이 갈린다 (멤버 화면과 같은 규칙).
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* breadcrumb이 없다 — 이 화면이 프로젝트 루트다. 위로 가는 길은 사이드바가 든다 */}
        <h1 className="text-base font-medium">{project.name}</h1>
        <ButtonLink variant="primary" href={routes.translations(slug)}>
          <Languages aria-hidden />
          {m.home.openTranslations}
        </ButtonLink>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">{m.home.progress.title}</h2>
          <p className="text-muted-foreground mt-1 text-xs">{m.home.progress.description}</p>
        </div>
        {locales.length === 0 ? (
          /*
            ⚠️ **적재는 끝났는데 살아 있는 로케일이 0인 상태다** — 파일이 전부 사라졌다. 사유와
            되살리는 방법은 로케일 화면이 들고 있으므로(6b-5) 그리로 보낸다.
          */
          <p className="text-muted-foreground text-xs">
            {m.home.progress.empty}{" "}
            <Link
              href={routes.locales(slug)}
              className="focus-visible:ring-ring text-foreground underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
            >
              {m.home.progress.emptyLink}
            </Link>
          </p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border">
            {locales.map((locale) => (
              <li key={locale.code}>
                {/*
                  ⚠️ **행 전체가 링크다.** 그 로케일 기준으로 번역 화면에 착지시키는 것이 개요가 일로
                  이어지는 유일한 수단이다 — 숫자만 보이면 사용자가 사이드바로 되돌아간다.
                */}
                <Link
                  href={routes.translations(slug, { focus: locale.code })}
                  className="hover:bg-muted/40 focus-visible:ring-ring flex flex-wrap items-baseline gap-2 px-4 py-3 focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  {/* 로케일 코드는 파일명 그대로가 진실이라 식별자다 (DESIGN §4.1) */}
                  <span className="text-mono">{locale.code}</span>
                  {locale.isBase && <Badge>{m.locales.base}</Badge>}
                  <span className="ml-auto flex items-baseline gap-2">
                    {locale.needsReview > 0 && (
                      <Badge variant="warning">{m.locales.needsReview(locale.needsReview)}</Badge>
                    )}
                    <span className="text-sm">
                      {m.locales.progress(locale.percent, locale.translated, locale.total)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{m.home.activity.title}</h2>
        {activity.length === 0 ? (
          <p className="text-muted-foreground text-xs">{m.home.activity.empty}</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border">
            {activity.map((item) => (
              <li key={activityKey(item)} className="px-4 py-3">
                <ActivityRow item={item} slug={slug} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/**
 * 항목 하나. **편집만 내부 링크다** — push는 데려갈 곳이 없고(어느 키인지 모른다) publish는 PR이
 * 외부 링크다. 그것이 "각 항목이 링크다"의 실제 범위다.
 */
function ActivityRow({ item, slug, now }: { item: ActivityItem; slug: string; now: Date }) {
  const when = <span className="text-muted-foreground text-xs">{relativeTime(item.at, now)}</span>;
  // 행의 모양은 하나다 — 갈래마다 복제하면 한쪽만 고쳐지는 자리가 셋 생긴다.
  const row = "flex flex-wrap items-baseline justify-between gap-2";

  if (item.kind === "edit") {
    return (
      <div className={row}>
        {/*
          ⚠️ **그 편집이 있던 네임스페이스와 로케일로 데려간다** — "무엇이 바뀌었나"에서 "고치자"로
          이어지는 자리다. 키 하나를 가리키는 URL은 없으므로 그 키가 사는 화면 상태를 준다.
        */}
        <Link
          href={routes.translations(slug, { ns: item.namespace, focus: item.locale })}
          className="focus-visible:ring-ring text-sm underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
        >
          {m.home.activity.edit(item.actor, item.key, item.locale)}
        </Link>
        {when}
      </div>
    );
  }

  if (item.kind === "publish") {
    return (
      <div className={row}>
        <span className="text-sm">
          {m.home.activity.publish}
          {item.prUrl !== null && (
            <>
              {" — "}
              <a
                href={item.prUrl}
                target="_blank"
                rel="noreferrer"
                className="focus-visible:ring-ring inline-flex items-baseline gap-1 text-blue-600 underline focus-visible:ring-[3px] focus-visible:outline-none"
              >
                {m.home.activity.pr}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
        </span>
        {when}
      </div>
    );
  }

  return (
    <div className={row}>
      <span className="text-sm">{m.home.activity.push}</span>
      {when}
    </div>
  );
}

/**
 * ⚠️ **`at`만으로는 키가 겹친다** — 같은 시각의 편집 둘이 있을 수 있고(한 번의 저장이 여러 로케일을
 * 만지지는 않지만 시각 해상도가 밀리초다), push·publish는 종류가 유일해도 편집과 같은 시각일 수 있다.
 */
function activityKey(item: ActivityItem): string {
  const at = item.at.toISOString();
  return item.kind === "edit" ? `edit:${at}:${item.key}:${item.locale}` : `${item.kind}:${at}`;
}
