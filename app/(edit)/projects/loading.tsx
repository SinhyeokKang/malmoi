import { ContentPanel, PanelBody, PanelHeader } from "@/components/shell/content-panel";

/**
 * 목록이 서버에서 오는 동안의 스켈레톤 (2026-09-11 사용자).
 *
 * ⚠️ **`ContentPanel`을 여기서도 든다** — 이 화면만 패널을 **페이지가** 들기 때문이다(형제 셋은
 * 레이아웃이 든다, `page.tsx` 주석). `loading.tsx`는 page를 대체하므로 패널을 빼면 로딩 동안
 * 흰 표면이 통째로 사라졌다가 돌아온다.
 *
 * ⚠️ **골격이 실제 화면과 같은 치수여야 한다** — 제목 줄 · 카드 헤더 · 행 둘. 다르면 데이터가
 * 도착하는 순간 레이아웃이 튀고, 그 튐이 로딩 표시보다 더 눈에 띈다. **2026-09-15에 Summary 줄이
 * 빠졌다** — 골격이 실물보다 90px 길면 목록이 그만큼 밀려 올라온다 (projects-panel-rework).
 *
 * ⚠️ **머리 아래 선도 스켈레톤에 있다** — `PanelHeader`가 늘 들기 때문이고 여기서 할 일이 없다.
 * 선이 뒤늦게 생기면 본문이 1px 밀린다.
 *
 * ⚠️ **이 화면은 GitHub을 기다린다** (DESIGN §6.63). 목록이 DB 집계와 원격 신호를 함께
 * 기다리므로 스켈레톤이 서 있는 시간이 전보다 길다 — 골격이 실물과 어긋나면 그만큼 오래 어긋나 보인다.
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
      {/*
        ⚠️ **`aria-hidden`이 둘로 갈렸다** — 머리와 본문이 형제가 되면서 그것을 함께 감싸던 래퍼가
        사라졌다. 하나라도 빠지면 스크린리더가 회색 블록을 읽는다.
      */}
      {/* 머리 — 여백·선·폭 등급은 `PanelHeader`가 든다. */}
      <PanelHeader width="fluid" aria-hidden>
        {/* 제목 줄: 제목 + 총계 배지 ── ml-auto ─→ 검색 + [New project] */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Block className="h-7 w-40" />
            <Block className="size-5 rounded-full" />
          </div>
          <Block className="ml-auto h-9 w-64" />
          <Block className="h-9 w-32" />
        </div>
      </PanelHeader>

      {/* 본문 — 그룹 헤더 하나 + 카드 안의 행 둘. */}
      <PanelBody width="fluid" className="flex flex-col gap-4" aria-hidden>
        <section className="border-border bg-background shrink-0 overflow-hidden rounded-lg border">
          {/* 카드 헤더 — 실물과 같은 `p-4`라야 첫 행의 y가 안 튄다. */}
          <div className="flex items-center gap-2 p-4">
            <Block className="h-5 w-32" />
            <Block className="size-5 rounded-full" />
          </div>
          <ul>
            {[0, 1].map((i) => (
              <li
                key={i}
                className={`flex items-center gap-4 py-3.5 pr-3.5 pl-3 ${i === 0 ? "border-foreground/[0.06] border-t" : "border-border border-t"}`}
              >
                <Block className="size-7 rounded-[4px]" />
                <div className="flex w-[420px] shrink-0 flex-col gap-0.5">
                  <Block className="h-5 w-48" />
                  <Block className="h-5 w-72" />
                </div>
                <Block className="ml-auto h-5 w-16 rounded-full" />
              </li>
            ))}
          </ul>
        </section>
      </PanelBody>
    </ContentPanel>
  );
}

/** 회색 블록 하나. 색은 `EmptyState`의 아이콘 칩과 같은 `bg-foreground/5`다 — 새 raw 색이 아니다. */
function Block({ className }: { className: string }) {
  return <div className={`bg-foreground/5 motion-safe:animate-pulse rounded ${className}`} />;
}
