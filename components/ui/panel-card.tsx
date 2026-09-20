"use client";

import { useId, type ReactNode } from "react";

/** Shared account and project settings card. Header and row dividers have distinct roles. */
export function PanelCard({
  title,
  badge,
  subtitle,
  notice,
  children,
}: {
  title?: ReactNode;
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
    <section
      aria-labelledby={title === undefined ? undefined : titleId}
      // 배경을 카드가 든다 — 캔버스가 `#fff`를 카드에 명시했다. 오늘은 패널과 같은 값이다.
      className="@container border-border bg-background overflow-hidden rounded-lg border"
    >
      {/* 머리는 한 줄이다 — 제목·배지가 왼쪽, 설명이 `ml-auto`로 툴바 자리에 선다. */}
      {title !== undefined && <header className={`border-divider flex flex-wrap items-center gap-2 p-4 ${notice === undefined ? "border-b" : ""}`}>
        <h2 id={titleId} className="text-base font-medium tracking-[0.015em]">{title}</h2>
        {badge}
        {subtitle !== undefined && <div className="text-muted-foreground ml-auto @max-[640px]:ml-0 @max-[640px]:w-full text-xs tracking-[0.02em]">{subtitle}</div>}
      </header>}
      {notice}
      {/*
        ⚠️ **카드가 `<ul>`을 만들지 않는다** — Profile 카드의 몸통은 목록이 아니라 사실 블록이다.
        여기서 감싸면 `<ul>` 안에 `<div>`가 들어가 구조가 깨지고, 스크린리더가 편집 폼을 목록으로
        예고한다. 행을 드는 카드 셋만 `PanelRows`를 쓴다.
      */}
      {children}
    </section>
  );
}

/** 행 목록 래퍼 — 카드 넷 중 셋이 쓴다. 행 사이 선은 `PanelRow`가 `border-t`로 든다. */
export function PanelRows({ children }: { children: ReactNode }) {
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
export function PanelRow({
  glyph,
  name,
  status,
  detail,
  children,
}: {
  glyph: ReactNode;
  /** 이 행이 무엇에 대한 것인가 — 굵다. */
  name: ReactNode;
  /**
   * 이 행이 답하는 **상태**. ⚠️ **이름과 같은 줄·같은 크기다** — 13 보조 줄로 내리면 **부연으로
   * 읽히는데**, 상태는 이 행이 묻는 질문의 답이다. 구분자(em dash)는 여기서 든다: 호출부마다
   * 문자열에 박으면 한 화면에 `—`와 `-`가 섞인다.
   */
  status?: ReactNode;
  /** **다음에 할 일**을 든다. 없으면 그리지 않는다 — 빈 줄이 서면 행 높이가 이유 없이 갈린다. */
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="border-border flex items-center gap-3 border-t px-4 py-[13px] first:border-t-0">
      <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded">{glyph}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-base tracking-[0.015em]">
          <span className="font-medium">{name}</span>
          {status !== undefined && <> — {status}</>}
        </span>
        {/* 보조 문구의 행간이 1.5다 — `text-xs` 기본(1.333)보다 한 단계 넓다. */}
        {detail !== undefined && <span className="text-muted-foreground text-xs leading-normal tracking-[0.02em]">{detail}</span>}
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
export function PanelFacts({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 @min-[640px]:grid-cols-[96px_1fr] items-center gap-x-3 gap-y-[6px] @min-[640px]:gap-y-[14px] px-4 py-3.5">{children}</div>;
}
