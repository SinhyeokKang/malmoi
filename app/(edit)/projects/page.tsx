import { FolderGit2, Plus } from "lucide-react";
import Link from "next/link";

import { ContentPanel } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedLinks } from "@/components/ui/segmented-control";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { loadProjectList } from "@/lib/keys/query";
import {
  filterProjects,
  PROJECT_FILTERS,
  parseProjectFilter,
  projectStatus,
  type ProjectStatus,
} from "@/lib/projects/list";
import { routes } from "@/lib/routes";

/**
 * 내 프로젝트 목록. **로그인 후 착지점**이고, 인가 거부의 redirect 목적지다.
 * 시안은 Figma `206:883`이고 시각 규칙은 DESIGN §6.63이다.
 *
 * ⚠️ **`requireProjectAccess`를 지나지 않는다 — 지날 대상이 없다.** 이 화면은 특정 프로젝트가
 * 아니라 "내 멤버십"을 보여주므로 인가 단위가 사용자다. 그래서 `requireUser`가 쓰인다.
 *
 * ⚠️ **필터는 URL이고 클라이언트 상태가 아니다** (8-3). 서버가 이미 걸러 그리므로 이 파일에
 * `"use client"`가 없고, 그래야 뒤로가기·공유·새로고침이 그냥 된다.
 *
 * ⚠️ **fluid다** — `max-w-4xl`이 아니다 (8-3, DESIGN §5.1). 행이 2줄이고 메타에 리포 URL이 들어가
 * 896px에서는 그 줄이 잘린다.
 */
/**
 * 상태 배지의 색 (8-3).
 *
 * ⚠️ **`warning`은 "누군가 뭔가를 더 해야 끝나는" 둘에만 붙는다.** `Archived`는 의도된 상태라
 * amber로 칠하면 문제처럼 읽히고, `Active`는 가장 흔한 상태라 조용해야 한다 (DESIGN §6.1).
 * amber는 §6.2에 이미 등재된 색이라 raw 색이 늘지 않는다.
 *
 * ⚠️ **삼항이 아니라 맵 + `satisfies`다** (`lib/auth/landing.ts`와 같은 관용구). 갈래가 늘면 키가
 * 없어 컴파일 에러가 나는데, 삼항이면 새 갈래가 **사유 없이** 기본값으로 떨어지고 `tsc`가 조용하다.
 */
const STATUS_VARIANT = {
  active: "neutral",
  archived: "neutral",
  setup: "warning",
  awaiting_first_sync: "warning",
  needs_reconnect: "warning",
} as const satisfies Record<ProjectStatus, "neutral" | "warning">;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; filter?: string }>;
}) {
  const { userId } = await requireUser();
  /**
   * `requireProjectAccess`가 거부 사유를 `?e=`로 넘긴다. 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시.
   *
   * ⚠️ **GitHub 연결 실패도 여기로 온다.** state가 무효면 돌아갈 slug를 믿을 수 없어 callback이
   * 이 화면으로 보낸다 (design §3.5). `isAccessError` 하나만 보면 그 사유가 **통째로 무음**이고,
   * 사용자에게는 버튼이 안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06). 두 union은 `unavailable`
   * 하나만 겹치고 뜻이 같으므로 먼저 보는 쪽이 이겨도 문제가 없다.
   */
  const { e, filter: rawFilter } = await searchParams;
  const message = isAccessError(e)
    ? accessErrorMessage(e)
    : isConnectError(e)
      ? connectErrorMessage(e)
      : null;
  const filter = parseProjectFilter(rawFilter);

  /**
   * ⚠️ **GitHub 계정 섹션이 2026-09-09에 `/account`로 갔다** (6b-4 — SAAS §7.7). 그것이 여기 있었던
   * 이유는 "프로젝트를 하나도 안 만든 사용자에게 도달 가능한 자리가 여기뿐"이어서였고(2026-09-07
   * 리뷰 🟡9), 사용자 축 라우트가 생기면서 그 이유가 사라졌다. **옮긴 것이지 복제가 아니다** —
   * 두 자리에 두면 하나가 낡는다 (6b-2가 초대 폼을 지운 근거와 같다).
   *
   * ⚠️ **셸의 `loadMemberships`와 다른 함수다** — 그쪽에 목록 전용 집계를 얹으면 모든 페이지가 문다.
   */
  const all = await loadProjectList(getPrisma(), userId);
  const rows = filterProjects(all, filter);
  /**
   * ⚠️ **프로젝트가 하나도 없으면 필터와 [New project]를 그리지 않는다** (시안: 그 줄이 `hidden`).
   * 고를 것이 없는 탭 셋은 죽은 컨트롤이고, 만들기 버튼은 그때 빈 상태 안에 하나만 있어야 한다 —
   * 둘을 다 두면 같은 행동이 한 화면에 두 번 나온다 (§6.4 "액션은 버튼 하나").
   */
  const hasProjects = all.length > 0;

  return (
    /**
     * ⚠️ **여기만 페이지가 패널을 든다** (8-2). 형제 셋(`/account`·`/projects/new`·`/projects/[slug]`)은
     * 각자 레이아웃이 드는데, 이 화면은 `projects/` 디렉터리를 `[slug]`와 공유해서 그 층에
     * 레이아웃을 두면 프로젝트 화면이 **두 겹**으로 감싸인다. 라우트마다 정확히 하나인지는
     * `__tests__/shell-layout.test.ts`가 체인을 훑어 센다.
     */
    <ContentPanel>
      {/*
        ⚠️ **본문 랜드마크를 페이지가 든다.** 8-2가 이 화면의 `<main>`을 `ContentPanel`로 갈아끼우면서
        목록만 랜드마크를 잃었고, 다른 화면 아홉은 각자 자기 것을 들고 있었다 — 눈으로는 차이가 없고
        스크린리더의 "본문으로 건너뛰기"만 이 화면에서 안 들었다 (Codex 리뷰 2026-09-11 실측).
        패널을 통째로 `<main>`으로 바꾸지 않는 이유는 그 아홉과 중첩되기 때문이다.

        ⚠️ **`min-h-0`을 주지 않는다** — 스크롤은 패널이 들고, 이 열이 콘텐츠보다 작아지도록 허락하면
        넘친 행이 패널의 스크롤 영역에 안 들어온다.
      */}
      <main className="flex flex-1 flex-col">
        {/*
          패널 안 상단은 시안의 `fixed` 블록이다 — `pt-6 pb-3 px-4`. 스크롤은 패널이 들고 이 블록은
          지금 고정되지 않는다.
        */}
        <div className="flex flex-col gap-4 px-4 pt-6 pb-3">
          {/* 페이지 수준 거부는 **global Alert**다 — 목록 위 전폭 (DESIGN §6.4). */}
          {message !== null && <Alert variant="danger">{message}</Alert>}

          <div className="flex items-center gap-2">
            <h1 className="text-xl font-medium">{m.projects.title}</h1>
            {/*
              ⚠️ **총계는 필터 전의 값이다** — 탭을 바꿔도 안 흔들려야 "내 프로젝트가 몇 개인가"에
              답한다. 사이드바 카운트 배지(SAAS §8 🔒)와 달리 이건 이미 가진 배열의 길이다.
            */}
            <Badge variant="neutral">{all.length}</Badge>
          </div>

          {hasProjects && (
          <div className="flex items-center justify-between gap-2">
            <SegmentedLinks
              label={m.projects.filter.label}
              current={filter}
              options={PROJECT_FILTERS.map((value) => ({
                value,
                label: m.projects.filter[value],
                // 기본값을 URL에 안 싣는다 — `/projects`와 `/projects?filter=all`이 같은 화면이다.
                href: routes.projects({ filter: value === "all" ? undefined : value }),
              }))}
            />
            <ButtonLink variant="primary" href={routes.newProject()}>
              <Plus aria-hidden />
              {m.common.nav.newProject}
            </ButtonLink>
          </div>
          )}
        </div>

        {/*
          ⚠️ **`flex-1`이 여기 있어야 빈 상태가 패널 세로 중앙에 선다** (시안). `EmptyState` 안에
          `h-full`을 박지 않는 이유는 그 컴포넌트가 표 안에서도 쓰여서다 — 중앙 정렬은 자리마다 다르다.
        */}
        <div className="flex flex-1 flex-col px-4 pt-3 pb-8">
          {!hasProjects ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={FolderGit2}
                title={m.projects.empty.title}
                description={m.projects.empty.description}
                action={
                  <ButtonLink variant="primary" href={routes.newProject()}>
                    <Plus aria-hidden />
                    {m.common.nav.newProject}
                  </ButtonLink>
                }
              />
            </div>
          ) : rows.length === 0 ? (
            /*
              ⚠️ **"프로젝트가 없다"와 다른 상태다** — 탭을 바꾸면 있다. 같은 빈 화면을 내면
              사용자가 프로젝트를 잃었다고 읽는다.
            */
            <p className="text-muted-foreground py-8 text-center text-sm">
              {filter === "archived" ? m.projects.filterEmpty.archived : m.projects.filterEmpty.active}
            </p>
          ) : (
            /*
              ⚠️ **`shrink-0`이 없으면 아래 행이 잘린다.** `overflow-hidden`을 든 flex 자식은 CSS의
              automatic minimum size가 적용되지 않아 축소 하한이 0이다 — 내용 높이 대신 남은 공간까지
              줄어들고, 넘친 행은 `<ul>` **안에** 감춰져 바깥 패널에 스크롤조차 생기지 않는다
              (실측 2026-09-11: 프로젝트 2개·1280×360에서 clientHeight 124 / scrollHeight 161).
              `overflow-hidden` 자체는 남긴다 — `rounded-xl`이 첫·끝 행의 모서리를 자르는 수단이다.
            */
            <ul className="divide-border border-border divide-y shrink-0 overflow-hidden rounded-xl border">
              {rows.map((row) => {
                const status = projectStatus(row);
                return (
                  <li key={row.slug}>
                    <Link
                      href={routes.project(row.slug)}
                      className="hover:bg-foreground/[0.03] focus-visible:ring-ring flex items-center justify-between gap-4 p-4 focus-visible:ring-[3px] focus-visible:outline-none"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-base font-medium">{row.name}</span>
                        {/*
                          메타 한 줄 — **역할이 맨 앞이다** (시안 개정). 배지가 아니라 평문인 이유는
                          역할이 *사실*이고 행마다 늘 있어서다: 배지로 만들면 우측에 상태와 나란히
                          놓여 어느 쪽이 "지금 벌어지는 일"인지 흐려진다.

                          ⚠️ **리포 URL이 링크가 아니다** — 행 전체가 이미 `<a>`라 중첩할 수 없다.
                          누르면 GitHub이 아니라 프로젝트로 간다.
                        */}
                        <span className="text-muted-foreground truncate text-sm">
                          {m.projects.role[row.role]}
                          {" · "}
                          {`https://github.com/${row.repoOwner}/${row.repoName}`}
                          {" · "}
                          {m.projects.memberCount(row.memberCount)}
                        </span>
                      </span>
                      {/*
                        ⚠️ **배지가 항상 하나다** — 갈래는 `projectStatus`가 정한다(보관이 readiness보다
                        앞이다). 보관을 목록에서 숨기지 않는 7단계 결정은 그대로다: 숨기면 OWNER가
                        되돌릴 링크에 도달할 길이 없어지고, `Archived` 탭이 생겨도 기본은 `all`이다.
                      */}
                      <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
                        {m.projects.status[status]}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </ContentPanel>
  );
}
