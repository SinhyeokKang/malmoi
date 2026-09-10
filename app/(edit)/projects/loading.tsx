import { ContentPanel } from "@/components/shell/content-panel";

/**
 * 목록이 서버에서 오는 동안의 스켈레톤 (2026-09-11 사용자).
 *
 * ⚠️ **`ContentPanel`을 여기서도 든다** — 이 화면만 패널을 **페이지가** 들기 때문이다(형제 셋은
 * 레이아웃이 든다, `page.tsx` 주석). `loading.tsx`는 page를 대체하므로 패널을 빼면 로딩 동안
 * 흰 표면이 통째로 사라졌다가 돌아온다.
 *
 * ⚠️ **골격이 실제 화면과 같은 치수여야 한다** — 제목 줄 · 툴바 줄 · 행 둘. 다르면 데이터가
 * 도착하는 순간 레이아웃이 튀고, 그 튐이 로딩 표시보다 더 눈에 띈다.
 *
 * ⚠️ **행을 둘만 그린다** — 스켈레톤은 "곧 온다"를 말하는 것이지 몇 개가 올지를 예고하는 것이
 * 아니다. 실제 개수를 흉내 내면 그 수가 틀렸을 때 두 번 튄다.
 *
 * ⚠️ **`motion-safe:`가 붙어 있다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다
 * (로그인 화면의 점 필드가 같은 판정이다).
 */
export default function ProjectsLoading() {
  return (
    <ContentPanel>
      <div className="flex flex-1 flex-col" aria-hidden>
        {/* 머리 — `page.tsx`의 `px-4 pt-6 pb-3`과 같은 자리다. */}
        <div className="flex flex-col gap-4 px-4 pt-6 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Block className="h-7 w-40" />
              <Block className="size-5 rounded-full" />
            </div>
            <Block className="h-9 w-32" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Block className="h-9 w-96" />
            <Block className="h-9 w-64" />
          </div>
        </div>

        {/* 본문 — 목록의 `<ul>`과 같은 테두리·radius 안에 행 둘. */}
        <div className="flex flex-1 flex-col px-4 pt-3 pb-8">
          <ul className="divide-border border-border shrink-0 divide-y overflow-hidden rounded-lg border">
            {[0, 1].map((i) => (
              <li key={i} className="flex items-center justify-between gap-2.5 py-3.5 pr-3.5 pl-3">
                <Block className="size-7 rounded-sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Block className="h-5 w-48" />
                  <Block className="h-5 w-72" />
                </div>
                <Block className="h-5 w-16 rounded-full" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ContentPanel>
  );
}

/** 회색 블록 하나. 색은 `EmptyState`의 아이콘 칩과 같은 `bg-foreground/5`다 — 새 raw 색이 아니다. */
function Block({ className }: { className: string }) {
  return <div className={`bg-foreground/5 motion-safe:animate-pulse rounded ${className}`} />;
}
