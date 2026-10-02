import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";
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
 * ⚠️ **개수를 모르는 자리는 가장 흔한 수로 그린다** (캔버스: 항목 3 · 로그 5 · 메타 9). 실제 개수를
 * 맞히려 들면 틀렸을 때 두 번 튄다.
 *
 * ⚠️ **폭은 비율이다** — 고정 px로 주면 1440과 1280에서 골격만 다르게 잘린다.
 *
 * ⚠️ **`motion-safe:`가 붙어 있다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다.
 */
export default function ProjectHomeLoading() {
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
          <SkeletonLine size="lg" className="w-48" />
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
                  <div className="min-w-0 flex-1"><SkeletonLine size="sm" className="w-[62%]" /></div>
                  <Skeleton className="ml-auto size-4 rounded-full" />
                </span>
                <span className="flex flex-col gap-1.5">
                  {/* 수치는 24/600이다 — `SkeletonLine`의 급 밖이라 같은 줄 상자(보이지 않는 글자 + em 블록)를 여기서 세운다. */}
                  <div className="flex items-center text-2xl font-semibold">{"\u200b"}<Skeleton className="h-[0.8em] w-14 rounded-md" /></div>
                  <SkeletonLine size="xs" className="w-[72%]" />
                </span>
              </div></li>
            ))}
          </ul>
          </div>

          {/* ⚠️ **할 일 카드에는 바닥 링크가 없다** — 골격이 그것을 그리면 데이터 도착 시 약 45px 줄어든다. */}
          <Card rows={3} footer={false} />
          {/* ⚠️ **로그 행에는 구분선이 없다 — 레일이다.** 선을 그리면 도착 시 다섯 줄이 사라진다. */}
          <Card rows={5} footer divided={false} />
        </div>

        {/*
          ⚠️ **메타 열은 구역이 둘이고 바닥에 링크가 있다** (§6.64 · 2026-09-16 실측). 한 구역 아홉 행으로
          그리면 경계 하나와 `[Project settings ›]` 45px이 통째로 빠져 **오른쪽 열이 도착하는 순간
          늘어난다.** 행 수(6·3)는 실물의 가장 흔한 모양이고, 두 줄짜리 값(리포·마지막 발행)까지
          맞히려 들지는 않는다 — 틀리면 두 번 튄다.
        */}
        <aside className="border-border overflow-hidden rounded-lg border">
          <div className="flex min-h-12 items-center px-4 py-3">
            <SkeletonLine size="md" className="w-20" />
          </div>
          <MetaGroup rows={6} />
          <MetaGroup rows={3} />
          <FooterLink />
        </aside>
      </PanelBody>
    </>
  );
}

/**
 * 할 일·로그 카드의 공통 골격.
 *
 * ⚠️ **두 카드가 같은 형이 아니다** (2026-09-15 리뷰 🟡3). 할 일에는 바닥 링크가 없고(`AttentionCard`),
 * 로그 행에는 구분선이 없다(레일이다). 골격이 실물에 없는 것을 그리면 **도착하는 순간 그만큼 튀고**,
 * 그 튐을 없애는 것이 이 파일의 존재 이유다.
 */
function Card({ rows, footer, divided = true }: { rows: number; footer: boolean; divided?: boolean }) {
  return (
    <section className="border-border overflow-hidden rounded-lg border">
      <div className="flex min-h-12 items-center px-4 py-3">
        <SkeletonLine size="md" className="w-40" />
      </div>
      <ul className={divided ? undefined : "border-divider border-t px-4 pt-3.5"}>
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            // 선은 실물과 같은 `Card` 규칙이다(4-Y4) — 첫 줄이 머리 선(`--divider`), 행↔행은 `--border`.
            className={divided ? cn("flex items-center gap-3 border-t px-4 py-row-y", i === 0 ? "border-divider" : "border-border") : "flex items-center gap-3 pb-4"}
          >
            {/* 두 카드 다 행 칸이 `IconTile sm`(28 · radius 4)이다 — Logs 카드의 옛 10 점은 실물(사건 칸 28)과 달라 도착 때 튀었다. */}
            <Skeleton className="size-7 shrink-0 rounded" />
            {/*
              ⚠️ **자리의 높이는 블록이 아니라 줄 상자가 든다** (2026-09-16 실측 · 4-W8) — 블록을 두껍게
              키우면 행 높이는 맞아도 회색 덩어리가 글자보다 굵어진다. 할 일 행은 실물이 **두 줄**
              (문장 15 + 표면·로케일 13), 로그 행은 한 줄이다. 전에는 둘 다 14 블록으로 서서
              도착하는 순간 할 일이 행마다 ~15, 로그가 ~8.5 늘어났다.
            */}
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-copy-gap">
              {/* 할 일 행은 문장(15)이 먼저고 표면·로케일(13)이 아래다 — 실물과 같은 순서(Q9). */}
              <SkeletonLine size="md" className="w-[72%]" />
              {divided && <SkeletonLine size="xs" className="w-[62%]" />}
            </span>
            <SkeletonLine size="xs" className="w-12" />
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
      <SkeletonLine size="sm" className="w-16" />
    </div>
  );
}

/**
 * 메타 열의 구역 하나.
 *
 * ⚠️ **행 높이 20은 컨테이너가 든다** — 실물의 값은 `text-sm`(line-height 20)이고, 골격이 블록의
 * 14로 서면 아홉 행에서 54px이 모자란다 (2026-09-16 실측).
 */
function MetaGroup({ rows }: { rows: number }) {
  return (
    <div className="border-divider flex flex-col gap-2.5 border-t px-4 py-3.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-5 items-center gap-3">
          <div className="w-24 shrink-0"><SkeletonLine size="xs" className="w-full" /></div>
          <div className="min-w-0 flex-1"><SkeletonLine size="sm" className="w-[62%]" /></div>
        </div>
      ))}
    </div>
  );
}
