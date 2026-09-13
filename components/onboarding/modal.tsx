"use client";

import { ArrowRight, X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import type { Step } from "@/lib/onboarding/next-enabled";
import { cn } from "@/lib/utils";

/**
 * 새 프로젝트 온보딩 모달의 **껍데기** — 네 단계가 이것을 공유하고 본문만 넘긴다
 * (new-project-modal design §2.1·§8).
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
 * ⚠️ **바닥 버튼이 `Button size="lg"`다.** 그 크기의 주석이 "셸 밖 카드 전용(로그인·초대 수락 둘)"인데
 * **이 모달을 그 예외에 넣었다** — dim 위에 뜬 표면이라 셸 안이 아니고, 핸드오프의 40/radius 12가
 * `lg`와 **정확히 같다**. 새 `size`를 만들면 "어느 걸 쓰나"가 매 화면 판단이 된다 (design §8). 
 */
export type OnboardingModalProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  step: Step;
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
  /** 로딩→완료 같은 비동기 전이를 `sr-only` live 영역에 흘려보낸다 (design §1.2.1). */
  announce?: string;
  onNext: () => void;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
};

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
  children,
}: OnboardingModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  /**
   * live 영역에 **지금 말할 것**만 담는다. 제목을 상시 들고 있으면 헤더와 합쳐 두 번 읽히고,
   * 단계와 무관한 리렌더에도 같은 문장이 다시 낭독된다 (bugshot-qa 2026-09-13 실측).
   */
  const [live, setLive] = useState("");

  /**
   * ⚠️ **단계가 바뀌면 포커스를 본문으로 옮긴다** (design §1.2.1). 안 하면 [Next]를 누른 뒤 포커스가
   * 바닥에 남아, 스크린리더 사용자가 새 단계의 본문을 만나려면 위로 거슬러 올라가야 한다. 여기서
   * 한 번 하므로 단계마다 다시 배선하지 않는다.
   */
  const shown = useRef(step);
  useEffect(() => {
    // ⚠️ **첫 렌더는 전이가 아니다.** 모달이 열릴 때 제목은 Radix가 `Dialog.Title`로 이미 말한다 —
    // 여기서 또 담으면 같은 문장이 두 번 낭독된다 (bugshot-qa 2026-09-13).
    if (shown.current === step) return;
    shown.current = step;
    bodyRef.current?.focus();
    // 단계가 바뀐 그 순간에만 제목을 말한다 — 그 전이가 스크린리더에 닿는 유일한 신호다.
    setLive(typeof title === "string" ? title : "");
    // ⚠️ `title`을 의존성에 넣지 않는다 — 같은 단계에서 제목만 바뀌는 경우(②의 예외 E)는 전이가
    // 아니고, 넣으면 그때마다 다시 낭독된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 비동기 완료는 단계 전이와 별개 신호다 — 도착한 순간에만 담는다.
  useEffect(() => {
    if (announce !== undefined) setLive(announce);
  }, [announce]);

  return (
    <Primitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
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
           */
          data-onboarding-panel
          className={cn(
            "bg-background fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-96px)] max-w-[960px] -translate-x-1/2 -translate-y-1/2",
            "flex-col overflow-hidden rounded-xl shadow-medium",
            "min-h-[min(80svh,calc(100svh-96px))] max-h-[calc(100svh-96px)]",
          )}
        >
          {/*
            ⚠️ **`sr-only` live 영역 하나다.** 단계 제목과 비동기 전이를 같은 자리에 쓴다 — 둘로
            나누면 스크린리더가 순서를 보장하지 않는다. **담기는 것은 전이뿐이다** (위 effect 둘).
          */}
          <div aria-live="polite" className="sr-only">
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
              aria-label={m.newProject.modal.close}
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
          <div
            ref={bodyRef}
            data-onboarding-body
            tabIndex={-1}
            className={cn(
              "flex min-h-0 flex-1 gap-4 px-8 pb-6 focus:outline-none",
              bodyDirection === "row" ? "flex-row" : "flex-col",
              bodyScroll === "hidden" ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {children}
          </div>

          <footer className="border-divider flex items-center justify-between gap-2 border-t px-8 py-6">
            <span className="text-muted-foreground text-xs leading-[1.6]">{m.newProject.modal.step(step)}</span>
            <div className="flex items-center gap-2">
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
                className="disabled:bg-background disabled:border-border disabled:text-muted-foreground disabled:border disabled:opacity-100"
              >
                {nextLabel ?? m.newProject.modal.next}
                {nextArrow && <ArrowRight className="size-4" aria-hidden />}
              </Button>
            </div>
          </footer>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
