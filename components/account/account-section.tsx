"use client";

import { useId, type ReactNode } from "react";

/**
 * `/account`의 **카드 규격 하나** (2026-09-16 — 핸드오프 v2).
 *
 * ⚠️ **제목이 카드 안으로 들어왔다.** 전엔 카드 밖 14/500 소제목 + 옆 회색 설명문이었는데, 그러면
 * 제목과 리스트 사이에 **주인 없는 12px**이 생기고 그 틈이 카드 사이 간격과 경쟁해 화면이 몇
 * 덩이인지 세어야 읽힌다. 전역 패널 규칙이 정한 자리가 카드 헤더이고, Project Home의
 * `Needs your attention`·`Recent logs`와 같은 머리다.
 *
 * ⚠️ **공유 프리미티브를 뽑지 않는다.** Project Home의 카드와 같은 규격이 되지만 그쪽은 빈 상태·
 * `<details>`·Meter를 각자 들고 있어, 추출하면 이 기능이 브라우저로 밟지 않는 화면이 함께 움직인다
 * (POSTMORTEM 2026-09-15 🔁 — 형제 프리미티브 둘을 옮기며 한쪽 소비자만 셌다). **중복이 셋이 되면**
 * 그때 뽑고, 그 판단은 `docs/DESIGN.md` §6.67에 있다.
 *
 * ⚠️ **디바이더가 둘이다** — 헤더 아래 `--divider`(#f0f0f0) · 행 사이 `--border`(#e5e5e5). 같은
 * 회색 하나면 머리가 **첫 행처럼** 보인다: 옅은 선이 "여기부터 내용", 진한 선이 "항목과 항목"이다.
 *
 * ⚠️ **`rounded-lg`가 12다** — 이 리포에서 `rounded-xl`은 **16**이라 카드가 한 단계 둥글어진다
 * (POSTMORTEM 2026-09-15).
 */
export function AccountCard({
  title,
  badge,
  subtitle,
  notice,
  children,
}: {
  title: ReactNode;
  /** 헤더 제목 옆 카운트 배지 — **수단 카드에만** 있다(세는 값이 그 카드에만 있다). */
  badge?: ReactNode;
  /**
   * 헤더 오른쪽 한 줄. ⚠️ **제목 아래로 쌓지 않는다** — 머리 높이가 카드마다 달라져 행 시작선이
   * 어긋난다. 이 화면에는 툴바가 없어 그 자리가 비어 있었다.
   */
  subtitle?: ReactNode;
  /** 카드 Alert — **헤더 아래·리스트 위**다. 머리 Alert와 달리 닫기가 없다. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  /**
   * ⚠️ **카드에 접근 이름을 건다.** 없으면 Chrome이 `<section>`을 `generic`으로 접어 **접근성
   * 트리에서 카드가 통째로 사라진다** (POSTMORTEM 2026-09-15 #2). 이 화면의 요지가 *"같은 화면에
   * GitHub이 세 군데"*를 카드 제목으로 가르는 것인데, 이름이 없으면 그 구별이 그 사용자에게만
   * 없어진다.
   */
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="border-border overflow-hidden rounded-lg border">
      {/* 머리는 한 줄이다 — 제목·배지가 왼쪽, 설명이 `ml-auto`로 툴바 자리에 선다. */}
      <div className="border-divider flex items-center gap-2 border-b p-4">
        <h2 id={titleId} className="text-base font-medium tracking-[0.015em]">{title}</h2>
        {badge}
        {subtitle !== undefined && <p className="text-muted-foreground ml-auto text-xs">{subtitle}</p>}
      </div>
      {notice}
      {/*
        ⚠️ **카드가 `<ul>`을 만들지 않는다** — Profile 카드의 몸통은 목록이 아니라 사실 블록이다.
        여기서 감싸면 `<ul>` 안에 `<div>`가 들어가 구조가 깨지고, 스크린리더가 편집 폼을 목록으로
        예고한다. 행을 드는 카드 셋만 `AccountRows`를 쓴다.
      */}
      {children}
    </section>
  );
}

/** 행 목록 래퍼 — 카드 넷 중 셋이 쓴다. 행 사이 선은 `AccountRow`가 `border-t`로 든다. */
export function AccountRows({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}

/**
 * 행 규격 하나 — Project Home의 attention 행과 같다: padding `13px 16px` · 글리프 28(radius 4) ·
 * 본문 15 · 보조 13.
 *
 * ⚠️ **hover 배경이 없다.** 치수는 Project Home에서 빌리고 **상호작용은 빌리지 않는다** — 그쪽은
 * 행 전체가 링크라 배경이 깔리지만, 여기서 누를 수 있는 것은 우측 버튼뿐이라 hover를 주면 행을
 * 눌러도 되는 것처럼 보인다.
 *
 * ⚠️ **상태가 이름과 같은 줄·같은 크기다.** 13 보조 줄로 내리면 **부연으로 읽히는데**, 상태는 이
 * 행이 답하는 값이다. 보조 줄은 "다음에 할 일"을 든다.
 *
 * ⚠️ **우측 컨트롤이 `shrink-0`이다** — 없으면 이름이 긴 계정에서 버튼이 줄바꿈돼 행 높이가 튄다.
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
  /** 없으면 그리지 않는다 — 빈 줄이 서면 행 높이가 이유 없이 갈린다. */
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="border-border flex items-center gap-3 border-t px-4 py-[13px] first:border-t-0">
      <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded">{glyph}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-base tracking-[0.015em]">{name}</span>
        {/* 보조 문구의 행간이 1.5다 — `text-xs` 기본(1.333)보다 한 단계 넓다. */}
        {detail !== undefined && <span className="text-muted-foreground text-xs leading-normal">{detail}</span>}
      </div>
      {children !== undefined && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </li>
  );
}

/**
 * Profile 카드의 **사실 블록** — 라벨 열 96 · `14px 16px`. Project Home 오른쪽 `Project` 카드의
 * 메타 열과 같은 형이다.
 *
 * ⚠️ **`<ul>`이 아니다.** 아바타·이름·이메일은 항목이 아니라 한 덩이의 사실이고, `<li>`로 만들면
 * 스크린리더가 "목록, 항목 3개"로 예고한 뒤 **편집 가능한 폼**을 읽는다.
 *
 * ⚠️ **행마다 `items-center`가 아니라 첫 줄 정렬이 필요한 칸이 있다** — 아바타 행은 두 열을
 * 가로지르므로 호출부가 `full`로 표시한다.
 */
export function AccountFacts({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-4 px-4 py-3.5">{children}</div>;
}
