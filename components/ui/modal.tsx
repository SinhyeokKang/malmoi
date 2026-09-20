"use client";

import { ArrowRight, X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import type { Step } from "@/lib/onboarding/next-enabled";
import { cn } from "@/lib/utils";

/**
 * 새 프로젝트 온보딩 모달의 **껍데기** — 네 단계가 이것을 공유하고 본문만 넘긴다
 * (DESIGN §6.7).
 *
 * ⚠️ **`components/ui/dialog.tsx`를 쓰지 않는다.** 그 프리미티브로는 §8의 껍데기가 만들어지지
 * 않는다 — Overlay가 `bg-foreground/40` **고정**이고, 머리·본문·바닥 padding이 박혀 있고, 바닥이
 * `justify-end`라 왼쪽 `Step n of 4`를 못 넣는다. 고치면 초대·확인·아카이브·로그인수단 모달 **넷이
 * 함께 움직인다** — 그것이 원래 피하려던 결과라, Radix `Dialog.*`를 직접 조립한다. 프리미티브를
 * **안 쓰고 안 고치므로** 다른 화면은 그대로다.
 *
 * ⚠️ **스텝퍼를 세우지 않는다** — 네 칸이 누를 수 없는 장식이 된다. 진행은 `Step n of 4` 한 줄이다.
 *
 * ⚠️ **[Back]·[Next]를 껍데기가 소유한다.** 단계는 본문과 "다음으로 갈 수 있는가"만 넘긴다 —
 * 비활성 모양을 단계마다 다시 만들면 갈린다.
 *
 * ⚠️ **폭이 800이다 — 핸드오프 값으로 돌아왔다** (2026-09-13 사용자). 880을 거쳐 왔고, **②의 값이
 * 덜 보이는 것을 감수한 결정이다**: 좌측 240 + 표 `1fr 2fr`인 지금 값 셀이 800에서 ≈291(880에서
 * ≈344)이라 한때 960으로 올렸던 이유 — "800이면 ≈188px라 24자에서 잘린다", 그 계산의 전제는 좌측
 * 300 + `1fr 1fr`이었다 — 는 어차피 되살아나지 않는다.
 * ⚠️ **좌측 240과 `1fr 2fr`은 유지한다** — 그 둘까지 시안으로 되돌리면(300 · `1fr 1fr`) 값 셀이
 * ≈244로 내려가 그 문제가 정말로 돌아온다.
 *
 * ⚠️ **바닥 버튼이 `Button size="lg"`다.** 그 크기의 주석이 "셸 밖 카드 전용(로그인·초대 수락 둘)"인데
 * **이 모달을 그 예외에 넣었다** — dim 위에 뜬 표면이라 셸 안이 아니고, 핸드오프의 40/radius 12가
 * `lg`와 **정확히 같다**. 새 `size`를 만들면 "어느 걸 쓰나"가 매 화면 판단이 된다 (DESIGN §6.4).
 */
export type OnboardingModalProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  step?: Step;
  footer?: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  panelClassName?: string;
  transitionKey?: string;
  quiet?: boolean;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  nextLabel?: string;
  /** ③은 확정이라 화살표가 없다 — 다음이 아니라 결과다. */
  nextArrow?: boolean;
  nextDisabled?: boolean;
  /** ③ 제출 중 — [Next]만 잠긴다. 본문은 그대로 서서 입력값을 보인다. */
  nextPending?: boolean;
  /** ①④는 false — ①의 닫는 길은 X·Esc·backdrop이고, ④는 되돌릴 것이 없다. */
  showBack?: boolean;
  /** ②만 `row`. */
  bodyDirection?: "column" | "row";
  /** ②④는 `hidden` — 안쪽 요소가 스크롤한다. */
  bodyScroll?: "auto" | "hidden";
  /** 로딩→완료 같은 비동기 전이를 `sr-only` live 영역에 흘려보낸다 (DESIGN §6.7). */
  announce?: string;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
} & ({ actions?: undefined; onNext: () => void } | { actions: ReactNode; onNext?: () => void });

export function OnboardingModal({
  open,
  title,
  description,
  step,
  nextLabel,
  nextArrow = true,
  nextDisabled = false,
  nextPending = false,
  showBack = false,
  bodyDirection = "column",
  bodyScroll = "auto",
  announce,
  onNext,
  onBack,
  onClose,
  children, footer, actions, closeLabel, closeDisabled = false, panelClassName, transitionKey, quiet = false, fallbackFocusRef, returnFocusRef,
}: OnboardingModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  /**
   * live 영역에 **지금 말할 것**만 담는다. 제목을 상시 들고 있으면 헤더와 합쳐 두 번 읽히고,
   * 단계와 무관한 리렌더에도 같은 문장이 다시 낭독된다 (bugshot-qa 2026-09-13 실측).
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
    // 여기서 또 담으면 같은 문장이 두 번 낭독된다 (bugshot-qa 2026-09-13).
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
          dim은 `bg-foreground/32` — 기존 `Dialog`의 `/40`과 값이 갈리는 것이 의도다(이 모달은 뒤의
          목록이 읽혀야 한다). ⚠️ **리포 최초의 `backdrop-*`다** (DESIGN §6.2 등재 대상).
        */}
        <Primitive.Overlay className="bg-foreground/32 fixed inset-0 z-50 backdrop-blur-[6px]" />
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
          onOpenAutoFocus={transitionKey === undefined ? undefined : (event) => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}
          onCloseAutoFocus={returnFocusRef === undefined ? undefined : (event) => {
            event.preventDefault();
            const target = returnFocusRef.current;
            if (target?.isConnected && !target.matches(":disabled")) target.focus();
            else fallbackFocusRef?.current?.focus();
          }}
          data-onboarding-panel
          className={cn(
            "bg-background fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-96px)] max-w-[1024px] -translate-x-1/2 -translate-y-1/2",
            "flex-col overflow-hidden rounded-xl shadow-medium",
            "min-h-[min(80svh,800px,calc(100svh-96px))] max-h-[min(800px,calc(100svh-96px))]",
            panelClassName,
          )}
        >
          {/*
            ⚠️ **`sr-only` live 영역 하나다.** 단계 제목과 비동기 전이를 같은 자리에 쓴다 — 둘로
            나누면 스크린리더가 순서를 보장하지 않는다. **담기는 것은 전이뿐이다** (위 effect 둘).
          */}
          <div aria-live={quiet ? "off" : "polite"} className="sr-only">
            {live}
          </div>

          <header className="flex items-start justify-between gap-2 px-8 pt-8 pb-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Primitive.Title className="text-xl font-medium tracking-[0.005em]">{title}</Primitive.Title>
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
            <Button
              type="button"
              variant="ghost"
              aria-label={closeLabel ?? m.newProject.modal.close}
              disabled={closeDisabled}
              onClick={onClose}
              className="hover:bg-foreground/3 size-9 rounded-full px-0"
            >
              <X className="size-5" aria-hidden />
            </Button>
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
            className={cn(
              "flex min-h-0 flex-1 gap-4 px-8 pt-0.5 pb-6 focus:outline-none",
              bodyDirection === "row" ? "flex-row" : "flex-col",
              bodyScroll === "hidden" ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {children}
          </div>

          <footer className="border-divider flex items-center justify-between gap-2 border-t px-8 py-6">
            <span className="text-muted-foreground text-xs leading-[1.6]">{footer ?? (step === undefined ? null : m.newProject.modal.step(step))}</span>
            {actions !== undefined ? actions : <div className="flex items-center gap-2">
              {showBack && (
                <Button type="button" size="lg" onClick={onBack} disabled={nextPending}>
                  {m.newProject.modal.back}
                </Button>
              )}
              {/*
                ⚠️ **비활성 모양을 껍데기가 든다** — 흰 배경 + border + muted 글자 + `not-allowed`.
                단계마다 다시 만들면 갈린다.
              */}
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={onNext}
                disabled={nextDisabled}
                loading={nextPending}
              >
                {nextLabel ?? m.newProject.modal.next}
                {nextArrow && <ArrowRight className="size-4" aria-hidden />}
              </Button>
            </div>}
          </footer>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
