import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";

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
        — 그 논의는 `components/ui/alert.tsx`의 `role` prop 주석이 든다.
      */}
      <span className="sr-only" role="status">{m.home.loading}</span>
      {/* ⚠️ `aria-hidden`이 머리와 본문 **둘 다**에 있다 — 하나만 빠져도 스크린리더가 회색 블록을 읽는다. */}
      <PanelHeader width="fluid" aria-hidden>
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-7 rounded" />
          <Skeleton className="h-6 w-48 rounded-md" />
          <span className="ml-auto flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </span>
        </div>
      </PanelHeader>

      <PanelBody width="fluid" className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5" aria-hidden>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-border flex flex-col gap-3 rounded-lg border p-3.5">
                <span className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-[62%] rounded-md" />
                  <Skeleton className="ml-auto size-4 rounded-full" />
                </span>
                <span className="flex flex-col gap-1.5">
                  <Skeleton className="h-6 w-14 rounded-md" />
                  <Skeleton className="h-3 w-[72%] rounded-md" />
                </span>
              </div>
            ))}
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
          <div className="p-4">
            <Skeleton className="h-5 w-20 rounded-md" />
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
      <div className="p-4">
        <Skeleton className="h-5 w-40 rounded-md" />
      </div>
      <ul className={divided ? undefined : "border-divider border-t px-4 pt-3.5"}>
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className={divided ? "border-divider flex items-center gap-3 border-t px-4 py-3.5" : "flex items-center gap-3 pb-4"}
          >
            <Skeleton className={divided ? "size-7 shrink-0 rounded" : "size-2.5 shrink-0 rounded-full"} />
            {/*
              ⚠️ **자리의 높이는 블록이 아니라 컨테이너가 든다** (2026-09-16 실측) — 블록을 두껍게
              키우면 행 높이는 맞아도 회색 덩어리가 글자보다 굵어진다. 할 일 행은 실물이 **두 줄**
              (표면·로케일 13 + 문장 15)이라 42, 로그 행은 한 줄이라 22다. 전에는 둘 다 14로 서서
              도착하는 순간 할 일이 행마다 ~15, 로그가 ~8.5 늘어났다.
            */}
            <span className={`flex min-w-0 flex-1 flex-col justify-center gap-1 ${divided ? "h-[42px]" : "h-[22px]"}`}>
              {divided && <Skeleton className="h-[17px] w-[62%] rounded-md" />}
              <Skeleton className="h-[21px] w-[72%] rounded-md" />
            </span>
            <Skeleton className="ml-auto h-3 w-12 shrink-0 rounded-md" />
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
      <Skeleton className="h-3.5 w-16 rounded-md" />
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
          <Skeleton className="h-3 w-24 shrink-0 rounded-md" />
          <Skeleton className="h-3.5 w-[62%] rounded-md" />
        </div>
      ))}
    </div>
  );
}
