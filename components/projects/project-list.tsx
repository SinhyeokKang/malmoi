"use client";
import { Link as InlineLink } from "@/components/ui/link";
import { Highlight } from "@/components/ui/highlight";
import { ListRow } from "@/components/ui/list-row";

import {
  ChevronRight,
  CircleDashed,
  CircleHelp,
  CircleX,
  Eye,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  Languages,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyProjects, NoProjectsMatch } from "@/components/projects/empty-projects";
import { ProjectSearch, useProjectQuery } from "@/components/projects/search-input";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { GithubIcon, GitlabIcon } from "@/components/signin/brand-icons";
import { withRepoHost } from "@/lib/i18n/host";
import { repoCompareUrl } from "@/lib/projects/repo-web";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { PANEL_HEAD_ROW, PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { CountBadge } from "@/components/ui/count-badge";
import { BannerLine } from "@/components/ui/row-card";
import { Card, CardList } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { canPerform } from "@/lib/auth/permission";
import { useDateStyle, useMessages } from "@/components/i18n/messages-provider";
import type { Messages } from "@/lib/i18n";
import type { ProjectListRow } from "@/lib/keys/query";
import { formatMinute } from "@/lib/date-format";
import { importFailureMessage, importFailureTone } from "@/lib/projects/import-failure";
import { relativeTime } from "@/lib/relative-time";
import { highlightSegments } from "@/lib/search/highlight";
import { searchTokens } from "@/lib/search/match";
import { listBody, type ProjectGroup, type RowBanner } from "@/lib/projects/list";
import { neverFilledHref } from "@/lib/home/attention-view";
import { bannerTranslationsHref, routes } from "@/lib/routes";
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
 * ⚠️ **클라이언트 컴포넌트다** (audit-ux #17 — 전엔 서버 컴포넌트였다). 검색이 이미 받은 목록을
 * 로컬에서 거르고 URL은 `replaceState`로만 따라가므로(`useProjectQuery`), 그 값을 읽는 본문 전체가
 * 여기 산다. 주소창이 여전히 `?q=`를 들어 뒤로가기·공유·새로고침은 그대로 된다.
 *
 * ⚠️ **`<form>`을 만들지 않는다** — 검색은 `SearchInput` 프리미티브 그대로다. 제출 버튼이 없는
 * `<form>`이 Enter를 조용히 무효로 만든 전례가 있다 (POSTMORTEM 2026-09-08).
 *
 * ⚠️ **fluid다** — `max-w-4xl`이 아니다 (DESIGN §5.1). 카드 폭이 곧 이름 칸 폭이다.
 *
 * ⚠️ **`now`는 서버가 만들어 넘긴다** — 이 파일이 `"use client"`라 렌더하며 시계를 읽으면 서버 렌더와 하이드레이션의 상대 시각이 갈린다
 * (`lib/relative-time.ts`).
 */

const groupLabel = (m: Messages): Record<ProjectGroup, string> => ({
  needs_attention: m.projects.group.needsAttention,
  all_set: m.projects.group.allSet,
  // ⚠️ 행 배지와 **같은 낱말**이다 — 두 벌로 두면 하나가 낡는다.
  archived: m.projects.archived,
});

export function ProjectList({
  all,
  now,
  message = null,
}: {
  all: readonly ProjectListRow[];
  now: Date;
  /** 페이지 수준 거부. 모달 라우트는 사유를 모달 안에서 말하므로 여기로 안 넘긴다. */
  message?: ReactNode;
}) {
  const m = useMessages();
  const [query, search] = useProjectQuery();
  // `listBody`·`searchTokens`·`routes.newProject`가 전부 빈 값을 "질의 없음"으로 읽는다.
  const q = query === "" ? undefined : query;
  /**
   * 되돌리기 링크 둘의 가로채기 — `href`(`/projects`)는 새 탭·수정 키 클릭용으로 남기고, 같은 탭
   * 클릭만 로컬로 되돌린다. Next는 같은 탭 이동에서만 `onNavigate`를 부른다.
   */
  const clear = (event: { preventDefault(): void }) => {
    event.preventDefault();
    search("");
  };
  /**
   * ⚠️ **갈래 넷을 순수 함수가 정한다** (`lib/projects/list.ts`). 전에는 `hasProjects`·질의·건수가
   * 여기 JSX 안에서 섞여 판정됐고, 그러면 넷 중 하나를 바꿀 때 나머지 셋이 어떤 모양이 되는지를
   * 화면을 읽어야만 알 수 있었다.
   */
  const body = listBody(all, q);

  return (
    <>
      <PanelHeader>
        {/*
          ⚠️ **제목 행의 `min-h-9`는 `PanelHeader`가 첫 자식에 든다** (DESIGN §5.1 · 2026-10-01). 버튼이 없는 갈래(`1b` — 프로젝트
          0건)에서 줄 높이가 28로 떨어지면 머리 높이가 라우트마다 4px 튄다 — 이 행이 첫 자식이어야 하는 이유다.
        */}
        {/* 640 미만이면 제목·배지 첫 줄 · 검색·[New project] 둘째 줄 오른쪽(`PANEL_HEAD_ROW` — 시안 AT2a). */}
        <div className={PANEL_HEAD_ROW}>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-medium">{m.common.nav.projects}</h1>
            {/*
              ⚠️ **총계는 좁히기 전의 값이다** — 검색을 바꿔도 안 흔들려야 "내 프로젝트가 몇 개인가"에
              답한다. 좁혀진 수는 결과 카드의 카운트가 든다 (캔버스 `1c`: 배지 3 · 카드 1).
            */}
            {/* ⚠️ **카드 배지와 같은 처방이다** — 셋만 문장을 들면 같은 화면 두 줄 안에서 갈린다. */}
            <CountBadge count={all.length} label={m.projects.count(all.length)} />
          </div>
          {/*
            ⚠️ **프로젝트가 하나도 없으면 검색·[New project]를 그리지 않는다** (캔버스 `1b`).
            좁힐 것이 없는 검색창은 죽은 컨트롤이고, 만들기 버튼은 그때 빈 상태 카드 안에 하나만 선다.
          */}
          {/* ⚠️ **검색과 버튼이 한 묶음이다** — 제목 뒤 형제가 버튼 묶음이라 둘째 줄로 함께 내려간다. 좁으면 검색 칸만 준다(`ProjectSearch`). */}
          {body.kind !== "empty" && (
            <div className="flex min-w-0 items-center gap-3">
              {/* 256 칸이 줄어들 수 있다(`min-w-0 shrink`) — 둘째 줄이 그릇보다 넓을 때만 준다. 한 줄일 때(묶음 `shrink-0`)는 그대로 256이다. */}
              <div className="w-64 min-w-0 shrink">
                <ProjectSearch q={query} onSearch={search} />
              </div>
              <NewProjectButton q={q} />
            </div>
          )}
        </div>
      </PanelHeader>

      <PanelBody className="flex flex-col gap-4">
        {/*
          페이지 수준 거부는 **global Alert**이고 본문의 첫 블록이다 (DESIGN §6.4).
          ⚠️ **본문과 함께 스크롤한다** (2026-10-01 사용자) — 옛 자리는 머리 안 제목 줄 아래였고 근거는 POSTMORTEM 2026-09-06
          ("스크롤로 사라지면 버튼이 안 눌린 것으로 본다")였다. 사용자가 뒤집었다: 머리는 제목·툴바 한 띠로 고정된다.
        */}
        {message !== null && <Alert variant="danger">{message}</Alert>}
        {body.kind === "groups" ? (
          body.cards.map((card) => (
            <Card
              key={card.group}
              title={groupLabel(m)[card.group]}
              count={card.rows.length}
              countLabel={m.projects.count(card.rows.length)}
            >
              <RowList rows={card.rows} now={now} />
            </Card>
          ))
        ) : body.kind === "results" ? (
          /*
            ⚠️ **결과를 그룹으로 쪼개지 않는다** (캔버스 `1c`). 결과 1건에 헤더 셋이면 둘이 빈 카드가
            되고, 이 화면이 답할 질문은 "어느 그룹인가"가 아니라 "찾았나"다. 상태는 행의 칩이 말한다.
          */
          <Card
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
              /* 앱 안 이동이라 파랑이 아니다 — 파랑은 새 탭 외부 링크만이다(DESIGN §2.4 동작 규칙 · §6.63). */
              <Link
                href={routes.projects()}
                onNavigate={clear}
                className="focus-visible:ring-ring text-foreground ml-auto inline-flex items-center gap-0.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                {m.projects.clearSearch}
                {/* 앱 안 이동의 표식 — 파랑 대신 chevron이다(DESIGN §6.3 동작 규칙). */}
                <ChevronRight className="text-muted-foreground size-4" aria-hidden />
              </Link>
            }
          >
            <RowList rows={body.rows} q={q} now={now} />
          </Card>
        ) : body.kind === "empty" ? (
          <EmptyProjects m={m} />
        ) : (
          <NoProjectsMatch m={m} query={body.query} onReset={clear} />
        )}
      </PanelBody>
    </>
  );
}

/**
 * 카드 안의 행 목록 — 선의 급 둘·`@container`·`divide-y` 금지는 전부 `components/ui/row-card.tsx`가
 * 든다. 여기 남는 것은 **무엇을 행으로 그리나**뿐이다.
 */
function RowList({ rows, q, now }: { rows: readonly ProjectListRow[]; q?: string; now: Date }) {
  return (
    <CardList>
      {rows.map((row) => (
        <li key={row.slug}>
          <ProjectRow row={row} q={q} now={now} />
        </li>
      ))}
    </CardList>
  );
}

function ProjectRow({ row, q, now }: { row: ProjectListRow; q?: string; now: Date }) {
  /*
    ⚠️ **행 전체가 그 리포 호스트의 사전을 지난다** (project-row-redesign design §3) — 전엔 띠 둘만 덮어서 연결 전 GitLab 행의 둘째 줄이
    GitHub 문장이었다. `withRepoHost`는 같은 사전이면 같은 결과 객체라 행마다 불러도 비용이 없다.
  */
  const m = withRepoHost(useMessages(), row.repoHost);
  // 칩·그룹·띠는 서버가 한 표에서 판정해 싣는다(`planProjectRow`) — 화면은 다시 판정하지 않는다.
  const { chip, banner } = row.plan;
  const archived = row.plan.group === "archived";

  return (
    <>
      <ListRow ringInset
        href={routes.project(row.slug)}
        /**
         * ⚠️ **링이 `ring-inset`이다** (2026-09-11 실측). 링은 box-shadow라 요소 **밖으로** 3px
         * 퍼지는데 부모 카드가 `overflow-hidden`이라 그 3px이 통째로 잘려 **키보드 사용자에게
         * 포커스가 아예 안 보였다.** 그 `overflow-hidden`은 `rounded-lg`가 첫·끝 행의 모서리를
         * 자르는 수단이라 뗄 수 없으므로, 링을 안쪽으로 그린다.
         *
         * ⚠️ **한 행 = 한 줄이다** (project-row-redesign — 언어 막대가 Sources 소스 행으로 옮겨 갔다). 이름 칸이 세 줄(이름 · 리포 · 메타)이라
         * 메타가 한 줄이면 행은 87.16이다(옛 두 줄 행 108). 순서는 DOM 그대로다(CSS `order`·두 벌 렌더 없음 — DESIGN §7, malmoi#82).
         *
         * ⚠️ **좁은 그릇(`@max-form`)에서는 메타 줄이 이름 칸을 나와 행 폭으로 선다** (2026-10-18 D16 · malmoi#299) — 긴 칩 옆 이름 칸이 57까지
         * 줄어 메타가 8줄로 감기고 `sincronizado` 한 낱말도 칸을 넘었다. 같은 DOM을 grid로만 다시 놓는다: 이름 칸이 `contents`가 되어 이름·리포는
         * 칩 묶음 옆 두 줄, 메타는 셋째 줄에서 이름 시작선부터 행 오른쪽 끝까지(칩 묶음 아래)다. 메타를 두 벌 그리지 않는다 — 링크의 접근 이름이 메타를
         * 되풀이하면 안 된다. 넓은 그릇은 그대로 flex다.
         */
        className="gap-4 pr-3.5 pl-3 @max-form:grid @max-form:grid-cols-[auto_minmax(0,1fr)_auto] @max-form:gap-x-4 @max-form:gap-y-0.5"
      >
        {/* 좁은 그릇에서 썸네일은 이름·리포 두 줄의 가운데에 선다 — 프리미티브가 바깥 배치를 받지 않아 칸 하나로 감싼다. */}
        <span className="flex shrink-0 @max-form:col-[1] @max-form:row-[1/3]">
          <ProjectThumbnail name={row.name} src={row.image} />
        </span>

        {/*
          ⚠️ **이름 칸이 유동이다**(`min-w-0 flex-1`). 긴 이름·리포는 말줄임되고 오른쪽 배지는 줄지 않는다(`shrink-0`) — 상태가 첫 줄에 남는다.
          메타 줄만 감긴다(정보라 자르지 않는다).
        */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 @max-form:contents">
          {/*
            ⚠️ **보관은 이름까지 회색이다** (캔버스 `1c`의 `muted: true`) — 숨기지 않는 대신 훑는
            눈에서만 멀어진다. 배지 하나로는 그 행이 여전히 같은 무게로 읽힌다.

            ⚠️ **그 회색이 `#a3a3a3`이다** (2026-09-20 사용자 — *"거의 비활성 상태에 가깝게"*).
            `#737373`은 이 리포에서 **꺼진 컨트롤의 글자색**이라 "비활성처럼"의 하한이 아니라 그 값
            자체였다. 아래 리포·메타 줄과 **한 색**이라야 이 행이 통째로 물러난 것으로 읽힌다. 배지는 내려가지 않는다 —
            그 행이 "왜 꺼졌나"를 말하는 유일한 사실이라 `soft-neutral` 그대로다(search-ux-unify D6).
            ⚠️ **대비가 2.3:1이라 DESIGN §6.2의 `gray-dim` 규칙(*"본문에 쓰지 않는다"*)에서 벗어난
            자리다** — 등재된 이탈이고 근거는 §6.63에 있다.

            ⚠️ **일치 구간은 이름에서만 칠한다** — `searchProjects`의 대상이 이름 하나라, 리포·메타 줄까지
            칠하면 화면이 실제보다 넓게 찾은 것처럼 말한다. 칠하는 함수는 검색 Dialog와 같다(search-ux-unify C6).
          */}
          <span className={cn("truncate text-base font-medium @max-form:col-[2] @max-form:row-[1]", archived && "text-gray-dim")}>
            <Highlight segments={highlightSegments(row.name, searchTokens(q ?? ""))} />
          </span>
          {/*
            리포 줄 — **owner/repo 하나**다(2026-09-30 사용자 — 역할·멤버 수를 걷었다). ⚠️ **`https://github.com/`를 뗀다**(시안):
            행 폭의 3분의 1을 모든 행이 같은 문자열로 쓰는 것이 그 접두다.

            ⚠️ **리포가 링크가 아니다** — 행 전체가 이미 `<a>`라 중첩할 수 없다.

            ⚠️ **리포 앞에 호스트 로고 14가 선다** (2026-09-25 사용자 — Vercel 목록처럼). 색은 상속이라 보관 행이면 함께 물러난다.
            말줄임은 안쪽 글자 span이 든다 — 바깥이 `flex`라 `truncate`를 거기 두면 마크까지 잘리는 대신 줄임표가 안 선다.
          */}
          {/* 보조줄은 13이다 — 행 보조줄 한 벌(4-Y9 · `PanelRow`·`EventMeta`와 같다). */}
          <span className={cn("flex min-w-0 items-center gap-1.5 text-xs @max-form:col-[2] @max-form:row-[2]", archived ? "text-gray-dim" : "text-muted-foreground")}>
            {/*
              리포 호스트 글리프(시안 G4a — 섞인 목록에서 정보가 된다). 글리프는 장식이라 호스트 이름이 접근 이름에 글자로 든다(글리프만으로 가르지 않는다).
              ⚠️ 긴 하위 그룹 주소는 **namespace가 먼저 줄어든다** — 리포 이름이 정보라 375에서 `group/sub/…`이 아니라 이름 끝까지 보이게 한다
              (namespace `shrink-[1000]` · 이름은 namespace가 다 줄어든 뒤에야 말줄임).
            */}
            {row.repoHost === "gitlab" ? <GitlabIcon className="size-3.5 shrink-0" /> : <GithubIcon className="size-3.5 shrink-0" />}
            <span className="sr-only">{m.home.meta.platforms[row.repoHost === "gitlab" ? "gitlab" : "github"]}: </span>
            <span className="flex min-w-0">
              <span className="min-w-[2ch] shrink-[1000] truncate">{`${row.repoOwner}/`}</span>
              <span className="min-w-0 truncate">{row.repoName}</span>
            </span>
          </span>
          <RowMeta row={row} m={m} now={now} archived={archived} />
        </span>

        {/* 배지 묶음은 줄지 않는다 — 이름이 먼저 말줄임된다. */}
        <span className="flex shrink-0 items-center gap-3 @max-form:col-[3] @max-form:row-[1/3]">
          {/*
            칩은 상태 키만 넘긴다 — variant·낱말은 `STATE`가 든다(DESIGN §2.4). ⚠️ **`host`를 넘기지 않는다** — 목록 칩 집합에 호스트로 갈리는
            낱말(PR 조회 실패)이 없다(project-row-redesign design §3). ⚠️ **보관도 덮개가 없다**(search-ux-unify D6) — 물러나는 것은 이름·리포·메타 셋이다.
            칩 여백은 `Badge` 기본 `px-1.5` 한 형이다 — 덧칠하면 스위처·검색의 같은 칩과 폭이 갈린다(search-ux-polish O8).
          */}
          <StatusBadge state={chip} />
          <ChevronRight aria-hidden className="text-muted-foreground size-4" />
        </span>
      </ListRow>

      {banner !== null && <ProjectBanner row={row} banner={banner} />}
    </>
  );
}

/**
 * 대표 메타 한 줄 — `sources · keys · languages · synced` (project-row-redesign design §1). 운영 상세(연결·CI·브랜치·멤버)는 Home 메타 열이
 * 정본이고 행은 그 화면으로 가는 입구다.
 *
 * ⚠️ **감기고 숨지 않는다**(PRODUCT §4.1) — 칸은 **통째로** 다음 줄로 간다: flex 줄 나눔이 칸을 자기 글자 폭으로 놓으므로 줄은 칸 사이에서
 * 바뀌고 `synced 3 hours ago`가 찢기지 않는다. ⚠️ **칸 하나가 메타 줄보다 넓을 때만** 그 칸이 안에서 낱말 사이로 감긴다(`max-w-full` — 폭 상한이
 * 메타 줄, 하한은 가장 긴 낱말). 좁은 그릇에서는 메타 줄이 행 폭(이름 시작선 → 행 오른쪽 끝)이라 흔한 경우 1–2줄이고 낱말이 넘치지 않는다(D16 · #299). `whitespace-nowrap`이던 때는 그런 칸이 375에서 칩 묶음 아래로 최대 95px 넘쳤다(malmoi#297). 가운뎃점은
 * **앞 칸 끝에** 줄바꿈 없는 공백으로 붙는다 — 칸 안에서 감겨도 `·`가 줄 머리에 서지 않는다. 글리프·배지·sr-only 없이 글자뿐이다(POSTMORTEM 2026-10-13 #260 — 행마다 absolute 요소를 늘리지 않는다).
 *
 * ⚠️ **언어 0과 시각 없음(`null`·`"unrecorded"`)은 칸을 뺀다** — `0 languages`는 깨진 것으로 읽히고, `synced(null)`은 `not synced yet`이라
 * 첫 적재 전 행의 칩을 되풀이한다. 소스·키는 0이어도 선다 — 메타 줄이 어느 행에서도 비지 않아야 행 높이가 상태마다 같다(골격이 그 높이다).
 */
function RowMeta({ row, m, now, archived }: { row: ProjectListRow; m: Messages; now: Date; archived: boolean }) {
  const style = useDateStyle();
  const cells: ReactNode[] = [m.sources.count(row.sourceCount), m.translations.keys(row.keyCount)];
  if (row.languageCount > 0) cells.push(m.sources.languageCount(row.languageCount));
  // ⚠️ `"unrecorded"`를 먼저 거른다 — `new Date("unrecorded")`는 Invalid Date라 그대로 넘기면 `toISOString`이 던진다.
  if (row.lastSync !== null && row.lastSync !== "unrecorded") {
    const at = new Date(row.lastSync);
    // 상대 시각도 절대 값을 든다(DESIGN §6.68 — `source-status.tsx`와 같은 형). 접근 이름에 `synced`가 남도록 문장째 절대 시각으로 바꾼다.
    cells.push(<time dateTime={at.toISOString()} aria-label={m.home.cards.synced(formatMinute(at, style))}>{m.home.cards.synced(relativeTime(at, now, style.uiLocale))}</time>);
  }
  return (
    <span data-row-meta className={cn("flex flex-wrap gap-x-1 text-xs @max-form:col-[2/4] @max-form:row-[3]", archived ? "text-gray-dim" : "text-muted-foreground")}>
      {cells.map((cell, i) => (
        <span key={i} className="max-w-full">{cell}{i < cells.length - 1 && "\u00a0·"}</span>
      ))}
    </span>
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
 * "누가 할 수 있는지"를 말한다. **판정은 여기서 하고 `planProjectRow`는 역할을 안 받는다** (DESIGN §6.63).
 */
function ProjectBanner({ row, banner }: { row: ProjectListRow; banner: NonNullable<RowBanner> }) {
  // 호스트가 섞인 목록이라 행마다 그 리포 호스트의 문장이다(merge request · `!128` — `withRepoHost`, 같은 사전이면 같은 결과 객체).
  const m = withRepoHost(useMessages(), row.repoHost);
  const canSettle = canPerform(row.role, "project:settings");

  return (
    <BannerLine
      icon={<BannerIcon banner={banner} />}
      /*
        띠 전체가 상태의 색이다 — 실패는 Home Alert·Logs·Sources와 같은 빨강, 재연결 필요는 Home Alert와 같은 호박(2026-09-30 사용자).
        ⚠️ **All set 카드의 할 일 띠는 전부 muted다**(project-row-redesign 결정 6) — warning·danger는 Needs attention 사유(끊김·실패)만 든다.
      */
      tone={banner.kind === "import_failed" ? importFailureTone(banner.reason) : banner.kind === "needs_reconnect" ? "warning" : "muted"}
      action={<BannerAction row={row} banner={banner} canSettle={canSettle} />}
    >
      {banner.kind === "review" && m.projects.banner.review(banner.count)}
      {banner.kind === "never_filled" && m.projects.banner.neverFilled(banner.name, banner.surfaceSlug, banner.keys)}
      {banner.kind === "unsent" && m.projects.banner.unsent(banner.count)}
      {banner.kind === "language_unsent" && (banner.held ? m.projects.banner.languageRemovalHeld : m.projects.banner.languageChanges(banner.count))}
      {banner.kind === "pr_open" && m.projects.banner.prOpen(banner.number)}
      {banner.kind === "pr_check_failed" && m.projects.banner.prCheckFailed}
      {banner.kind === "repo_ahead" && m.projects.banner.repoAhead(banner.files, row.baseBranch)}
      {banner.kind === "setup" && m.projects.banner.setup}
      {banner.kind === "needs_reconnect" && m.projects.banner.needsReconnect}
      {banner.kind === "import_failed" && (
        <>
          {importFailureMessage(m, banner.reason)}{" "}
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
    // 색은 띠(`BannerLine tone`)가 든다 — 글리프는 글자색을 상속한다.
    needs_reconnect: { glyph: Unplug, tone: "" },
    // 실패는 `CircleX`, 일부 반영은 경고 삼각이다(DESIGN §2.4 글리프 열 — `TriangleAlert`는 danger 옆에 서지 않는다, 5-Y4).
    import_failed: { glyph: banner.kind === "import_failed" && importFailureTone(banner.reason) === "danger" ? CircleX : TriangleAlert, tone: "" },
    setup: { glyph: CircleDashed, tone: "" },
    unsent: { glyph: GitPullRequestArrow, tone: "" },
    // 미발송과 같은 글리프다 — 같은 다음 수(Publish)는 같은 모양이고 무엇이 남았는지는 문장이 가른다(language-request-todo Q2).
    language_unsent: { glyph: GitPullRequestArrow, tone: "" },
    pr_open: { glyph: GitPullRequest, tone: "" },
    // 확인 못 한 열린 PR — "모름"의 글리프다. muted 띠에 경고 삼각이 서면 톤과 모양이 어긋난다(project-row-redesign design §6).
    pr_check_failed: { glyph: CircleHelp, tone: "" },
    repo_ahead: { glyph: GitMerge, tone: "" },
    review: { glyph: Eye, tone: "" },
    // Inbox·Home Attention의 같은 항목과 같은 글리프다(`TILE.never_filled`).
    never_filled: { glyph: Languages, tone: "" },
  }[banner.kind];

  return <icon.glyph aria-hidden className={cn("size-3.5 shrink-0", icon.tone)} />;
}

/**
 * 띠의 링크는 **하나까지**다. ⚠️ **파랑은 새 탭 외부(`View PR`·`Review changes`)만이다** (🔴 N · DESIGN §2.4 동작 규칙) — 앱 안 이동은 muted 글자 +
 * chevron 12다. 전엔 둘이 같은 파랑이라 새 탭으로 나가는지 알 수 없었다. 외부 링크에는 글리프를 달지 않는다(DESIGN §6.3).
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
  const m = withRepoHost(useMessages(), row.repoHost);
  const internal = (href: string, label: string) => (
    <Link href={href} className="text-muted-foreground ml-1 inline-flex shrink-0 items-center gap-0.5">
      {label}
      <ChevronRight className="size-3" aria-hidden />
    </Link>
  );
  const external = (href: string, label: string) => (
    <InlineLink
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ml-1 shrink-0 "
    >
      {label}
    </InlineLink>
  );

  switch (banner.kind) {
    case "review":
      // 그 Status로 걸러 간다 — 범위가 트리 위치라 필터 없이 가면 그 소스 전체에서 일을 다시 찾아야 한다(2026-10-02 사용자).
      return row.reviewSurfaceSlug === null ? null : internal(bannerTranslationsHref(row.slug, row.reviewSurfaceSlug, "review"), m.projects.banner.action.review);
    case "unsent":
      // ⚠️ **Publish는 라우트가 아니다** — 번역 화면 툴바의 버튼으로 데려갈 뿐이다. 보낼 편집만 걸러 보인다.
      return row.unsentSurfaceSlug === null ? null : internal(bannerTranslationsHref(row.slug, row.unsentSurfaceSlug, "unsent"), m.projects.banner.action.send);
    case "language_unsent":
      // 언어 변경은 번역 화면의 셀 목록에 없다 — [Publish]가 있는 프로젝트 Home으로 간다(language-request-todo Q1, Inbox 항목과 같다).
      return internal(routes.project(row.slug), m.projects.banner.action.send);
    case "never_filled":
      // Home Attention·Inbox의 같은 항목과 같은 목적지다 — 그 소스·그 언어의 `Incomplete`. 라벨은 상세 모달의 같은 목적지 버튼 이름이다.
      return internal(neverFilledHref(row.slug, banner.surfaceSlug, banner.code), m.sources.open);
    case "pr_open":
      return external(banner.url, m.projects.banner.action.viewPr);
    case "pr_check_failed":
      // 갈 곳이 없다 — 다음 방문에서 다시 확인한다.
      return null;
    case "repo_ahead":
      // compare 범위는 원격 조회가 이미 계산한 것과 같다 — 화면이 그 범위를 그대로 연다.
      return external(
        repoCompareUrl(row.repoHost, row.repoOwner, row.repoName, row.repoAheadFrom ?? "", row.baseBranch),
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
