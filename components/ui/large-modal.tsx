"use client";

import { Dialog as Primitive } from "radix-ui";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { CloseButton } from "@/components/ui/close-button";
import { closeAutoFocus } from "@/components/ui/dialog";
import { useMessages } from "@/components/i18n/messages-provider";
import type { Step } from "@/lib/onboarding/next-enabled";
import { cn } from "@/lib/utils";
import { useImeGuard } from "./use-ime-guard";

/**
 * 폭·radius·dim만 공유한다. 이력 상세의 본문·머리·높이 계약은 소비자에 남는다.
 * ⚠️ **패널이 `border`를 든다**(Dialog와 같다 — color-scheme design §3.8). 다크에서 scrim이 덮은 바탕과 패널 면이 약 1.07:1이고
 * `shadow-medium`은 안 보여, 선이 없으면 모달 가장자리가 사라진다. 라이트에서는 scrim 위 `#e5e5e5`라 사실상 그대로다.
 *
 * ⚠️ **`lg` 미만은 전체 화면 시트다** (responsive-public design §1 큰 모달 규칙 · 2026-10-10 사용자) — inset 0 · radius·선·그림자·scrim 없음 ·
 * `100dvh` · 위아래 safe-area. 규칙은 이 상수 한 곳이고 소비자(앱 모달 여덟 + `CommandDialog`)는 다시 지정하지 않는다.
 * ⚠️ **시트 토큰은 전부 `max-lg:`다** — `lg` 이상은 앞 토큰이 바이트로 그대로 남고(`large-modal-sheet.test.tsx`), 소비자의 높이
 * 덮어쓰기(`h-[…] min-h-0` 등)는 수식어가 달라 `cn()`이 시트 토큰을 지우지 않으며, 변형 유틸이 기본 유틸보다 뒤에 나와 CSS에서도 이긴다.
 * 높이 토큰이 `LARGE_MODAL_HEIGHT`가 아니라 여기 있는 이유: 이력 상세(`event-dialog.tsx`)가 패널만 쓰고 자기 `max-h`를 단다.
 * ⚠️ **`--spacing-modal-gutter`(96)를 재정의하지 않는다** — `lg` 이상에서는 1024×768에서도 928×672로 담긴다.
 * ⚠️ 랜딩 목업(`components/landing/mockup/publish.tsx`)은 이 상수를 import하지 않고 값을 복사한다 — 데스크톱 캔버스의 축소 복제라 시트가 되면 안 된다.
 */
export const LARGE_MODAL_OVERLAY = "bg-scrim/32 fixed inset-0 z-50 backdrop-blur-[6px] max-lg:bg-transparent max-lg:backdrop-blur-none";
export const LARGE_MODAL_PANEL = "bg-background border-border border fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-var(--spacing-modal-gutter))] max-w-[1024px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl shadow-medium max-lg:inset-0 max-lg:w-full max-lg:max-w-none max-lg:translate-none max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:h-dvh max-lg:min-h-0 max-lg:max-h-none max-lg:pt-[env(safe-area-inset-top)] max-lg:pb-[env(safe-area-inset-bottom)]";
/** CommandDialog도 같은 높이를 쓴다 — 위치를 바꿔도 하한·상한은 한 벌이다. */
export const LARGE_MODAL_HEIGHT = "min-h-[min(80svh,800px,calc(100svh-var(--spacing-modal-gutter)))] max-h-[min(800px,calc(100svh-var(--spacing-modal-gutter)))]";

/** 단계 전이·비동기 도착은 live 영역 하나를 공유한다. 버튼군은 호출부가 actions로 공급한다. */
export type LargeModalProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  step?: Step;
  notice?: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  /** Radix Content 패널 루트의 치수·배치 클래스. */
  className?: string;
  transitionKey?: string;
  quiet?: boolean;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /**
   * 열릴 때 포커스를 둘 자리 (2026-09-23 — 초대 모달 `1a`의 "첫 이메일"). ⚠️ **effect로 옮기면 진다** —
   * Radix의 열림 자동 포커스가 소비자 effect보다 늦게 돌아 패널이 가져간다(실측). 없으면 기존 동작 그대로다.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** ②만 `row`. */
  bodyDirection?: "column" | "row";
  /** ②④는 `hidden` — 안쪽 요소가 스크롤한다. */
  bodyScroll?: "auto" | "hidden";
  /** 로딩→완료 같은 비동기 전이를 `sr-only` live 영역에 흘려보낸다 (DESIGN §6.7). */
  announce?: string;
  /**
   * **본문 여백·바닥이 없는 목록 그릇** (2026-10-10 — 소비자는 `lg` 미만에서만 여는 Inbox 시트 · Docs 장 내비 시트). 행이 전폭 여백을 스스로 든다.
   * ⚠️ 암묵 조건(`actions` 없음)으로 바닥을 지우지 않는다 — Publish의 버튼 없는 갈래가 빈 바닥을 지금 그린다.
   */
  flush?: boolean;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
};

export function LargeModal({
  open,
  title,
  description,
  step,
  bodyDirection = "column",
  bodyScroll = "auto",
  announce,
  flush = false,
  onClose,
  children, notice, actions, closeLabel, closeDisabled = false, className, transitionKey, quiet = false, fallbackFocusRef, returnFocusRef, initialFocusRef,
}: LargeModalProps) {
  const m = useMessages();
  const bodyRef = useRef<HTMLDivElement>(null);
  const ime = useImeGuard();
  /**
   * live 영역에 **지금 말할 것**만 담는다. 제목을 상시 들고 있으면 헤더와 합쳐 두 번 읽히고,
   * 단계와 무관한 리렌더에도 같은 문장이 다시 낭독된다 (runtime-test 2026-09-13 실측).
   */
  const [live, setLive] = useState("");

  /**
   * ⚠️ **단계가 바뀌면 포커스를 본문으로 옮긴다** (DESIGN §6.7). 안 하면 [Next]를 누른 뒤 포커스가
   * 바닥에 남아, 스크린리더 사용자가 새 단계의 본문을 만나려면 위로 거슬러 올라가야 한다. 여기서
   * 한 번 하므로 단계마다 다시 배선하지 않는다.
   */
  const shown = useRef(transitionKey ?? step);
  const wasOpen = useRef(open);
  useEffect(() => {
    // ⚠️ **첫 렌더는 전이가 아니다.** 모달이 열릴 때 제목은 Radix가 `Dialog.Title`로 이미 말한다 —
    // 여기서 또 담으면 같은 문장이 두 번 낭독된다 (runtime-test 2026-09-13).
    const reopening = open && !wasOpen.current;
    wasOpen.current = open;
    if (transitionKey !== undefined && (!open || reopening)) {
      shown.current = transitionKey;
      setLive("");
      return;
    }
    if (shown.current === (transitionKey ?? step)) return;
    shown.current = transitionKey ?? step;
    if (!open) return;
    bodyRef.current?.focus();
    // 단계가 바뀐 그 순간에만 제목을 말한다 — 그 전이가 스크린리더에 닿는 유일한 신호다.
    setLive(!quiet && typeof title === "string" ? title : "");
    // ⚠️ `title`을 의존성에 넣지 않는다 — 같은 단계에서 제목만 바뀌는 경우(②의 예외 E)는 전이가
    // 아니고, 넣으면 그때마다 다시 낭독된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, transitionKey, open, quiet]);

  // 비동기 완료는 단계 전이와 별개 신호다 — 도착한 순간에만 담는다.
  useEffect(() => {
    if (announce !== undefined) setLive(announce);
  }, [announce]);

  return (
    <Primitive.Root open={open} onOpenChange={(next) => { if (!next && !closeDisabled) onClose(); }}>
      <Primitive.Portal>
        {/*
          dim은 `bg-scrim/32` — 기존 `Dialog`의 `/40`과 값이 갈리는 것이 의도다(이 모달은 뒤의
          목록이 읽혀야 한다). ⚠️ **리포 최초의 `backdrop-*`다** (DESIGN §6.2 등재 대상).
        */}
        {/* ⚠️ 닫기를 막은 동안 오버레이 mousedown이 포커스를 `body`로 떨어뜨리지 않게 한다 — `Dialog`와 같은 이유다(#169). */}
        <Primitive.Overlay className={LARGE_MODAL_OVERLAY} onMouseDown={closeDisabled ? (event) => event.preventDefault() : undefined} />
        <Primitive.Content
          /**
           * ⚠️ **높이를 dim padding(48×2)을 뺀 값에 물린다.** 핸드아웃의 `min-height:80vh;
           * max-height:100%`를 그대로 쓰면 `min-height`가 이겨서 1280×720에서 바닥의 [Back]·[Next]가
           * 화면 밖으로 나간다(계보: malmoi#33 — 계산한 치수가 실제 가용을 안 뺐다).
           *
           * ⚠️ **`vh`가 아니라 `svh`다** — 셸이 `h-svh`이고 `shell-layout.test.ts`가 `min-h-svh`를
           * 금지한다. 여기만 `vh`면 모바일 주소창 높이에서 혼자 어긋난다.
           *
           * ⚠️ **높이 상한이 800이고 그 값이 `min-h`에도 들어간다** (2026-09-13 사용자). CSS는
           * `min-height`가 `max-height`를 **이기므로**, 상한만 800으로 막고 하한을 80svh로 두면
           * 1,100px 화면에서 하한(880)이 이겨 상한이 없는 것과 같아진다. 세 값 중 가장 작은 것이
           * 이기도록 `min()` 안에 함께 넣는다.
           */
          onOpenAutoFocus={
            initialFocusRef !== undefined
              ? (event) => { event.preventDefault(); (initialFocusRef.current ?? (event.currentTarget as HTMLElement)).focus(); }
              : transitionKey === undefined ? undefined : (event) => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }
          }
          /**
           * ⚠️ **`returnFocusRef`가 없으면 `Dialog`와 같은 최근 기록 복귀다** (malmoi#207). Radix 모달 Content는 닫힘 자동 포커스를 늘 막고 `triggerRef`로
           * 보내는데 이 껍데기엔 트리거가 없다 — 헤더 링크가 여는 New project 모달(`open` 늘 참, 닫기 = `router.back()`으로 슬롯째 언마운트)은 닫으면
           * `body`에 남았다. FocusScope의 "열 때 포커스"도 못 믿는다 — 슬롯의 `Suspense`가 폴백 모달을 실제 모달로 바꿔 끼우는 사이 `body`다.
           */
          onCloseAutoFocus={returnFocusRef === undefined ? (event) => closeAutoFocus(event) : (event) => {
            event.preventDefault();
            const target = returnFocusRef.current;
            if (target?.isConnected && !target.matches(":disabled")) target.focus();
            else fallbackFocusRef?.current?.focus();
          }}
          onCompositionStart={ime.onCompositionStart}
          onCompositionEnd={ime.onCompositionEnd}
          // 조합 중 Esc는 조합 취소다 — 닫지 않는다(C9). 이 모달은 Esc 소비자 prop이 없어 가드만 단다.
          onEscapeKeyDown={(event) => { if (ime.blocks(event)) event.preventDefault(); }}
          data-onboarding-panel
          className={cn(
            LARGE_MODAL_PANEL,
            LARGE_MODAL_HEIGHT,
            className,
          )}
        >
          {/*
            ⚠️ **`sr-only` live 영역 하나다.** 단계 제목과 비동기 전이를 같은 자리에 쓴다 — 둘로
            나누면 스크린리더가 순서를 보장하지 않는다. **담기는 것은 전이뿐이다** (위 effect 둘).
          */}
          <div aria-live={quiet ? "off" : "polite"} className="sr-only">
            {live}
          </div>

          {/*
            시트(`lg` 미만)의 머리는 56 · 좌 16 · 우 12 · 아래 divider · 제목 18 · 닫기 32다(design §2 전체 화면 시트). 설명이 있으면 그만큼 자란다.
            ⚠️ **머리를 세로 가운데로 정렬하지 않는다** — 설명이 감기면 닫기가 제목+설명 묶음의 가운데로 내려간다. 정렬은 넓은 폭과 같은
            `items-start`이고, 제목 묶음이 최소 32(닫기 높이)에서 세로 가운데라 제목 단독일 때는 56 안에서 둘 다 가운데다.
            ⚠️ **56은 divider를 품은 값이다**(#215 — 검색 시트와 같다) — 위 12 + 32 + 아래 11 + 선 1. 아래도 12면 57이 `min-h-14`를 이긴다.
          */}
          <header className="flex items-start justify-between gap-2 px-8 pt-8 pb-5 max-lg:min-h-14 max-lg:border-b max-lg:border-divider max-lg:pt-3 max-lg:pb-2.75 max-lg:pr-3 max-lg:pl-4">
            <div className="flex min-w-0 flex-col gap-1.5 max-lg:min-h-8 max-lg:justify-center">
              <Primitive.Title className="text-xl font-medium max-lg:text-lg">{title}</Primitive.Title>
              {description !== undefined && (
                <Primitive.Description className="text-muted-foreground text-sm text-pretty">
                  {description}
                </Primitive.Description>
              )}
            </div>
            {/*
              ⚠️ **`asChild`를 쓰지 않는다** — `DialogClose asChild` 자식 옆에 형제를 두는 형이
              POSTMORTEM 2026-09-09의 지뢰다. 여기서는 Close 자신이 버튼이다.
            */}
            <div className="flex shrink-0 items-center gap-2">
            <CloseButton type="button" label={closeLabel ?? m.newProject.modal.close} disabled={closeDisabled} onClick={onClose} className="max-lg:size-8" />
            </div>
          </header>

          {/*
            ⚠️ **`min-h-0 flex-1`이 짝이다** — 껍데기가 `overflow-hidden`이라 이게 없으면 본문이
            바닥을 밀어낸다 (`PanelBody`와 같은 관용구).
          */}
          {/*
            ⚠️ **`pt-0.5`가 포커스 링 자리다** (2026-09-13 실측). 이 컨테이너가 스크롤·클리핑을 겸하는데
            위쪽 여백이 0이면 **맨 위 요소의 링 2px이 통째로 잘린다** — 1단계 리포 검색 필드에서
            상단만 잘려 보였다. 링은 box-shadow라 요소 밖으로 퍼지고, 스크롤 때문에 `overflow`는
            뗄 수 없다. 필드마다 `ring-inset`을 덧대는 대신 여기서 2px을 내주는 이유는 **네 단계의
            첫 요소가 전부 같은 자리**여서다.
          */}
          <div
            ref={bodyRef}
            data-onboarding-body
            tabIndex={-1}
            className={flush ? "flex min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none" : cn(
              // 시트에서는 안쪽 16 — 375에서 본문 343이라 초대 행(이메일 + 역할 168)이 든다. 위 16은 머리 divider에서 띄운다.
              "flex min-h-0 flex-1 gap-4 px-8 pt-0.5 pb-6 focus:outline-none max-lg:px-4 max-lg:pt-4",
              bodyDirection === "row" ? "flex-row" : "flex-col",
              bodyScroll === "hidden" ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {children}
          </div>

          {!flush && <footer className="border-divider flex items-center justify-between gap-2 border-t px-8 py-6 max-lg:px-4">
            <span className="text-muted-foreground text-xs leading-body">{notice ?? (step === undefined ? null : m.newProject.modal.step(step))}</span>
            {/*
              ⚠️ **소비자의 `actions`도 같은 무리에 싼다** (malmoi#87) — fragment를 넘기면 버튼들이 바닥의 직계 자식이 되어
              `justify-between`이 [Cancel]을 가운데로 띄웠다. `null`(Publish의 버튼 없는 갈래)이면 빈 무리를 세우지 않는다.
            */}
            {actions === null || actions === false ? null : <div className="flex items-center gap-2">{actions}</div>}
          </footer>}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
