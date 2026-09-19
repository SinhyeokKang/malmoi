import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * **행 목록 카드** — 자기 헤더(제목 · 카운트 배지 · 설명 한 줄)를 든 카드와 그 아래 행들
 * (DESIGN §6.63 · §6.65). `/projects`의 그룹 카드와 멤버 화면의 카드 둘이 이것을 공유한다.
 *
 * ⚠️ **`components/ui/card.tsx`가 아닌 이유**: 그쪽은 제목이 `text-sm`(시안 15), 헤더 선이
 * `border-border`(#e5e5e5) 전폭인데 여기는 `#f0f0f0`, 본문이 `space-y-2 p-4`라 행 목록에 padding이
 * 두 벌, 카운트 배지 슬롯도 `overflow-hidden`·`shrink-0`도 없다. `Card`는 설정 블록·온보딩 섹션의
 * 그릇으로 그대로 두고 **행 목록 카드는 별개 프리미티브**다.
 *
 * ⚠️ **`components/ui/entity-card.tsx`도 아니다** — 형은 가깝지만(아바타 + 2줄 + 우측 슬롯) 그것은
 * **개별 카드이고 목록 카드가 아니라** "헤더 + 행 여럿"이 안 나온다. 행 **내부**의 형이 같다는 사실은
 * 남으므로 소비자가 그 클래스를 참고한다.
 *
 * ⚠️ **hover 배경·`ring-inset`·전체-링크 형을 여기로 올리지 않는다** — 소비자에 남긴다. 헤더에 hover가
 * 붙으면 누를 수 없는 것이 눌릴 것처럼 보이고, `projects-cards.test.tsx`가 그것을 0으로 고정한다.
 */

/**
 * ⚠️ **`shrink-0`이 없으면 아래 행이 잘린다.** `overflow-hidden`을 든 flex 자식은 CSS의 automatic
 * minimum size가 적용되지 않아 축소 하한이 0이다 — 넘친 행은 카드 **안에** 감춰져 바깥 패널에
 * 스크롤조차 생기지 않는다 (실측 2026-09-11).
 *
 * ⚠️ **radius가 12이고 패널의 16이 아니다** — `rounded-lg`.
 */
export function RowCard({
  title,
  titleId,
  count,
  countLabel,
  description,
  action,
  children,
}: {
  title: string;
  /** `<ul aria-labelledby>`와 포커스 착지점이 이 id를 쓴다 (멤버 화면). `/projects`는 안 준다. */
  titleId?: string;
  count: number;
  /**
   * 카운트 배지의 sr-only 문장.
   *
   * ⚠️ **기본값을 두지 않는다** — 전에는 `m.projects.count(count)`가 이 자리에 박혀 있어서, 그대로
   * 공유하면 멤버 카드가 "3 projects"를 낭독한다. 숫자만 그리면 접근 이름이 "Members 3"이 되므로
   * 보이는 것은 숫자로 두고 스크린리더에는 완전한 문장을 준다.
   */
  countLabel: string;
  /**
   * 헤더의 설명 한 줄.
   *
   * ⚠️ **`/projects`가 이 슬롯을 안 쓰는 소비자다.** POSTMORTEM 2026-09-14가 정확히 이 모양이었다 —
   * 프리미티브의 여백 하나가 **그 슬롯을 안 쓰는** 소비자에게만 깨졌다. 그래서 조건을 코드에
   * **조건으로** 쓴다: 설명이 없으면 헤더는 예전과 글자 하나까지 같은 한 줄(`p-4` + `flex items-center gap-2`)이다.
   */
  description?: string;
  /** 헤더 오른쪽 슬롯 — `/projects` 검색 결과 카드의 `Clear search` 하나가 쓴다. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-background shrink-0 overflow-hidden rounded-lg border">
      <div className="p-4">
        <div className="flex items-center gap-2">
          {/*
            ⚠️ **id가 있으면 포커스도 받는다.** 이 id가 붙는 유일한 이유가 **행이 사라진 뒤의 착지점**
            이라서(malmoi#51), 둘을 갈라 두면 `getElementById`는 찾는데 `focus()`가 무시되어 포커스가
            다시 `body`로 빠진다 — 그리고 그 실패는 `?.`에 삼켜져 조용하다. 프리미티브가 짝을 든다.
          */}
          <h2
            id={titleId}
            tabIndex={titleId === undefined ? undefined : -1}
            className="text-base font-medium outline-none"
          >
            {title}
          </h2>
          {/* ⚠️ **배지가 `h2`의 바로 다음 형제여야 한다** — 두 렌더 테스트가 `h2 + span`으로 집는다. */}
          <Badge variant="neutral">
            <span aria-hidden>{count}</span>
            <span className="sr-only">{countLabel}</span>
          </Badge>
          {action}
        </div>
        {description !== undefined && (
          <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * 카드 안의 행 목록.
 *
 * ⚠️ **`<ul>`로 남는다** — 카드로 감싸면서 list role을 잃으면 스크린리더가 개수를 못 읽는다.
 *
 * ⚠️ **`@container`가 여기다 — 뷰포트가 아니다** (DESIGN §6.63). 셸이 `min-w-[1280px]`을 들어 뷰포트
 * 브레이크포인트는 영영 안 밟히고(가로 스크롤이 먼저 생긴다), **LNB가 200~320으로 리사이즈되므로
 * 같은 뷰포트가 두 폭을 만든다** — 실제로 변하는 것은 이 카드의 폭이다.
 */
export function RowCardList({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return (
    <ul aria-labelledby={labelledBy} className="@container">
      {children}
    </ul>
  );
}

/**
 * 행 하나.
 *
 * ⚠️ **선의 급이 둘이다** (캔버스 `1a`). 헤더↔첫 행은 `#f0f0f0`(`border-foreground/[0.06]`),
 * 행↔행은 `#e5e5e5`(`border-border`)다 — **헤더 divider가 행 구분선보다 약해야 "헤더 + 행들"로
 * 읽힌다.** 두 색은 압축된 PNG에서 구별되지 않으므로 스크린샷으로 판정하지 않는다.
 *
 * ⚠️ **철자를 하나로 고정한다** — `#f0f0f0`에는 `--divider` 토큰(`border-divider`)도 있지만 이 자리는
 * `border-foreground/[0.06]`이다(같은 색). 한 화면에 두 철자가 서지 않게 **여기가 정본**이다.
 *
 * ⚠️ **`divide-y`를 쓰지 않는다.** 사유 띠가 행의 형제로 `<li>` 안에 들어가는데, 그 규칙은 띠와 행
 * 사이에도 `#e5e5e5` 선을 넣는다 — 시안은 거기가 `#f0f0f0`이다. 그래서 행마다 `border-t`를 직접 준다.
 */
export function RowCardItem({ first = false, children }: { first?: boolean; children: ReactNode }) {
  return <li className={first ? "border-foreground/[0.06] border-t" : "border-border border-t"}>{children}</li>;
}

/**
 * 행 아래 띠 — **다음 한 수** 또는 **막힌 사유** (시안 `1c` · DESIGN §6.65).
 *
 * ⚠️ **행의 형제이고 `<a>` 안이 아니다** — 링크를 중첩할 수 없다. `/projects`에서는 `<li>` 안의
 * 둘째 블록이고, 멤버 행에서도 같은 자리다.
 *
 * ⚠️ **들여쓰기 56(`pl-14`)이 행 글리프 폭 + gap과 맞물린다** — 띠 텍스트가 행의 1행 텍스트와 같은 x에서
 * 시작해야 그 행에 속한 것으로 읽힌다.
 *
 * ⚠️ **13px은 `text-xs`다** — 이 리포는 `--text-xs: 13px`이고 `text-[13px]`은 전수 0건이다 (DESIGN §4.1).
 */
export function BannerLine({
  id,
  icon,
  children,
  action,
}: {
  /** `aria-describedby`의 대상. 꺼진 컨트롤이 이 띠를 가리킨다 (멤버 화면). */
  id?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      id={id}
      className="border-foreground/[0.06] bg-foreground/[0.02] text-muted-foreground flex items-center gap-2 border-t py-2 pr-3.5 pl-14 text-xs"
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </div>
  );
}

/**
 * 본문이 빌 때의 카드 — 아트보드 `1b`(프로젝트 0건)·`1d`(검색 0건)와 멤버 화면의 대기 초대 0건.
 *
 * ⚠️ **`components/ui/empty-state.tsx`를 쓰지 않는다.** 그쪽은 칩 48 + 아이콘 16 + `py-12`이고 여기는
 * 카드 규격(칩 36 · padding `48 24`)이다. 프리미티브를 이 규격에 맞추면 **표 안의 빈 상태 아홉이
 * 함께 움직인다**.
 *
 * ⚠️ **장식이 없다** (2026-09-15). 다른 블록이 전부 `border 1 · radius 12 · 흰 배경`인데 한 면만
 * 그라데이션 + 점 필드면 **빈 상태가 화면 중 가장 화려해진다.** 브랜드가 서는 자리는 로그인 화면이 든다.
 */
export function EmptyRowCard({
  icon: Icon,
  title,
  description,
  action,
  inset = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** 출구가 없는 소비자가 있다 — 대기 초대 0건은 **버튼을 두지 않는다**(할 일이 헤더의 [Invite]다). */
  action?: ReactNode;
  /**
   * **이미 `RowCard` 안인가.** 그러면 자기 테두리·radius를 내려놓고 헤더 divider와 같은 급의 선
   * 하나만 남긴다.
   *
   * ⚠️ **className으로 덮게 두지 않는다** — `rounded-lg`를 `rounded-none`으로, `border`를 `border-0`로
   * 되돌리는 식은 twMerge와 Tailwind의 유틸리티 순서에 기대는 것이고, 그 둘 중 하나가 바뀌면
   * **테두리가 두 겹으로 보이는 것 말고는 아무 신호가 없다.**
   */
  inset?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-3.5 px-6 py-12 text-center",
        inset ? "border-foreground/[0.06] border-t" : "border-border bg-background rounded-lg border",
      )}
    >
      {/*
        ⚠️ **칩이 36이고 글리프는 16이다.** 캔버스는 글리프를 18로 그리는데 DESIGN §6.8이 아이콘
        크기를 **셋(16·12·24)으로 고정**하므로 18은 넷째 값이 된다 — 36 칩 안의 2px이라 등재된 차이로 둔다.
      */}
      <span className="bg-foreground/[0.04] flex size-9 items-center justify-center rounded-sm text-neutral-600">
        <Icon className="size-4" aria-hidden />
      </span>
      {/*
        ⚠️ **`<p>` 둘이다 — `<span>`으로 두면 문단 경계가 0이 된다.** `flex flex-col`이 시각적으로는
        같은 결과를 내서 화면에도 테스트에도 안 나타난다.

        ⚠️ **래퍼가 `<div>`여야 한다** — `<span>`은 phrasing content라 flow content인 `<p>`를 담을 수
        없다. 파서가 자동으로 닫지 않고 React의 `validateDOMNesting`도 `pTagInButtonScope`만 보므로
        **화면에도 콘솔에도 테스트에도 안 나타난다.**
      */}
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-base font-medium">{title}</p>
        {/* ⚠️ **46ch다** — `max-w-prose`(65ch)는 한 문장을 세 줄로 흘려 칩·제목과 무게가 뒤집힌다. */}
        <p className="text-muted-foreground max-w-[46ch] text-sm leading-relaxed text-pretty">{description}</p>
      </div>
      {action}
    </div>
  );
}
