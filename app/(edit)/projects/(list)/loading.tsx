import { ContentPanel, PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";

/**
 * 목록이 서버에서 오는 동안의 스켈레톤 (2026-09-11 사용자).
 *
 * ⚠️ **route group `(list)/`에 둔다** (audit-ux #21) — `projects/`에 바로 두면 이 경계가 `projects`의 자식 키가 바뀔 때
 * (`__PAGE__` → `[slug]`) 다시 서서, 목록 행이나 온보딩 ④에서 프로젝트로 가는 동안 **목록 골격이 떴다가** 다른
 * 화면으로 바뀌었다. malmoi#95가 `[slug]/(home)/`에서 고친 것과 같은 결함이 한 층 위에 있던 것이다.
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
 * ⚠️ **글자 줄은 `SkeletonLine`이다** (4-W8) — 줄 높이를 px로 적으면 `--text-*` 토큰이 바뀔 때 골격만 떠내려간다.
 *
 * ⚠️ **`motion-safe:`가 붙어 있다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다
 * (로그인 화면의 점 필드가 같은 판정이다).
 */
export default function ProjectsLoading() {
  return (
    <ContentPanel>
      {/* 골격이 `aria-hidden`이라 접근성 트리가 통째로 빈다 — 이 한 줄이 그 자리를 메운다(4-Y17 — 형제 화면의 골격과 같은 형). */}
      <span className="sr-only" role="status">{m.projects.loading}</span>
      {/*
        ⚠️ **`aria-hidden`이 둘로 갈렸다** — 머리와 본문이 형제가 되면서 그것을 함께 감싸던 래퍼가
        사라졌다. 하나라도 빠지면 스크린리더가 회색 블록을 읽는다.
      */}
      {/* 머리 — 여백·선·폭 등급은 `PanelHeader`가 든다. */}
      <PanelHeader aria-hidden>
        {/*
          제목 줄: 제목 ── ml-auto ─→ 검색 + [New project]. ⚠️ **카운트 원을 그리지 않는다**(4-W13) — 실물 `CountBadge`는 0이면 서지 않아
          골격이 그 자리를 예고하면 0건에서 튄다.
        */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <SkeletonLine text="text-lg" className="w-40" />
          </div>
          <Skeleton className="ml-auto h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
      </PanelHeader>

      {/* 본문 — 그룹 헤더 하나 + 카드 안의 행 둘. */}
      <PanelBody className="flex flex-col gap-4" aria-hidden>
        <section className="border-border bg-background shrink-0 overflow-hidden rounded-lg border">
          {/* 카드 헤더 — 실물과 같은 `px-4 py-3`이라야 첫 행의 y가 안 튄다. */}
          <div className="flex min-h-12 items-center gap-2 px-4 py-3">
            <SkeletonLine text="text-base" className="w-32" />
          </div>
          <ul>
            {[0, 1].map((i) => (
              <li
                key={i}
                className={`flex items-center gap-4 py-row-y pr-3.5 pl-3 ${i === 0 ? "border-foreground/[0.06] border-t" : "border-border border-t"}`}
              >
                <Skeleton className="size-7 rounded-[4px]" />
                <div className="flex w-[420px] shrink-0 flex-col gap-0.5">
                  <SkeletonLine text="text-base" className="w-48" />
                  {/* 메타 줄은 13이다(4-Y9) — 실물 행과 같은 높이라야 도착 때 안 튄다. */}
                  <SkeletonLine text="text-xs" className="w-72" />
                </div>
                <Skeleton className="ml-auto h-5 w-16 rounded-full" />
              </li>
            ))}
          </ul>
        </section>
      </PanelBody>
    </ContentPanel>
  );
}
