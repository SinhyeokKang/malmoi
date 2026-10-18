import { PANEL_HEAD_ROW, ContentPanel, PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/lib/i18n/server";

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
 * ⚠️ **골격이 실제 화면과 같은 치수여야 한다** — 제목 줄 · 카드 헤더 · 행 둘(한 줄 행 — 이름·리포·메타). 다르면 데이터가
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
 * ⚠️ **글자 줄은 `Skeleton`이다** (4-W8) — 줄 높이를 px로 적으면 `--text-*` 토큰이 바뀔 때 골격만 떠내려간다.
 *
 * ⚠️ **`motion-safe:`가 붙어 있다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다
 * (로그인 화면의 점 필드가 같은 판정이다).
 */
export default async function ProjectsLoading() {
  const m = await getMessages();
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
          제목 줄: 제목 ── 검색 + [New project](640 미만이면 둘째 줄 오른쪽). ⚠️ **카운트 원을 그리지 않는다**(4-W13) — 실물 `CountBadge`는 0이면 서지 않아
          골격이 그 자리를 예고하면 0건에서 튄다.
        */}
        <div className={PANEL_HEAD_ROW}>
          <div className="flex items-center gap-2">
            <Skeleton size="lg" className="w-40" />
          </div>
          {/* 실물처럼 검색·버튼이 한 묶음이다 — 640 미만에서 함께 둘째 줄로 내려간다(A-09). */}
          {/* 검색 칸도 실물처럼 줄어드는 256이다(`project-list.tsx`) — 머리 그릇 430 아래에서 골격만 256 고정이면 둘째 줄이 넘치고 도착할 때 폭이 튄다. */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-64 min-w-0 shrink">
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-32 shrink-0" />
          </div>
        </div>
      </PanelHeader>

      {/* 본문 — 그룹 헤더 하나 + 카드 안의 행 둘. */}
      <PanelBody className="flex flex-col gap-4" aria-hidden>
        {/* 실물 `Card`처럼 `@container`를 선언한다 — 메타 줄 수가 카드 그릇 640(`@max-form`)으로 갈린다. */}
        <section className="@container border-border bg-background shrink-0 overflow-hidden rounded-lg border">
          {/*
            카드 헤더 — 실물과 같은 `px-4 py-3`이라야 첫 행의 y가 안 튄다. ⚠️ **머리 아래 선은 머리가 든다** (#205) — 실물 `Card`가
            `border-b`의 1px을 `min-h-12` 안에 흡수하고 첫 행은 자기 선이 없다. 첫 행 위에 그으면 그 행이 1px 높다.
          */}
          <div className="border-divider flex min-h-12 items-center gap-2 border-b px-4 py-3">
            <Skeleton size="md" className="w-32" />
          </div>
          <ul>
            {[0, 1].map((i) => (
              /*
                실물 행과 같은 한 줄이다(project-row-redesign — 언어 막대 줄이 사라졌다). 이름 칸 세 줄(이름 · 리포 · 메타)의 줄 상자는 실물과 같은
                글자 크기의 `Skeleton` 줄이 세운다 — 막대 높이(16 · 12)만 시안 값이다.
              */
              <li
                key={i}
                /* 좁은 그릇의 배치도 실물과 같은 grid다(D16 · #299) — 메타 자리가 이름 시작선부터 행 오른쪽 끝까지 셋째 줄이다. */
                className={`flex items-center gap-4 py-row-y pr-3.5 pl-3 @max-form:grid @max-form:grid-cols-[auto_minmax(0,1fr)_auto] @max-form:gap-x-4 @max-form:gap-y-0.5 ${i > 0 ? "border-border border-t" : ""}`}
              >
                {/* 모서리는 실물 `ProjectThumbnail`과 같은 8이다(POSTMORTEM 2026-09-17 — 같은 엔터티를 두 모서리로 그렸다). */}
                <Skeleton className="size-7 shrink-0 rounded-sm @max-form:col-[1] @max-form:row-[1/3] @max-form:self-center" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 @max-form:contents">
                  <div className="@max-form:col-[2] @max-form:row-[1]"><Skeleton size="md" className="h-4 w-48 max-w-full" /></div>
                  {/* 리포·메타 줄은 13이다(4-Y9) — 실물 행과 같은 높이라야 도착 때 안 튄다. */}
                  <div className="@max-form:col-[2] @max-form:row-[2]"><Skeleton size="xs" className="h-3 w-40 max-w-full" /></div>
                  {/*
                    메타 줄 — 넓은 그릇은 이름 칸의 셋째 줄 한 줄, 좁은 그릇(`@max-form`)은 행 폭의 셋째 줄 **두** 줄이다(D16 — 메타가 칩 묶음 아래까지 넓어져
                    카드 325에서 실물 메타가 대개 두 줄이다 — en 18행 중 16 · es 18행 중 17, malmoi#299). 다른 줄 수인 행은 도착할 때 그만큼 바뀐다 — 골격은 길이를 모른다.
                    ⚠️ **막대들은 상자 하나 안의 줄이다** — 실물 메타 줄은 한 flex-wrap 상자 안이라 사이 gap이 없다. 이름 칸의 형제 줄로 두면 줄마다
                    `gap-0.5`(2)를 더 받아 골격이 실물보다 높았다(#298 — 106.48 vs 104.48).
                  */}
                  <div className="@max-form:col-[2/4] @max-form:row-[3]">
                    <Skeleton size="xs" className="h-3 w-70 max-w-full @max-form:w-[70%]" />
                    <div className="hidden @max-form:block"><Skeleton size="xs" className="h-3 w-[40%]" /></div>
                  </div>
                </div>
                {/* 칩 + chevron은 실물처럼 한 묶음(사이 12)이다 — 행의 형제로 두면 그 사이가 행 gap 16이 된다. */}
                <span className="flex shrink-0 items-center gap-3 @max-form:col-[3] @max-form:row-[1/3]">
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                  {/* chevron 자리 16 — 실물 행 오른쪽 끝의 `ChevronRight`다. 없으면 칩 자리가 16+12만큼 오른쪽에 선다. */}
                  <Skeleton className="size-4 shrink-0" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </PanelBody>
    </ContentPanel>
  );
}
