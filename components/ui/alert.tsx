"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { useMessages } from "@/components/i18n/messages-provider";
import { cn } from "@/lib/utils";

import { CloseButton } from "./close-button";
import { neighbourFocus } from "./focus";

/**
 * Publish 결과 · 편집 손실 배너 · 페이지 수준 거부 · 카드 안 실패 · Dialog 안 경고가 전부 이것이다.
 *
 * ⚠️ **색은 배경과 글리프만 든다** (DESIGN §6.2, 2026-09-29 사용자) — 테두리가 없고 글자는 tone과 무관하게
 * 본문 색이다. 전엔 danger만 글자가 빨갛고 warning만 amber-900이라 tone마다 규칙이 달랐다.
 * ⚠️ **variant는 뜻으로 고른다.** `neutral`은 상시 조건(가장 흔한 상태가 가장 조용하다 — §6.1)이고
 * `info`는 지금 알아둘 것이다. 버린 값이 있는 결과는 `success`가 아니라 `warning`이다(ARCHITECTURE §0 불변식 9).
 */
const alert = cva("flex", {
  variants: {
    variant: {
      neutral: "bg-muted",
      info: "bg-blue-50",
      success: "bg-green-50",
      warning: "bg-amber-50",
      danger: "bg-red-50",
    },
    /**
     * ⚠️ `sm`은 좁은 자리(360 Dialog · 상세 노트)의 형이다 — `p-4`면 360 Dialog 본문 폭이 296으로 떨어져
     * 두 줄 문장이 네 줄이 된다 (Sync 시안 §7).
     */
    size: {
      md: "gap-3 rounded-lg p-4 text-sm",
      sm: "gap-2 rounded-md p-3 text-xs",
    },
  },
  defaultVariants: { variant: "neutral", size: "md" },
});

type Tone = NonNullable<VariantProps<typeof alert>["variant"]>;

const ICON: Record<Tone, ComponentType<{ className?: string }>> = {
  neutral: Info,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
};

const ICON_CLASS: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-link",
  success: "text-green-800",
  warning: "text-amber-700",
  danger: "text-destructive",
};

export function Alert({
  variant,
  size,
  inset = false,
  title,
  actions,
  onDismiss,
  live,
  id,
  className,
  children,
}: VariantProps<typeof alert> & {
  /** 카드 머리 아래 붙는 띠 — radius가 없고 좌우가 카드 끝까지 간다. */
  inset?: boolean;
  /** 구두점 없는 문장 조각 (§10). */
  title?: ReactNode;
  /** 최대 둘 (§6.4). */
  actions?: ReactNode;
  /** 있으면 우상단에 닫기가 붙는다. */
  onDismiss?: () => void;
  /**
   * 알림 방식 — **tone이 아니라 이 prop이 정한다.** 기본값만 tone에서 온다: `danger`는 `alert`(읽던 것을
   * 끊는다), 나머지는 없음. 비동기 진행·결과를 말하는 Alert는 `status`로 올린다(온보딩 ④의 "Importing…" —
   * 조용히 바뀌면 스크린리더 사용자에게는 아무 일도 안 일어난 화면이다). ⚠️ **지난 기록은 `off`다** —
   * 이벤트 상세의 실패 노트를 `danger`로 두면 여는 순간 assertive로 끼어든다(B6 r1, DESIGN §6.644).
   *
   * ⚠️ **보장은 "내용이 바뀌면 알린다"까지다** (2026-09-16 판정). 이 Alert는 **자기 자신이 내용과
   * 함께 트리에 들어왔다가 통째로 사라지는** 자리에도 서는데, live 영역은 **삽입 시점에 등록**되므로
   * 그렇게 들어온 첫 내용은 스크린리더·브라우저 조합에 따라 안 읽힐 수 있다. 제거는 `aria-relevant`
   * 기본값이 announce하지 않으므로 **언제나** 안 읽힌다.
   *
   * ⚠️ **빈 래퍼를 상시로 세우는 표준 해법을 쓰지 않는다** — 래퍼를 덧씌우면 live 영역이 중첩돼 같은
   * 문장이 두 번 읽힐 수 있고, **스크린리더 실측 수단이 없어** 고친 쪽이 나아졌는지 확인할 방법도 없다.
   * 약속하지 않는 것을 주석이 약속하지 않게 두는 쪽을 골랐다.
   */
  live?: "alert" | "status" | "off";
  /** 다른 컨트롤의 `aria-describedby` 대상이 될 때 (Sync 확인 Dialog의 경고 블록). */
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const m = useMessages();
  const tone = variant ?? "neutral";
  const compact = size === "sm";
  const Icon = ICON[tone];
  const mode = live ?? (tone === "danger" ? "alert" : "off");
  return (
    <div id={id} className={cn(alert({ variant, size }), inset && "rounded-none px-4 py-row-y", className)} role={mode === "off" ? undefined : mode} data-alert={tone}>
      <Icon className={cn("mt-0.5 shrink-0", compact ? "size-3.5" : "size-4", ICON_CLASS[tone])} aria-hidden />
      <div className={cn("flex min-w-0 flex-1 flex-col", compact ? "gap-1.5" : "gap-2")}>
        {/* 제목↔본문은 기본 4 · sm 2다(2026-09-30 사용자) — 열 gap(8 · 6)에서 −4를 당긴다. 본문↔액션은 열 gap 그대로다. */}
        {title !== undefined && <p className={cn("font-medium", children !== undefined && "-mb-1")}>{title}</p>}
        {children !== undefined && <div>{children}</div>}
        {actions !== undefined && <div className="flex gap-2">{actions}</div>}
      </div>
      {/*
        ⚠️ Dialog의 닫기와 **같은 `CloseButton`**이다(2026-10-01 — 옛 36 정방). ⚠️ **위아래가 모두 −8이다** — 위쪽만 당기면
        버튼(28)이 한 줄 행의 높이를 잡아 제목 아래가 7px 넓어진다 (2026-09-29 사용자).
      */}
      {onDismiss !== undefined && (
        /*
          ⚠️ **닫기 전에 이웃으로 포커스를 옮긴다** (audit #35) — 이 버튼이 Alert와 함께 언마운트되어 포커스가 `body`로
          빠졌다. 옮긴 뒤에 닫으므로 커밋 시점을 기다릴 필요가 없다(착지점은 이 Alert 밖이다).
        */
        <CloseButton label={m.common.dismiss} onClick={(event) => { neighbourFocus(event.currentTarget.closest("[data-alert]") ?? event.currentTarget)?.focus(); onDismiss(); }} className="-my-2 -mr-2" />
      )}
    </div>
  );
}
