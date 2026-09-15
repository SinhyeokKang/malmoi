import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
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
        사용자에게는 `<main>`이 비어 있고 도착도 안 알려진다. live 영역 한 줄이 그것을 메운다
        (2026-09-15 리뷰).
      */}
      <span className="sr-only" role="status">{m.home.loading}</span>
      {/* ⚠️ `aria-hidden`이 머리와 본문 **둘 다**에 있다 — 하나만 빠져도 스크린리더가 회색 블록을 읽는다. */}
      <PanelHeader width="fluid" aria-hidden>
        <div className="flex items-center gap-2.5">
          <Block className="size-7 rounded" />
          <Block className="h-6 w-48 rounded-md" />
          <span className="ml-auto flex items-center gap-2">
            <Block className="h-9 w-24 rounded-md" />
            <Block className="h-9 w-28 rounded-md" />
          </span>
        </div>
      </PanelHeader>

      <PanelBody width="fluid" className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5" aria-hidden>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-border flex flex-col gap-3 rounded-lg border p-3.5">
                <span className="flex items-center gap-2">
                  <Block className="h-3.5 w-[62%] rounded-md" />
                  <Block className="ml-auto size-4 rounded-full" />
                </span>
                <span className="flex flex-col gap-1.5">
                  <Block className="h-6 w-14 rounded-md" />
                  <Block className="h-3 w-[72%] rounded-md" />
                </span>
              </div>
            ))}
          </div>

          {/* ⚠️ **할 일 카드에는 바닥 링크가 없다** — 골격이 그것을 그리면 데이터 도착 시 약 45px 줄어든다. */}
          <Card rows={3} footer={false} />
          {/* ⚠️ **로그 행에는 구분선이 없다 — 레일이다.** 선을 그리면 도착 시 다섯 줄이 사라진다. */}
          <Card rows={5} footer divided={false} />
        </div>

        <aside className="border-border overflow-hidden rounded-lg border">
          <div className="p-4">
            <Block className="h-5 w-20 rounded-md" />
          </div>
          <div className="border-divider flex flex-col gap-2.5 border-t px-4 py-3.5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Block className="h-3 w-24 shrink-0 rounded-md" />
                <Block className="h-3.5 w-[62%] rounded-md" />
              </div>
            ))}
          </div>
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
        <Block className="h-5 w-40 rounded-md" />
      </div>
      <ul className={divided ? undefined : "border-divider border-t px-4 pt-3.5"}>
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className={divided ? "border-divider flex items-center gap-3 border-t px-4 py-3.5" : "flex items-center gap-3 pb-4"}
          >
            <Block className={divided ? "size-7 shrink-0 rounded" : "size-2.5 shrink-0 rounded-full"} />
            <Block className="h-3.5 w-[72%] rounded-md" />
            <Block className="ml-auto h-3 w-12 shrink-0 rounded-md" />
          </li>
        ))}
      </ul>
      {footer && (
        <div className="border-divider flex items-center justify-center border-t px-4 py-3">
          <Block className="h-3.5 w-16 rounded-md" />
        </div>
      )}
    </section>
  );
}

/**
 * 회색 블록 하나. 색은 `EmptyState`의 아이콘 칩과 같은 `bg-foreground/5`다 — 새 raw 색이 아니다.
 *
 * ⚠️ **radius를 여기서 박지 않는다** (2026-09-15 리뷰). 기본값을 두고 호출부가 `rounded-full`을
 * 덧붙이면 **어느 쪽이 이기는지는 템플릿 순서가 아니라 생성된 CSS 순서**가 정한다 — 28px 타일이
 * 4px이 아니라 10px로 설 수 있다. 호출부가 전부 자기 radius를 든다.
 */
function Block({ className }: { className: string }) {
  return <div className={`bg-foreground/5 motion-safe:animate-pulse ${className}`} />;
}
