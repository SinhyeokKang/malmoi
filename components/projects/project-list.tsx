import {
  ChevronRight,
  CircleDashed,
  Eye,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyProjects, NoProjectsMatch } from "@/components/projects/empty-projects";
import { LocaleMeter } from "@/components/locale-meter";
import { ProjectSearch } from "@/components/projects/search-input";
import { ProjectThumbnail } from "@/components/projects/project-thumbnail";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BannerLine, RowCard, RowCardItem, RowCardList } from "@/components/ui/row-card";
import { canPerform } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import type { ProjectListRow } from "@/lib/keys/query";
import { importFailureMessage } from "@/lib/projects/import-status";
import {
  highlightName,
  listBody,
  meterSlot,
  projectStatus,
  rowBanner,
  type ProjectGroup,
  type ProjectStatus,
  type RowBanner,
} from "@/lib/projects/list";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * 프로젝트 목록의 **본문** — 머리와 그룹 카드 셋. 시안은 Claude Design
 * `design_handoff_projects_panel_rework/Projects v2.dc.html`(아트보드 `1a`~`1d`)이고 치수표는
 * DESIGN §6.63이다. **행(`ProjectRow`)의 규격은 앞선 핸드오프 그대로다** — 바뀐 것은 그릇뿐이다.
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
   * ⚠️ **보관만 `#a3a3a3`이고 나머지 무색 둘은 `#525252`다**. `Badge neutral`의 기본 글자색은
   * foreground(`#0a0a0a`)이므로 셋 다 호출부에서 내린다 — 프리미티브를 바꾸면 이 루프가 보지 않은
   * 화면의 배지가 함께 움직인다.
   *
   * ⚠️ **`#737373`이었다** (캔버스 `1c` · 2026-09-20에 사용자가 한 단계 더 내렸다 — *"거의 비활성
   * 상태에 가깝게"*). 그 값은 이 리포에서 **꺼진 컨트롤의 글자색**이라(`button.tsx`·`select.tsx`)
   * 더 내려갈 데가 없었고, 이름·메타와 **함께** 움직여야 한다: 배지만 남으면 그것이 행에서 가장
   * 진한 것이 되어 물러나게 하려던 행으로 눈이 먼저 간다.
   */
  archived: { variant: "neutral", tone: "text-neutral-400" },
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
  q,
  message = null,
}: {
  all: readonly ProjectListRow[];
  q?: string;
  /** 페이지 수준 거부. 모달 라우트는 사유를 모달 안에서 말하므로 여기로 안 넘긴다. */
  message?: ReactNode;
}) {
  /**
   * ⚠️ **갈래 넷을 순수 함수가 정한다** (`lib/projects/list.ts`). 전에는 `hasProjects`·질의·건수가
   * 여기 JSX 안에서 섞여 판정됐고, 그러면 넷 중 하나를 바꿀 때 나머지 셋이 어떤 모양이 되는지를
   * 화면을 읽어야만 알 수 있었다.
   */
  const body = listBody(all, q);

  return (
    <>
      <PanelHeader width="fluid">
        {/*
          ⚠️ **`min-h-9`가 제목 행에 있다** (DESIGN §5.1). 버튼이 없는 갈래(`1b` — 프로젝트 0건)에서
          줄 높이가 28로 떨어지면 머리 높이가 라우트마다 4px 튄다.
        */}
        <div className="flex min-h-9 items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-medium">{m.common.nav.projects}</h1>
            {/*
              ⚠️ **총계는 좁히기 전의 값이다** — 검색을 바꿔도 안 흔들려야 "내 프로젝트가 몇 개인가"에
              답한다. 좁혀진 수는 결과 카드의 카운트가 든다 (캔버스 `1c`: 배지 3 · 카드 1).
            */}
            {/* ⚠️ **카드 배지와 같은 처방이다** — 셋만 문장을 들면 같은 화면 두 줄 안에서 갈린다. */}
            <Badge variant="neutral">
              <span aria-hidden>{all.length}</span>
              <span className="sr-only">{m.projects.count(all.length)}</span>
            </Badge>
          </div>
          {/*
            ⚠️ **프로젝트가 하나도 없으면 검색·[New project]를 그리지 않는다** (캔버스 `1b`).
            좁힐 것이 없는 검색창은 죽은 컨트롤이고, 만들기 버튼은 그때 빈 상태 카드 안에 하나만 선다.
          */}
          {body.kind !== "empty" && (
            <>
              {/* ⚠️ **`ml-auto`가 검색에 붙는다** — 제목과 컨트롤 사이의 빈 공간이 흔들리는 자리다. */}
              <div className="ml-auto">
                <ProjectSearch q={q} />
              </div>
              <NewProjectButton q={q} />
            </>
          )}
        </div>

        {/*
          페이지 수준 거부는 **global Alert**다 (DESIGN §6.4).
          ⚠️ **제목 줄 아래이고 머리 안이다** — 본문으로 내리면 스크롤로 사라지고, 사용자는 버튼이
          안 눌린 것으로 본다 (POSTMORTEM 2026-09-06). 세로로 쌓는 것은 `PanelHeader`의 열 레이아웃이다.
        */}
        {message !== null && <Alert variant="danger">{message}</Alert>}
      </PanelHeader>

      <PanelBody width="fluid" className="flex flex-col gap-4">
        {body.kind === "groups" ? (
          body.cards.map((card) => (
            <RowCard
              key={card.group}
              title={GROUP_LABEL[card.group]}
              count={card.rows.length}
              countLabel={m.projects.count(card.rows.length)}
            >
              <RowList rows={card.rows} />
            </RowCard>
          ))
        ) : body.kind === "results" ? (
          /*
            ⚠️ **결과를 그룹으로 쪼개지 않는다** (캔버스 `1c`). 결과 1건에 헤더 셋이면 둘이 빈 카드가
            되고, 이 화면이 답할 질문은 "어느 그룹인가"가 아니라 "찾았나"다. 상태는 행의 칩이 말한다.
          */
          <RowCard
            title={m.projects.resultsFor(body.query)}
            count={body.rows.length}
            countLabel={m.projects.count(body.rows.length)}
            /*
              나가는 길은 헤더 오른쪽 하나다 — 지금 좁혀진 것이 **이 카드**라는 사실이 그 자리에서 읽힌다.

              ⚠️ **`1d`의 같은 `Clear search`와 링 처리가 같아야 한다** — 한 화면에서 같은 동작이 두
              모양을 갖지 않는다. ⚠️ **링이 바깥인데 카드가 `overflow-hidden`이다**: 이 링크는 헤더의
              padding 16 안쪽에 앉아 2px이 잘리지 않는다. **행 링크는 그렇지 않아 `ring-inset`이다**
              (2026-09-11 실측 — 카드 모서리를 자르는 `overflow-hidden`이 바깥 링을 통째로 먹었다).
            */
            action={
              <Link
                href={routes.projects()}
                className="focus-visible:ring-ring ml-auto text-sm text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
              >
                {m.projects.clearSearch}
              </Link>
            }
          >
            <RowList rows={body.rows} q={q} />
          </RowCard>
        ) : body.kind === "empty" ? (
          <EmptyProjects />
        ) : (
          <NoProjectsMatch query={body.query} />
        )}
      </PanelBody>
    </>
  );
}

/**
 * 카드 안의 행 목록 — 선의 급 둘·`@container`·`divide-y` 금지는 전부 `components/ui/row-card.tsx`가
 * 든다. 여기 남는 것은 **무엇을 행으로 그리나**뿐이다.
 */
function RowList({ rows, q }: { rows: readonly ProjectListRow[]; q?: string }) {
  return (
    <RowCardList>
      {rows.map((row, index) => (
        <RowCardItem key={row.slug} first={index === 0}>
          <ProjectRow row={row} q={q} />
        </RowCardItem>
      ))}
    </RowCardList>
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
        <ProjectThumbnail name={row.name} src={row.image} />

        {/*
          ⚠️ **420 고정 + `shrink-0`이다.** 이름 칸이 늘어나면 Meter의 x가 행마다 달라지고,
          그러면 훑는 눈이 열로 읽지 못한다. 흔들리는 것은 **빈 공간뿐**이어야 한다.
        */}
        <span className="flex w-[420px] min-w-0 shrink-0 flex-col gap-0.5">
          {/*
            ⚠️ **보관은 이름까지 회색이다** (캔버스 `1c`의 `muted: true`) — 숨기지 않는 대신 훑는
            눈에서만 멀어진다. 배지 하나로는 그 행이 여전히 같은 무게로 읽힌다.

            ⚠️ **그 회색이 `#a3a3a3`이다** (2026-09-20 사용자 — *"거의 비활성 상태에 가깝게"*).
            `#737373`은 이 리포에서 **꺼진 컨트롤의 글자색**이라 "비활성처럼"의 하한이 아니라 그 값
            자체였다. 아래 메타·배지와 **한 색**이라야 이 행이 통째로 물러난 것으로 읽힌다.
            ⚠️ **대비가 2.3:1이라 DESIGN §6.2의 `neutral-400` 규칙(*"본문에 쓰지 않는다"*)에서 벗어난
            자리다** — 등재된 이탈이고 근거는 §6.63에 있다.

            ⚠️ **일치 구간은 이름에서만 칠한다** — `searchProjects`의 대상이 이름 하나라, 리포 줄까지
            칠하면 화면이 실제보다 넓게 찾은 것처럼 말한다.
          */}
          <span className={cn("truncate text-base font-medium", status === "archived" && "text-neutral-400")}>
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
          <span className={cn("truncate text-sm", status === "archived" ? "text-neutral-400" : "text-muted-foreground")}>
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
            ⚠️ **`shrink-0`으로 되돌리지 않는다** (DESIGN §6.63). 기준 폭은 332(=100*3 + 16*2)이지만
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

      {banner !== null && <ProjectBanner row={row} banner={banner} />}
    </>
  );
}

/**
 * 행 아래 띠의 **내용** — 형(들여쓰기 56 · 선 · 배경 · 13px)은 `BannerLine` 프리미티브가 든다.
 *
 * ⚠️ **행의 형제이고 `<a>` 안이 아니다** — 링크를 중첩할 수 없다.
 *
 * ⚠️ **이름이 `BannerLine`이 아니다** — 프리미티브와 한 파일 안에서 충돌한다. 바깥에 있는 사실
 * (`</Link>` 뒤)을 `projects-screen.test.ts`가 이 이름으로 센다.
 *
 * ⚠️ **링크가 역할로 갈리는 것은 둘이다**(`Reconnect`·`Continue setup` — `View details`는 r1에 Sources로 가며 빠졌다). 그 둘은
 * `project:settings` 뒤라 EDITOR에게 보여 주면 눌러서 거절당하는 경험이 된다 — 그 자리에는
 * "누가 할 수 있는지"를 말한다. **판정은 여기서 하고 `rowBanner`는 역할을 안 받는다** (DESIGN §6.63).
 */
function ProjectBanner({ row, banner }: { row: ProjectListRow; banner: NonNullable<RowBanner> }) {
  const canSettle = canPerform(row.role, "project:settings");

  return (
    <BannerLine
      icon={<BannerIcon banner={banner} />}
      action={<BannerAction row={row} banner={banner} canSettle={canSettle} />}
    >
      {banner.kind === "review" && m.projects.banner.review(banner.count)}
      {banner.kind === "unsent" && m.projects.banner.unsent(banner.count)}
      {banner.kind === "pr_open" && m.projects.banner.prOpen(banner.number)}
      {banner.kind === "repo_ahead" && m.projects.banner.repoAhead(banner.files, row.baseBranch)}
      {banner.kind === "setup" && m.projects.banner.setup}
      {banner.kind === "needs_reconnect" && m.projects.banner.needsReconnect}
      {banner.kind === "import_failed" && (
        <>
          {importFailureMessage(banner.reason)}{" "}
          {canSettle ? m.projects.banner.checkDetails : m.projects.importFailure.ownerRetries}
        </>
      )}
    </BannerLine>
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

/**
 * 띠의 링크는 **하나까지**다. 외부로 나가는 둘은 `target="_blank"`만 다르고 **모양이 내부 링크와
 * 같다** — 글리프를 달지 않는다 (DESIGN §6.3, 2026-09-18). 띠가 한 줄이라 12px 아이콘이 자리만 먹었다.
 */
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
      className="ml-1 shrink-0 text-blue-600"
    >
      {label}
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
      // 상세·재시도는 Sources에 산다 (audit #6) — Settings에는 가져오기 실패에 관한 정보가 0이다.
      // ⚠️ **EDITOR도 링크를 받는다** (r1 사용자 결정) — Sources는 EDITOR도 열어 사유를 읽고, 재시도만 위 문장이 OWNER 몫이라고 말한다.
      return internal(routes.sources(row.slug), m.projects.banner.action.viewDetails);
  }
}

/** 링크를 뺀 자리. **버튼처럼 보이지 않아야 한다** — 누를 것이 없다. */
function ownerOnly(sentence: string) {
  return <span className="ml-1 shrink-0">{sentence}</span>;
}
