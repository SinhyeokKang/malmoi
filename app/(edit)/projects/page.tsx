import { Box, FolderGit2, Plus, RotateCcw, Search } from "lucide-react";
import Link from "next/link";

import { ProjectSearch } from "@/components/projects/search-input";
import { ContentPanel, PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedLinks } from "@/components/ui/segmented-control";
import { toneFill } from "@/components/ui/tone";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { loadProjectList } from "@/lib/keys/query";
import {
  filterProjects,
  parseProjectFilter,
  PROJECT_FILTERS,
  projectStatus,
  searchProjects,
  type ProjectFilter,
  type ProjectStatus,
} from "@/lib/projects/list";
import { routes } from "@/lib/routes";
import { firstQueryValue } from "@/lib/search-params";
import { cn } from "@/lib/utils";

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
 * ⚠️ **amber는 `Disconnected` 하나뿐이다** (2026-09-11 사용자 — `Setup`·`Pending`을 무색으로
 * 내렸다). 축이 "덜 됐나"가 아니라 **"깨졌나"**다: 앞의 둘은 새 프로젝트가 지나가는 정상 경로이고
 * 시간이 지나면 저절로 `Active`가 되지만, `Disconnected`는 **한때 돌던 것이 멈춘 것**이라
 * 사람이 손대야 풀린다. 셋 다 amber면 온보딩 중인 프로젝트가 고장난 것처럼 보인다.
 *
 * ⚠️ **`Active`가 초록이다**. DESIGN §6.1("가장 흔한 상태가 가장 조용하다")의 예외이고 근거는
 * **이 목록이 훑어보는 화면**이라는 것 — 손볼 프로젝트가 튀어나오려면 정상인 것도 색을 들어
 * 대비가 생겨야 한다. green은 §6.2에 새로 등재됐다.
 *
 * ⚠️ **삼항이 아니라 맵 + `satisfies`다** (`lib/auth/landing.ts`와 같은 관용구). 갈래가 늘면 키가
 * 없어 컴파일 에러가 나는데, 삼항이면 새 갈래가 **사유 없이** 기본값으로 떨어지고 `tsc`가 조용하다.
 */
const STATUS_VARIANT = {
  active: "success",
  archived: "neutral",
  setup: "neutral",
  awaiting_first_sync: "neutral",
  needs_reconnect: "warning",
} as const satisfies Record<ProjectStatus, "neutral" | "warning" | "success">;

/**
 * 탭 라벨 — `all`만 자기 문구를 갖고 나머지 다섯은 **행 배지와 같은 낱말**을 쓴다 (2026-09-11).
 * 두 벌로 두면 "지금 무엇을 보고 있나"가 탭과 행에서 다르게 읽힌다.
 */
function filterLabel(filter: ProjectFilter): string {
  return filter === "all" ? m.projects.filter.all : m.projects.status[filter];
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string | string[]; filter?: string | string[]; q?: string | string[] }>;
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
  const search = await searchParams;
  const e = firstQueryValue(search.e);
  const rawFilter = firstQueryValue(search.filter);
  const q = firstQueryValue(search.q);
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
  // ⚠️ **필터 → 검색 순이다.** 두 축이 직교하므로 순서가 결과를 바꾸지는 않지만, 빈 결과의 문구가
  // "검색 0건"인지 "탭 0건"인지는 아래에서 `q`를 먼저 보고 가른다.
  const rows = searchProjects(filterProjects(all, filter), q);
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
        ⚠️ **본문 랜드마크는 `ContentPanel`이 든다** (2026-09-11). 8-2가 이 화면의 랜드마크를 패널로
        갈아끼우면서 목록만 그것을 잃었고 2026-09-11에 페이지가 자기 것을 다시 달았는데, 같은 날
        패널 자신이 랜드마크가 되면서 그 자리가 위로 올라갔다 — 화면이 자기 것을 들면 이제 중첩이다.
        (`shell-layout.test.ts`가 소스에서 그 태그 문자열을 세므로 주석에도 적지 않는다.)

        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        `max-w-4xl`을 쓰는 형제들과 달리 이 화면은 fluid라(§5.1) 안쪽 래퍼가 없고, 여백을
        `PanelHeader`·`PanelBody`가 직접 든다.
      */}
      <PanelHeader className="flex flex-col gap-4 px-6 pt-6 pb-3">
        {/* 페이지 수준 거부는 **global Alert**다 — 목록 위 전폭 (DESIGN §6.4). */}
        {message !== null && <Alert variant="danger">{message}</Alert>}

        {/*
          ⚠️ **[New project]가 제목 줄에 있다** (2026-09-11 사용자). 화면당 하나인 primary는 제목과
          같은 높이에 서는 것이 이 리포의 형이고(Home의 [Open translations]와 같다), 아래 줄은
          **보기를 좁히는 것들**(탭·검색)만 남아 두 줄의 역할이 갈린다.
        */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-medium">{m.common.nav.projects}</h1>
            {/*
              ⚠️ **총계는 필터 전의 값이다** — 탭·검색을 바꿔도 안 흔들려야 "내 프로젝트가 몇 개인가"에
              답한다. 사이드바 카운트 배지(SAAS §8 🔒)와 달리 이건 이미 가진 배열의 길이다.
            */}
            <Badge variant="neutral">{all.length}</Badge>
          </div>
          {hasProjects && (
            <ButtonLink variant="primary" href={routes.newProject()}>
              <Plus aria-hidden />
              {m.common.nav.newProject}
            </ButtonLink>
          )}
        </div>

        {hasProjects && (
          <div className="flex items-center justify-between gap-2">
            {/*
              ⚠️ **여섯 칸이 늘 그대로다** (2026-09-11 사용자 — 존재하는 상태만 그리던 것을 되돌렸다).
              칸이 데이터에 따라 생겼다 사라지면 컨트롤의 자리가 매번 달라지고, "그 상태가 0건"이라는
              사실 자체도 정보다 — 누르면 빈 상태가 그것을 문장으로 말한다.
            */}
            <SegmentedLinks
              label={m.projects.filter.label}
              current={filter}
              options={PROJECT_FILTERS.map((value) => ({
                value,
                label: filterLabel(value),
                /**
                 * 기본값을 URL에 안 싣는다 — `/projects`와 `/projects?filter=all`이 같은 화면이다.
                 *
                 * ⚠️ **탭을 옮겨도 `q`가 남는다** — 검색이 탭과 직교하는 축이라, 여기서 떨어뜨리면
                 * 탭을 누르는 순간 질의가 조용히 사라진다.
                 */
                href: routes.projects({ filter: value === "all" ? undefined : value, q }),
              }))}
            />
            <ProjectSearch filter={filter === "all" ? undefined : filter} q={q} />
          </div>
        )}
      </PanelHeader>

      {/*
        ⚠️ **`flex-1`을 여기서 다시 주지 않는다** — `PanelBody`가 이미 `min-h-0 flex-1`을 든다.
        빈 상태가 패널 세로 중앙에 서는 것(시안)은 그 `flex-1`이 만든다. `EmptyState` 안에
        `h-full`을 박지 않는 이유는 그 컴포넌트가 표 안에서도 쓰여서다 — 중앙 정렬은 자리마다 다르다.
      */}
      <PanelBody className="flex flex-col px-6 pt-3 pb-8">
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
            ⚠️ **"프로젝트가 없다"와 다른 상태다** — 탭이나 질의를 되돌리면 있다. 같은 빈 화면을
            내면 사용자가 프로젝트를 잃었다고 읽는다. 그래서 **형은 같고 액션이 반대다**:
            그쪽은 primary로 만들라 하고, 여기는 outlined(`default`)로 되돌리라 한다. ghost가 아닌
            이유는 이 화면에 **버튼이 그것 하나뿐**이어서다 — 유일한 출구가 배경 없는 글자면
            누를 것으로 안 보인다.

            ⚠️ **설명이 검색을 먼저 본다** — 질의가 있으면 되돌릴 것은 탭이 아니라 그 질의다.
            탭 문구를 내면 사용자가 엉뚱한 컨트롤을 만진다.

            ⚠️ **[Clear filters]가 둘 다 지운다** — 어느 쪽이 걸렸는지 사용자가 판정하게 하지 않는다.
            `routes.projects()`가 인자 없이 곧 초기 상태라, 화면이 무엇을 비울지 나열하지 않는다.
          */
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Search}
              title={m.projects.narrowed.title}
              description={
                q !== undefined && q.trim() !== ""
                  ? m.projects.narrowed.bySearch(q.trim())
                  : m.projects.narrowed.byFilter
              }
              action={
                <ButtonLink variant="default" href={routes.projects()}>
                  {/*
                    ⚠️ **`RotateCcw`이고 `FilterX`가 아니다** — 이 버튼은 필터만이 아니라 검색까지
                    **둘 다** 되돌린다. 깔때기 글리프면 지워지는 것이 필터뿐이라고 말하게 된다.
                  */}
                  <RotateCcw aria-hidden />
                  {m.projects.narrowed.reset}
                </ButtonLink>
              }
            />
          </div>
        ) : (
          /*
            ⚠️ **`shrink-0`이 없으면 아래 행이 잘린다.** `overflow-hidden`을 든 flex 자식은 CSS의
            automatic minimum size가 적용되지 않아 축소 하한이 0이다 — 내용 높이 대신 남은 공간까지
            줄어들고, 넘친 행은 `<ul>` **안에** 감춰져 바깥 패널에 스크롤조차 생기지 않는다
            (실측 2026-09-11: 프로젝트 2개·1280×360에서 clientHeight 124 / scrollHeight 161).
            `overflow-hidden` 자체는 남긴다 — `rounded-xl`이 첫·끝 행의 모서리를 자르는 수단이다.
          */
          <ul className="divide-border border-border divide-y shrink-0 overflow-hidden rounded-lg border">
            {rows.map((row) => {
              const status = projectStatus(row);
              return (
                <li key={row.slug}>
                  <Link
                    href={routes.project(row.slug)}
                    /**
                     * ⚠️ **링이 `ring-inset`이다** (2026-09-11 실측). 링은 box-shadow라 요소 **밖으로**
                     * 3px 퍼지는데 부모 `<ul>`이 `overflow-hidden`이라 그 3px이 통째로 잘려
                     * **키보드 사용자에게 포커스가 아예 안 보였다.** 부모의 `overflow-hidden`은
                     * `rounded-lg`가 첫·끝 행의 모서리를 자르는 수단이라 뗄 수 없으므로,
                     * 링을 안쪽으로 그린다.
                     */
                    className="hover:bg-foreground/[0.03] focus-visible:ring-ring flex items-center justify-between gap-2.5 py-3.5 pr-3.5 pl-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
                  >
                    {/*
                      프로젝트 이미지 자리 — **지금은 빈 상태뿐이다** (2026-09-11 사용자).
                      업로드 기능이 없으므로 컨테이너(28)와 폴백 글리프(16)만 세운다: 자리를 먼저 잡아야
                      나중에 이미지가 들어올 때 행 높이·정렬이 안 흔들린다.

                      ⚠️ **`Avatar` 프리미티브를 쓰지 않는다** — 그쪽 폴백은 **이니셜**이고
                      (`shape="square"`가 프로젝트용으로 이미 있다), 여기 요구는 글리프다. 이미지가
                      실제로 붙는 사이클에 둘을 합칠지 정한다.

                      ⚠️ **글리프가 `Box`이고 사이드바의 `Projects` 항목과 같다** (2026-09-11 사용자) —
                      같은 대상을 가리키는 두 자리가 같은 글리프여야 "프로젝트"의 시각 어휘가 하나로
                      남는다. 화면의 **빈 상태**만 `FolderGit2`를 계속 쓴다: 그 자리는 큰 글리프라
                      획이 뭉치지 않고, 말하는 것도 "프로젝트 하나"가 아니라 "아직 없다"이다.

                      ⚠️ **표면을 아예 안 그린다 — 배경도 border도 그림자도 없다** (2026-09-11 사용자).
                      빈 상태에서 보이는 것은 **글리프 하나뿐**이다: 컨테이너를 그리면 행마다
                      "여기 이미지가 없다"를 외치게 되고, 그건 이 화면이 답할 질문이 아니다.
                      **자리(28)와 `rounded-sm`은 남긴다** — 이미지가 붙을 때 행 높이·정렬이
                      흔들리지 않아야 하고, 그때 이 span이 그대로 그 이미지의 틀이 된다.

⚠️ **연하게 할 일이 생기면 색 알파가 아니라 요소 `opacity`다** (2026-09-11 실측).
                      lucide 글리프는 `<path>`·`<circle>` **여러 요소**라 `text-foreground/40` 같은
                      색 알파를 쓰면 획이 만나는 접점에서 알파가 **누적돼 그 점만 진해진다**.
                      `opacity`는 요소를 별도 레이어로 렌더한 뒤 합성하므로 내부 겹침이 먼저
                      해소된다. **다중 요소 아이콘에는 색 알파를 쓰지 않는다.**
                    */}
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm",
                        /**
                         * ⚠️ **색이 프로젝트 이름에서 온다** — 사용자 아바타와 **같은 판정**
                         * (`lib/tone.ts`)이고 입력만 다르다. 목록을 훑을 때 행을 가르는 것이
                         * 이름 글자보다 색이 먼저라, 회색 글리프가 여덟 줄 반복되면 아무것도
                         * 안 가른다.
                         *
                         * ⚠️ **아바타와 같은 형이다** — 채운 배경 + 흰 글리프(`toneFill`).
                         * 이미지가 붙는 날 이 배경이 그대로 그 이미지의 자리가 된다.
                         */
                        "text-white",
                        toneFill(row.name),
                      )}
                    >
                      <Box className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-base font-medium">{row.name}</span>
                      {/*
                        메타 한 줄 — **URL · 역할 · 멤버 수** (2026-09-11 사용자). 리포가 맨 앞인
                        것은 그것이 이 행을 **식별**하는 값이어서다: 이름이 비슷한 프로젝트 둘을
                        가르는 것이 리포이고, 역할·멤버 수는 그 프로젝트에 대한 서술이다.

                        배지가 아니라 평문인 이유는 역할이 *사실*이고 행마다 늘 있어서다: 배지로
                        만들면 우측에 상태와 나란히 놓여 어느 쪽이 "지금 벌어지는 일"인지 흐려진다.

                        ⚠️ **리포 URL이 링크가 아니다** — 행 전체가 이미 `<a>`라 중첩할 수 없다.
                        누르면 GitHub이 아니라 프로젝트로 간다.
                      */}
                      <span className="text-muted-foreground truncate text-sm">
                        {`https://github.com/${row.repoOwner}/${row.repoName}`}
                        {" · "}
                        {m.projects.role[row.role]}
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
      </PanelBody>
    </ContentPanel>
  );
}
