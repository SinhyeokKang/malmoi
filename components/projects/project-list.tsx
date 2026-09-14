import {
  ArrowDownToLine,
  Box,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  Eye,
  FolderGit2,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  Languages,
  Plus,
  RotateCcw,
  Search,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyProjects } from "@/components/projects/empty-projects";
import { LocaleMeter } from "@/components/projects/locale-meter";
import { ProjectSearch } from "@/components/projects/search-input";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toneFill } from "@/components/ui/tone";
import { canPerform } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import type { ProjectListRow } from "@/lib/keys/query";
import { importFailureMessage } from "@/lib/projects/import-status";
import {
  groupProjects,
  highlightName,
  meterSlot,
  projectStatus,
  rowBanner,
  searchProjects,
  type ProjectGroup,
  type ProjectStatus,
  type RowBanner,
  type SummaryQueue,
} from "@/lib/projects/list";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * 프로젝트 목록의 **본문** — 머리와 그룹 셋. 시안은 Claude Design `design_handoff_projects_list/`의
 * `Projects.dc.html`(아트보드 `1a`·`1b`·`1c`·`3a`·`3b`)이고 치수표는 DESIGN §6.63이다.
 *
 * ⚠️ **`<ContentPanel>`을 여기서 들지 않는다.** 두 라우트(`/projects`·`/projects/new`)가 이것을
 * 그리는데, 공유 컴포넌트가 패널을 들면 `shell-layout.test.ts`의 "라우트마다 정확히 하나"가 두
 * 페이지 모두에서 **0**이 된다 — 패널은 페이지가 각자 든다.
 *
 * ⚠️ **서버 컴포넌트다.** 검색은 URL이고 클라이언트 상태가 아니라 `"use client"`가 없고, 그래야
 * 뒤로가기·공유·새로고침이 그냥 된다.
 *
 * ⚠️ **`<form>`을 만들지 않는다** — 검색은 `SearchInput` 프리미티브 그대로다. 제출 버튼이 없는
 * `<form>`이 Enter를 조용히 무효로 만든 전례가 있다 (POSTMORTEM 2026-09-08).
 *
 * ⚠️ **fluid다** — `max-w-4xl`이 아니다 (DESIGN §5.1). 이름 칸 420 + Meter 셋 + 우측 배지가
 * 896px에서는 겹친다.
 */

/**
 * 상태 배지의 색 (8-3).
 *
 * ⚠️ **amber는 `Disconnected` 하나뿐이다** (2026-09-11 사용자 — `Setup`·`Pending`을 무색으로
 * 내렸다). 축이 "덜 됐나"가 아니라 **"깨졌나"**다: 앞의 둘은 새 프로젝트가 지나가는 정상 경로이고
 * 시간이 지나면 저절로 `Active`가 되지만, `Disconnected`는 **한때 돌던 것이 멈춘 것**이라
 * 사람이 손대야 풀린다.
 *
 * ⚠️ **`Active`가 초록이다**. DESIGN §6.1("가장 흔한 상태가 가장 조용하다")의 예외이고 근거는
 * **이 목록이 훑어보는 화면**이라는 것 — 손볼 프로젝트가 튀어나오려면 정상인 것도 색을 들어
 * 대비가 생겨야 한다.
 *
 * ⚠️ **삼항이 아니라 맵 + `satisfies`다** (`lib/auth/landing.ts`와 같은 관용구). 갈래가 늘면 키가
 * 없어 컴파일 에러가 나는데, 삼항이면 새 갈래가 **사유 없이** 기본값으로 떨어지고 `tsc`가 조용하다.
 */
const STATUS_CHIP = {
  active: { variant: "success", tone: "" },
  /**
   * ⚠️ **보관만 `#737373`이고 나머지 무색 둘은 `#525252`다** (캔버스 `1c`). `Badge neutral`의 기본
   * 글자색은 foreground(`#0a0a0a`)이므로 셋 다 호출부에서 내린다 — 프리미티브를 바꾸면 이 루프가
   * 보지 않은 화면의 배지가 함께 움직인다.
   */
  archived: { variant: "neutral", tone: "text-muted-foreground" },
  setup: { variant: "neutral", tone: "text-neutral-600" },
  awaiting_first_sync: { variant: "neutral", tone: "text-neutral-600" },
  needs_reconnect: { variant: "warning", tone: "" },
} as const satisfies Record<ProjectStatus, { variant: "neutral" | "warning" | "success"; tone: string }>;

const GROUP_LABEL = {
  needs_attention: m.projects.group.needsAttention,
  all_set: m.projects.group.allSet,
  // ⚠️ 행 배지와 **같은 낱말**이다 — 두 벌로 두면 하나가 낡는다.
  archived: m.projects.archived,
} as const satisfies Record<ProjectGroup, string>;

export function ProjectList({
  all,
  summary,
  q,
  message = null,
}: {
  all: readonly ProjectListRow[];
  /** 검색 전 전체 멤버십(보관 제외)의 합계 넷. **검색·그룹에 흔들리지 않는다.** */
  summary: SummaryQueue;
  q?: string;
  /** 페이지 수준 거부. 모달 라우트는 사유를 모달 안에서 말하므로 여기로 안 넘긴다. */
  message?: ReactNode;
}) {
  const query = (q ?? "").trim();
  const rows = searchProjects(all, q);
  const grouped = groupProjects(rows, q);
  /**
   * ⚠️ **프로젝트가 하나도 없으면 검색·Summary·[New project]를 그리지 않는다** (시안 `1a`).
   * 좁힐 것이 없는 검색창과 0만 넷인 Summary는 죽은 컨트롤이고, 만들기 버튼은 그때 빈 상태 안에
   * 하나만 있어야 한다 (§6.4 "액션은 버튼 하나").
   */
  const hasProjects = all.length > 0;

  return (
    <>
      <PanelHeader className="flex flex-col gap-4 px-6 pt-6 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-medium">{m.common.nav.projects}</h1>
            {/*
              ⚠️ **총계는 좁히기 전의 값이다** — 검색을 바꿔도 안 흔들려야 "내 프로젝트가 몇 개인가"에
              답한다. 사이드바 카운트 배지(PRODUCT 🔒)와 달리 이건 이미 가진 배열의 길이다.
            */}
            <Badge variant="neutral">{all.length}</Badge>
          </div>
          {hasProjects && (
            <>
              {/* ⚠️ **`ml-auto`가 검색에 붙는다** — 제목과 컨트롤 사이의 빈 공간이 흔들리는 자리다. */}
              <div className="ml-auto">
                <ProjectSearch q={q} />
              </div>
              <ButtonLink variant="primary" href={routes.newProject({ q })}>
                <Plus aria-hidden />
                {m.common.nav.newProject}
              </ButtonLink>
            </>
          )}
        </div>

        {/*
          페이지 수준 거부는 **global Alert**다 (DESIGN §6.4).
          ⚠️ **제목 줄 아래·Summary 위다** — 목록은 그대로 살아 있고, 거부 사유가 화면 밖으로 밀려나면
          사용자는 버튼이 안 눌린 것으로 본다 (POSTMORTEM 2026-09-06).
        */}
        {message !== null && <Alert variant="danger">{message}</Alert>}

        {hasProjects && <SummaryRow summary={summary} />}
      </PanelHeader>

      {/*
        ⚠️ **`flex-1`을 여기서 다시 주지 않는다** — `PanelBody`가 이미 `min-h-0 flex-1`을 든다.
        빈 상태가 패널 세로 중앙에 서는 것(시안)은 그 `flex-1`이 만든다.
      */}
      {/*
        ⚠️ **0건일 때 본문 여백이 다르다** (캔버스 `1a`: `0 12 12`) — 그라데이션 면이 패널 안쪽에
        12를 두고 앉아야 패널의 radius 16 안에 카드의 12가 겹친다. 목록이 설 때의 `12 24 20`을
        그대로 쓰면 그 면이 안쪽으로 밀려 패널 테두리와 사이가 벌어진다.
      */}
      <PanelBody className={hasProjects ? "flex flex-col gap-5 px-6 pt-3 pb-5" : "flex px-3 pt-0 pb-3"}>
        {!hasProjects ? (
          <EmptyProjects />
        ) : rows.length === 0 ? (
          /*
            ⚠️ **"프로젝트가 없다"와 다른 상태다** — 질의를 되돌리면 있다. 같은 빈 화면을 내면
            사용자가 프로젝트를 잃었다고 읽는다. 그래서 **형은 같고 액션이 반대다**: 그쪽은
            primary로 만들라 하고, 여기는 되돌리라 한다.

            ⚠️ **액션이 둘이다** (시안 `3b` — DESIGN §6.4의 "버튼 하나"에 등재할 예외). 검색을
            되돌리는 것과 새로 만드는 것은 **다른 출구**이고, 여기까지 온 사람에게 둘 다 말이 된다.
          */
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Search}
              title={m.projects.narrowed.title}
              description={m.projects.narrowed.bySearch(query)}
              action={
                <>
                  <ButtonLink variant="default" href={routes.projects()}>
                    {/*
                      ⚠️ **`RotateCcw`이고 `FilterX`가 아니다** — 되돌릴 축이 질의 하나뿐이라 깔때기
                      글리프가 가리킬 대상이 없다. 이 버튼이 말하는 것은 **"질의를 되돌린다"**다.
                    */}
                    <RotateCcw aria-hidden />
                    {m.projects.narrowed.reset}
                  </ButtonLink>
                  <ButtonLink variant="primary" href={routes.newProject()}>
                    <Plus aria-hidden />
                    {m.common.nav.newProject}
                  </ButtonLink>
                </>
              }
            />
          </div>
        ) : grouped.flat ? (
          /*
            ⚠️ **검색 중에는 평평하다** (design §2). 결과가 그룹 셋으로 흩어지면 "몇 개 찾았나"를
            사용자가 더해야 하고, 이 화면이 답할 질문은 "어느 그룹인가"가 아니라 "찾았나"다.
          */
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              {m.projects.searchResult(rows.length, all.length)}{" "}
              {/* ⚠️ **질의만 foreground다** — 무엇으로 좁혔는지가 이 줄에서 유일하게 가변인 값이다. */}
              <span className="text-foreground">{query}</span>
              <Link href={routes.projects()} className="ml-1 text-blue-600">
                {m.projects.clearSearch}
              </Link>
            </p>
            <ProjectCard rows={grouped.rows} q={q} />
          </div>
        ) : (
          grouped.groups.map(([group, list]) => (
            <section key={group} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">{GROUP_LABEL[group]}</h2>
                <Badge variant="neutral">{list.length}</Badge>
              </div>
              <ProjectCard rows={list} />
            </section>
          ))
        )}
      </PanelBody>
    </>
  );
}

/**
 * 머리의 합계 넷 (시안 `1b`).
 *
 * ⚠️ **누를 수 없다** — hover도, cursor도, 테두리도 없다. 계정 단위 큐 화면이 생기기 전까지는
 * 표시 전용이고(열린 결정 1), 링크로 만들면 아직 없는 화면을 가리키게 된다.
 *
 * ⚠️ **구분선이 별개 요소다** — `divide-x`로 만들면 칸의 padding에 붙어 시안의 `gap 24` 한가운데에
 * 서지 않는다.
 */
function SummaryRow({ summary }: { summary: SummaryQueue }) {
  /**
   * ⚠️ **순서가 파이프라인이다** — GitHub에서 유입 → 번역 → 검토 → 발송. 왼쪽에서 오른쪽이 실제
   * 작업 순서라 **순서 자체가 정보**다.
   *
   * ⚠️ **첫 칸만 파랑이다** (`#2563eb` — 아이콘과 숫자 둘 다). 넷 중 유일하게 **내가 만들지 않은
   * 변화**라서다. 나머지 셋은 내가 쌓아 둔 일이고 색이 필요 없다.
   */
  const cells = [
    {
      icon: ArrowDownToLine,
      label: m.projects.summary.newFromGithub,
      /**
       * ⚠️ **0이면 부호를 붙이지 않는다.** `+0`은 "새로 들어온 것이 있다"를 말하게 되는데 그 값이
       * 뜻하는 것은 반대다. 캔버스에 0 갈래가 없어 여기서 정한다.
       */
      value: summary.newFromGithub > 0 ? `+${summary.newFromGithub}` : "0",
      tone: summary.newFromGithub > 0 ? "text-blue-600" : "",
    },
    { icon: Languages, label: m.projects.summary.toTranslate, value: summary.toTranslate, tone: "" },
    // ⚠️ **`amber-700`이고 배지의 amber-800과 다르다** (DESIGN §6.2에 등재). 알파를 쓰지 않는다 —
    // lucide는 다중 요소라 색 알파가 획 접점에서 누적된다.
    { icon: Eye, label: m.projects.summary.toReview, value: summary.toReview, tone: "text-amber-700" },
    { icon: GitPullRequestArrow, label: m.projects.summary.toSend, value: summary.toSend, tone: "" },
  ];

  return (
    <div className="border-foreground/[0.06] flex items-stretch gap-6 border-y py-3.5">
      {cells.map((cell, index) => (
        <div key={cell.label} className="contents">
          {index > 0 && <span aria-hidden className="bg-border w-px shrink-0 self-stretch" />}
          <div className="flex w-50 flex-col gap-1">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <cell.icon aria-hidden className={cn("size-3.5", cell.tone)} />
              {cell.label}
            </span>
            <span className={cn("text-xl font-medium", cell.tone)}>{cell.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 행을 담는 카드.
 *
 * ⚠️ **radius가 12이고 패널의 16이 아니다** — `rounded-lg`.
 *
 * ⚠️ **`divide-y`를 쓰지 않는다.** 띠가 행의 형제라 그 규칙이 **띠와 행 사이에도** `#e5e5e5` 선을
 * 넣는데, 시안은 거기가 `#f0f0f0`이고 행 사이만 `#e5e5e5`다. 그래서 행마다 `border-t`를 직접 준다
 * (첫 행 제외).
 *
 * ⚠️ **`shrink-0`이 없으면 아래 행이 잘린다.** `overflow-hidden`을 든 flex 자식은 CSS의 automatic
 * minimum size가 적용되지 않아 축소 하한이 0이다 — 넘친 행은 카드 **안에** 감춰져 바깥 패널에
 * 스크롤조차 생기지 않는다 (실측 2026-09-11).
 */
function ProjectCard({ rows, q }: { rows: readonly ProjectListRow[]; q?: string }) {
  return (
    /**
     * ⚠️ **`@container`가 여기다 — 뷰포트가 아니다** (design §6). 패널 폭은 뷰포트에서 사이드바 240,
     * 바깥 padding, 오른쪽 패널 320을 뺀 값이라 **같은 뷰포트가 두 폭을 만들고**, 셸이
     * `min-w-[1280px]`을 들어서 뷰포트 브레이크포인트로는 1120·940·760이 **영영 안 밟힌다**
     * (가로 스크롤이 먼저 생긴다). 실제로 변하는 것은 이 카드의 폭이다.
     */
    <ul className="border-border bg-background @container shrink-0 overflow-hidden rounded-lg border">
      {rows.map((row, index) => (
        <li key={row.slug} className={index === 0 ? "" : "border-border border-t"}>
          <ProjectRow row={row} q={q} />
        </li>
      ))}
    </ul>
  );
}

function ProjectRow({ row, q }: { row: ProjectListRow; q?: string }) {
  const status = projectStatus(row);
  const chip = STATUS_CHIP[status];
  const slot = meterSlot(row, row.meters);
  const banner = rowBanner(row);

  return (
    <>
      <Link
        href={routes.project(row.slug)}
        /**
         * ⚠️ **링이 `ring-inset`이다** (2026-09-11 실측). 링은 box-shadow라 요소 **밖으로** 3px
         * 퍼지는데 부모 카드가 `overflow-hidden`이라 그 3px이 통째로 잘려 **키보드 사용자에게
         * 포커스가 아예 안 보였다.** 그 `overflow-hidden`은 `rounded-lg`가 첫·끝 행의 모서리를
         * 자르는 수단이라 뗄 수 없으므로, 링을 안쪽으로 그린다.
         */
        className="hover:bg-foreground/[0.02] focus-visible:ring-ring flex items-center gap-4 py-3.5 pr-3.5 pl-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
      >
        {/*
          프로젝트 이미지 자리 — **지금은 빈 상태뿐이다**. 업로드 기능이 없으므로 컨테이너(28)와
          폴백 글리프(16)만 세운다: 자리를 먼저 잡아야 나중에 이미지가 들어올 때 행 높이·정렬이
          안 흔들린다.

          ⚠️ **radius가 4다** — `rounded-sm`(8)이 아니다. 시안 값이고, 비슷한 유틸리티로 옮기는 것이
          이전 사이클에서 구현과 시안이 갈린 원인이었다.

          ⚠️ **색이 프로젝트 이름에서 온다** — 사용자 아바타와 **같은 판정**(`lib/tone.ts`)이고
          입력만 다르다. 목록을 훑을 때 행을 가르는 것이 이름 글자보다 색이 먼저다.
        */}
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[4px]",
            "text-white",
            toneFill(row.name),
          )}
        >
          <Box className="size-4" />
        </span>

        {/*
          ⚠️ **420 고정 + `shrink-0`이다.** 이름 칸이 늘어나면 Meter의 x가 행마다 달라지고,
          그러면 훑는 눈이 열로 읽지 못한다. 흔들리는 것은 **빈 공간뿐**이어야 한다.
        */}
        <span className="flex w-[420px] min-w-0 shrink-0 flex-col gap-0.5">
          {/*
            ⚠️ **보관은 이름까지 회색이다** (캔버스 `1c`의 `muted: true`) — 숨기지 않는 대신 훑는
            눈에서만 멀어진다. 배지 하나로는 그 행이 여전히 같은 무게로 읽힌다.

            ⚠️ **일치 구간은 이름에서만 칠한다** — `searchProjects`의 대상이 이름 하나라, 리포 줄까지
            칠하면 화면이 실제보다 넓게 찾은 것처럼 말한다.
          */}
          <span className={cn("truncate text-base font-medium", status === "archived" && "text-muted-foreground")}>
            {highlightName(row.name, q).map((part, index) =>
              part.match ? (
                <mark key={index} className="rounded-[3px] bg-blue-600/[0.14] px-px text-inherit">
                  {part.text}
                </mark>
              ) : (
                part.text
              ),
            )}
          </span>
          {/*
            메타 한 줄 — **owner/repo · 역할 · 멤버 수**. ⚠️ **`https://github.com/`를 뗀다**(시안):
            행 폭의 3분의 1을 모든 행이 같은 문자열로 쓰는 것이 그 접두다.

            ⚠️ **리포가 링크가 아니다** — 행 전체가 이미 `<a>`라 중첩할 수 없다.
          */}
          <span className="text-muted-foreground truncate text-sm">
            {`${row.repoOwner}/${row.repoName}`}
            {" · "}
            {m.projects.role[row.role]}
            {" · "}
            {m.projects.memberCount(row.memberCount)}
          </span>
        </span>

        {slot.kind === "meters" ? (
          /*
            ⚠️ **앞에서부터 자른다.** 정렬이 base 먼저라(§3.1) `nth-child`로 뒤를 숨기면
            "하나만 남으면 base"가 공짜로 성립한다 — 서버는 정렬된 셋만 주고 고르는 일을 하지 않는다.

            1120 / 940 / 760은 **컨테이너(카드) 폭**이고 DESIGN §6.63의 치수표에 등재한다.
          */
          <span className="@max-[760px]:hidden @max-[940px]:[&>*:nth-child(n+2)]:hidden @max-[1120px]:[&>*:nth-child(n+3)]:hidden flex shrink-0 gap-4">
            {slot.locales.map((locale) => (
              <LocaleMeter key={`${locale.surfaceSlug}:${locale.code}`} locale={locale} />
            ))}
          </span>
        ) : (
          /*
            ⚠️ **`shrink-0`으로 되돌리지 않는다** (design §9-I). 기준 폭은 332(=100*3 + 16*2)이지만
            좁은 화면에서는 남은 폭까지 줄어들어야 우측 배지·화살표·포커스 링이 카드 안에 남는다.
            문구를 JS로 자르거나 DOM에서 빼지 않는다 — 줄이는 것은 CSS다.
          */
          <span className="text-muted-foreground w-[332px] min-w-0 shrink truncate text-sm">
            {m.projects.meter.note[slot.note]}
          </span>
        )}

        {/*
          ⚠️ **`ml-auto`가 우측 묶음에만 붙는다.** 이름 칸 420 고정 + Meter 좌측 정렬 + 여기 `ml-auto`가
          "흔들리는 것은 빈 공간뿐"을 만드는 장치다 — 셋 중 하나만 빠져도 칩의 x가 행마다 달라진다.
        */}
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {/* ⚠️ **칩만 `px-2`다** — 총계·그룹 카운트 배지는 `px-1.5` 그대로여야 `min-w-5`가 이겨 원형이 된다. */}
          <Badge variant={chip.variant} className={cn("px-2", chip.tone)}>
            {m.projects.status[status]}
          </Badge>
          <ChevronRight aria-hidden className="text-muted-foreground size-4" />
        </span>
      </Link>

      {banner !== null && <BannerLine row={row} banner={banner} />}
    </>
  );
}

/**
 * 행 아래 띠 — **다음 한 수** (시안 `1c`).
 *
 * ⚠️ **행의 형제이고 `<a>` 안이 아니다** — 링크를 중첩할 수 없다.
 *
 * ⚠️ **링크가 역할로 갈리는 것은 셋이다**(`Reconnect`·`Continue setup`·`View details`). 그 셋은
 * `project:settings` 뒤라 EDITOR에게 보여 주면 눌러서 거절당하는 경험이 된다 — 그 자리에는
 * "누가 할 수 있는지"를 말한다. **판정은 여기서 하고 `rowBanner`는 역할을 안 받는다** (design §4 F).
 */
function BannerLine({ row, banner }: { row: ProjectListRow; banner: NonNullable<RowBanner> }) {
  const canSettle = canPerform(row.role, "project:settings");

  return (
    <div className="border-foreground/[0.06] bg-foreground/[0.02] text-muted-foreground flex items-center gap-2 border-t py-2 pr-3.5 pl-14 text-xs">
      <BannerIcon banner={banner} />
      <span className="min-w-0 truncate">
        {banner.kind === "review" && m.projects.banner.review(banner.count)}
        {banner.kind === "unsent" && m.projects.banner.unsent(banner.count)}
        {banner.kind === "pr_open" && m.projects.banner.prOpen(banner.number)}
        {banner.kind === "repo_ahead" && m.projects.banner.repoAhead(banner.files, row.baseBranch)}
        {banner.kind === "setup" && m.projects.banner.setup}
        {banner.kind === "needs_reconnect" && m.projects.banner.needsReconnect}
        {banner.kind === "import_failed" && (
          <>
            {importFailureMessage(banner.reason)}{" "}
            {canSettle ? m.projects.banner.checkDetails : m.projects.importFailure.contactOwner}
          </>
        )}
      </span>
      <BannerAction row={row} banner={banner} canSettle={canSettle} />
    </div>
  );
}

function BannerIcon({ banner }: { banner: NonNullable<RowBanner> }) {
  /**
   * ⚠️ **색 알파를 쓰지 않는다** (2026-09-11 실측). lucide 글리프는 여러 요소라 `text-red-800/60`
   * 같은 색 알파를 쓰면 획이 만나는 접점에서 알파가 **누적돼 그 점만 진해진다.**
   */
  const icon = {
    needs_reconnect: { glyph: Unplug, tone: "text-amber-800" },
    import_failed: { glyph: TriangleAlert, tone: "text-red-800" },
    setup: { glyph: CircleDashed, tone: "" },
    unsent: { glyph: GitPullRequestArrow, tone: "" },
    pr_open: { glyph: GitPullRequest, tone: "" },
    repo_ahead: { glyph: GitMerge, tone: "" },
    review: { glyph: Eye, tone: "" },
  }[banner.kind];

  return <icon.glyph aria-hidden className={cn("size-3.5 shrink-0", icon.tone)} />;
}

/** 띠의 링크는 **하나까지**다. 외부로 나가는 둘은 `ExternalLink` 12를 단다 (DESIGN §6.3). */
function BannerAction({
  row,
  banner,
  canSettle,
}: {
  row: ProjectListRow;
  banner: NonNullable<RowBanner>;
  canSettle: boolean;
}) {
  const internal = (href: string, label: string) => (
    <Link href={href} className="ml-1 shrink-0 text-blue-600">
      {label}
    </Link>
  );
  const external = (href: string, label: string) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ml-1 inline-flex shrink-0 items-baseline gap-1 text-blue-600"
    >
      {label}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );

  switch (banner.kind) {
    case "review":
      // ⚠️ **`?state=`가 없다** — 검토 대기만 걸러 보내는 쿼리는 8-4가 폐기했다.
      return row.reviewSurfaceSlug === null ? null : internal(routes.surfaceTranslations(row.slug, row.reviewSurfaceSlug), m.projects.banner.action.review);
    case "unsent":
      // ⚠️ **Publish는 라우트가 아니다** — 번역 화면 툴바의 버튼으로 데려갈 뿐이다.
      return row.unsentSurfaceSlug === null ? null : internal(routes.surfaceTranslations(row.slug, row.unsentSurfaceSlug), m.projects.banner.action.send);
    case "pr_open":
      return external(banner.url, m.projects.banner.action.viewPr);
    case "repo_ahead":
      // compare 범위는 원격 조회가 이미 계산한 것과 같다 — 화면이 그 범위를 그대로 연다.
      return external(
        `https://github.com/${row.repoOwner}/${row.repoName}/compare/${row.repoAheadFrom ?? ""}...${row.baseBranch}`,
        m.projects.banner.action.reviewChanges,
      );
    case "setup":
      return canSettle
        ? internal(routes.settings(row.slug), m.projects.banner.action.continueSetup)
        : ownerOnly(m.projects.banner.askOwner.setup);
    case "needs_reconnect":
      return canSettle
        ? internal(routes.settings(row.slug), m.projects.banner.action.reconnect)
        : ownerOnly(m.projects.banner.askOwner.reconnect);
    case "import_failed":
      // ⚠️ EDITOR의 안내 문장은 위 `BannerLine`이 이미 냈다 — 여기서 한 번 더 말하지 않는다.
      return canSettle ? internal(routes.settings(row.slug), m.projects.banner.action.viewDetails) : null;
  }
}

/** 링크를 뺀 자리. **버튼처럼 보이지 않아야 한다** — 누를 것이 없다. */
function ownerOnly(sentence: string) {
  return <span className="ml-1 shrink-0">{sentence}</span>;
}
