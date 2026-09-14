"use client";

import { useId, type ReactNode } from "react";

/**
 * `/account`의 **구역 규격 하나** (account-settings 태스크 4).
 *
 * ⚠️ **래퍼가 목록 전체에 하나다** — 항목마다 테두리를 주면 셋뿐인 목록이 카드 갤러리처럼
 * 무거워진다. 새 프로젝트 모달의 리포 목록과 같은 구조다(테두리 하나 + `overflow-hidden` +
 * 둘째부터 `border-top`).
 *
 * ⚠️ **`Card`가 아니다.** 카드 다섯이 `space-y-6`으로 평평하게 쌓여 있던 것이 이 화면을 고치는
 * 근거였다 — 카드는 구역이 서로 대등하다고 말하는데, 여기서는 머리 하나 밑에 리스트 셋이다.
 */
export function AccountSection({
  title,
  subtitle,
  notice,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  /** 구역 Alert — **헤더 아래·리스트 위**다. 머리 Alert와 달리 [Dismiss]가 없다. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  /**
   * ⚠️ **구역에 접근 이름을 건다.** 이 화면의 요지가 *"같은 화면에 GitHub이 세 군데"*를 **구역
   * 제목**으로 가르는 것인데, 이름이 없으면 스크린리더에 region 셋이 이름 없이 온다 — 화면에서
   * 하는 구별이 그 사용자에게만 사라진다.
   */
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      {/* 제목과 부제가 한 줄에 서므로 baseline으로 맞춘다 — center면 13과 14의 밑선이 어긋난다. */}
      <div className="flex items-baseline gap-2">
        <h2 id={titleId} className="text-sm font-medium">{title}</h2>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>
      {notice}
      <ul className="border-border overflow-hidden rounded-lg border">{children}</ul>
    </section>
  );
}

/**
 * 항목 규격 하나 — 글리프 32(radius 8) · 이름 14 · 보조 13 · 우측 컨트롤.
 *
 * ⚠️ **우측 컨트롤이 `shrink-0`이다.** 없으면 이름이 긴 계정에서 버튼이 줄바꿈돼 행 높이가 튄다 —
 * 줄어들 자리는 본문의 `min-w-0`과 `truncate`가 든다.
 */
export function AccountRow({
  glyph,
  name,
  detail,
  children,
}: {
  glyph: ReactNode;
  name: ReactNode;
  /** 없으면 그리지 않는다 — 빈 줄이 서면 항목 높이가 이유 없이 갈린다. */
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="border-border flex items-center gap-3 border-t p-3 first:border-t-0">
      <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-sm">{glyph}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm">{name}</span>
        {/* 보조 문구의 행간이 1.5다 — `text-xs` 기본(1.333)보다 한 단계 넓다. */}
        {detail !== undefined && <span className="text-muted-foreground text-xs leading-normal">{detail}</span>}
      </div>
      {children !== undefined && <div className="flex shrink-0 items-center gap-3">{children}</div>}
    </li>
  );
}
