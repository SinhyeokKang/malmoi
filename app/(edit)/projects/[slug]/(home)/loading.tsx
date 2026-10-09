import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { SEGMENT, SELECTED, TRACK, UNSELECTED } from "@/components/ui/segment";
import { SegmentBody } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * Home이 서버에서 오는 동안의 골격 (캔버스 `2e`).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — 이 라우트는 패널을 **레이아웃**이 든다(`/projects`만 페이지가
 * 든다). 여기서 또 감싸면 로딩 동안 패널이 둘이 된다.
 *
 * ⚠️ **골격이 실물과 같은 치수여야 한다** — 머리 padding·카드 테두리·행 높이·구분선·섹션 제목이
 * 그대로다. 다르면 데이터가 도착하는 순간 레이아웃이 튀고, 그 튐이 로딩 표시보다 더 눈에 띈다.
 *
 * ⚠️ **개수를 모르는 자리는 가장 흔한 수로 그린다** (캔버스: 항목 3 · 로그 5 · 메타 Project 탭 8). 실제 개수를
 * 맞히려 들면 틀렸을 때 두 번 튄다.
 *
 * ⚠️ **폭은 비율이다** — 고정 px로 주면 1440과 1280에서 골격만 다르게 잘린다.
 *
 * ⚠️ **`motion-safe:`가 붙어 있다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다.
 */
export default async function ProjectHomeLoading() {
  const m = await getMessages();
  return (
    <>
      {/*
        ⚠️ **골격이 `aria-hidden`이라 접근성 트리가 통째로 빈다** — 그 화면에 들어온 스크린리더
        사용자에게는 `<main>`이 비어 있다. 이 한 줄이 그 자리를 메운다 (2026-09-15 리뷰).

        ⚠️ **"도착을 알린다"는 약속이 아니다** (2026-09-16 정정) — 이 `role="status"`는 **문구를 품은
        채** 트리에 들어왔다가 통째로 사라지고, live 영역은 삽입 시점에 등록되므로 그 첫 내용은
        읽힐 수도 안 읽힐 수도 있다. 제거는 `aria-relevant` 기본값이 announce하지 않으므로 언제나
        안 읽힌다. 빈 래퍼를 상시로 세우는 해법은 **라우트가 통째로 바뀌는 이 자리에는 걸 곳이 없다**
        — 그 논의는 `components/ui/alert.tsx`의 `live` prop 주석이 든다.
      */}
      <span className="sr-only" role="status">{m.home.loading}</span>
      {/* ⚠️ `aria-hidden`이 머리와 본문 **둘 다**에 있다 — 하나만 빠져도 스크린리더가 회색 블록을 읽는다. */}
      <PanelHeader aria-hidden>
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-7 rounded" />
          <Skeleton size="lg" className="w-48" />
          <span className="ml-auto flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </span>
        </div>
      </PanelHeader>

      <PanelBody className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5" aria-hidden>
        <div className="flex min-w-0 flex-col gap-5">
          {/* ⚠️ **실물과 같은 컨테이너·클래스다** (`count-cards.tsx`) — 고정 4열이면 컨테이너 672 미만(뷰포트 ~1310 아래)에서 실물은 2×2라 도착 때 아래가 ~120px 튄다(#165). 선언과 질문은 다른 요소다. */}
          <div className="@container/cards">
          <ul className="grid grid-cols-2 gap-2 @[672px]/cards:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}><div className="border-border flex flex-col gap-3 rounded-lg border p-3.5">
                <span className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><Skeleton size="sm" className="w-[62%]" /></div>
                  <Skeleton className="ml-auto size-4 rounded-full" />
                </span>
                <span className="flex flex-col gap-1.5">
                  {/* 수치는 24/600이다 — `Skeleton`의 급 밖이라 같은 줄 상자(보이지 않는 글자 + em 블록)를 여기서 세운다. */}
                  <div className="flex items-center text-2xl font-semibold">{"\u200b"}<Skeleton className="h-[0.8em] w-14 rounded-md" /></div>
                  <Skeleton size="xs" className="w-[72%]" />
                </span>
              </div></li>
            ))}
          </ul>
          </div>

          {/* ⚠️ **할 일 카드에는 바닥 링크가 없다** — 골격이 그것을 그리면 데이터 도착 시 약 45px 줄어든다. */}
          <Card rows={3} footer={false} sub="copy" />
          {/* ⚠️ **로그 행도 `ListRow`다** (#205) — 실물은 `EventRow`라 할 일 행과 같은 칸·같은 선이다. 옛 레일(선 없는 점 줄)이면 도착 때 첫 행이 14 오르고 행마다 27 늘었다. */}
          <Card rows={5} footer sub="badge" />
        </div>

        {/*
          ⚠️ **메타 열은 탭 머리가 실물이다** (project-card-tabs `2e`) — 착지는 언제나 `Project` 탭이라 머리 라벨·선택 칸을 미리 안다.
          본문은 Project 탭 8행(묶음 4·3·1 — Repository·Connection·Branch·CI / Sources·Keys·Members / Created)이고 보관의 `Archived`까지
          맞히려 들지 않는다 — 틀리면 두 번 튄다.
          ⚠️ **바닥 `Settings ›` 자리를 역할과 무관하게 늘 그린다** — 라우트 골격은 params·세션을 못 받아 역할을 모른다(2026-10-04 지휘자 판정 —
          주 독자 OWNER 기준). EDITOR는 도착 때 45px 줄어든다(DESIGN §6.64 이탈 표).
        */}
        <aside className="border-border overflow-hidden rounded-lg border">
          {/* 실물 머리(`meta-tabs.tsx`의 `data-meta-head`)와 같은 클래스·같은 세그먼트 상수 — 골격만 다른 높이로 서지 않는다. */}
          <div data-skeleton-meta-head className="border-divider border-b p-3">
            <div className={cn(TRACK, "flex")}>
              {[m.home.meta.tabs.project, m.home.meta.tabs.sync, m.home.meta.tabs.publish].map((label, i) => (
                <span key={label} className={cn(SEGMENT, "flex-1", i === 0 ? SELECTED : UNSELECTED)}><SegmentBody label={label} /></span>
              ))}
            </div>
          </div>
          <MetaGroup rows={META_ROWS.slice(0, 4)} divided={false} />
          <MetaGroup rows={META_ROWS.slice(4, 7)} />
          <MetaGroup rows={META_ROWS.slice(7)} />
          <FooterLink />
        </aside>
      </PanelBody>
    </>
  );
}

/**
 * 할 일·로그 카드의 공통 골격.
 *
 * ⚠️ **두 카드가 같은 형이 아니다** (2026-09-15 리뷰 🟡3). 할 일에는 바닥 링크가 없고(`AttentionCard`), 보조줄이
 * 다르다 — 할 일은 표면·로케일 문장(13 · `leading-normal` 19.5), 로그는 언제나 종류 배지(20 — `eventMeta`의 첫 조각)다.
 * 골격이 실물에 없는 것을 그리면 **도착하는 순간 그만큼 튀고**, 그 튐을 없애는 것이 이 파일의 존재 이유다.
 */
function Card({ rows, footer, sub }: { rows: number; footer: boolean; sub: "copy" | "badge" }) {
  return (
    <section className="border-border overflow-hidden rounded-lg border">
      {/*
        ⚠️ **머리 아래 선은 머리가 든다** (#204) — 실물 `Card`가 `min-h-12` 머리에 `border-b`를 긋고 그 1px을 48 안에 흡수한다.
        전엔 첫 행(할 일)·목록(로그) 위 선이었고 첫 줄이 1px 높아 도착할 때 아래가 전부 올라갔다.
      */}
      <div className="border-divider flex min-h-12 items-center border-b px-4 py-3">
        <Skeleton size="md" className="w-40" />
      </div>
      <ul>
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            // 선은 실물과 같은 `Card` 규칙이다(4-Y4) — 첫 행은 머리 선 아래라 자기 선이 없고, 행↔행은 `--border`.
            className={cn("flex items-center gap-3 px-4 py-row-y", i > 0 && "border-border border-t")}
          >
            {/* 두 카드 다 행 칸이 `IconTile sm`(28 · radius 4)이다 — Logs 카드의 옛 10 점은 실물(사건 칸 28)과 달라 도착 때 튀었다. */}
            <Skeleton className="size-7 shrink-0 rounded" />
            {/*
              ⚠️ **자리의 높이는 블록이 아니라 줄 상자가 든다** (2026-09-16 실측 · 4-W8) — 블록을 두껍게
              키우면 행 높이는 맞아도 회색 덩어리가 글자보다 굵어진다. 두 카드 다 실물이 **두 줄**이다
              (문장 15 + 할 일은 표면·로케일 13, 로그는 배지 20).
            */}
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-copy-gap">
              {/* 할 일 행은 문장(15)이 먼저고 표면·로케일(13)이 아래다 — 실물과 같은 순서(Q9). */}
              <Skeleton size="md" className="w-[72%]" />
              {/* 보조줄 행간은 실물 `ListRow` 문장 칸과 같은 `leading-normal`이다(inbox-page T3 — 공유 행 조각으로 옮기며 19.5가 됐다). */}
              {sub === "copy" ? <Skeleton size="xs" lineHeight="normal" className="w-[62%]" />
                // 배지 줄은 Logs 골격과 같은 자리다 — 높이 20(`text-2xs` 16 + `py-0.5` 4)을 줄 상자가 들고 막대는 em 블록이다.
                : <div className="flex h-5 items-center text-xs"><Skeleton className="h-[0.8em] w-[40%] rounded-md" /></div>}
            </span>
            <Skeleton size="xs" className="w-12" />
          </li>
        ))}
      </ul>
      {footer && <FooterLink />}
    </section>
  );
}

/**
 * 카드 바닥의 `All logs ›` · `Project settings ›` 자리.
 *
 * ⚠️ **45px이다** — 실물은 `px-4 py-3` 위에 14px 글자와 chevron이 서서 45가 되는데, 골격이 블록
 * 높이만 14로 두면 38이 되어 도착할 때마다 7px씩 밀린다 (2026-09-16 실측).
 */
function FooterLink() {
  return (
    <div className="border-divider flex h-[45px] items-center justify-center border-t px-4">
      <Skeleton size="sm" className="w-16" />
    </div>
  );
}

/**
 * 메타 열의 구역 하나.
 *
 * ⚠️ **행 높이 20은 컨테이너가 든다** — 실물의 값은 `text-sm`(line-height 20)이고, 골격이 블록의
 * 14로 서면 아홉 행에서 54px이 모자란다 (2026-09-16 실측).
 */
/**
 * 메타 열 Project 탭 여덟 행의 막대 폭 `[라벨, 값]` (시안 v3 `2e`, malmoi#181) — 여덟 줄이 같은 폭이면 실물 행의 모양을 미리 보이지 못한다.
 * 라벨 막대는 실제 라벨 길이(Repository · Connection · Branch · CI / Sources · Keys · Members / Created), 값 막대는 그 행 값의 흔한 길이다
 * (리포 주소 · 배지 · 브랜치 · `Configured` / 수 · 수 · `4 (2)` / 상대 시각). ⚠️ 클래스를 문자열 리터럴로 둔다 — Tailwind가 소스에서 찾는다.
 * ⚠️ **위 머리 주석의 "폭은 비율" 규칙의 예외다** — 메타 열은 320 고정이라 뷰포트에 따라 잘리는 폭이 없고, 시안이 px로 정했다.
 */
const META_ROWS: readonly (readonly [label: string, value: string])[] = [
  ["w-16", "w-30"], ["w-18", "w-21"], ["w-12", "w-10"], ["w-6", "w-19"],
  ["w-13", "w-5"], ["w-9", "w-9"], ["w-14", "w-5"],
  ["w-13", "w-20"],
];

function MetaGroup({ rows, divided = true }: { rows: readonly (readonly [label: string, value: string])[]; divided?: boolean }) {
  return (
    // 첫 묶음은 탭 머리 선을 쓴다 — 실물 묶음과 같은 규칙이다.
    <div data-skeleton-meta-group className={cn("flex flex-col gap-2.5 px-4 py-3.5", divided && "border-divider border-t")}>
      {rows.map(([label, value], i) => (
        <div key={i} className="flex h-5 items-center gap-3">
          {/* 라벨 칸은 실물과 같은 96이고 막대만 라벨 길이다. */}
          <div className="w-24 shrink-0"><Skeleton size="xs" className={label} /></div>
          {/* 값은 오른쪽 끝에 붙는다 — 실물 `Fact align="end"`와 같은 쪽이다. */}
          <div className="flex min-w-0 flex-1 justify-end"><Skeleton size="sm" className={value} /></div>
        </div>
      ))}
    </div>
  );
}
