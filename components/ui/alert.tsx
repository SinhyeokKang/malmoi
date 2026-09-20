"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { Button } from "./button";

/**
 * Publish 결과 · 편집 손실 배너 · 페이지 수준 거부가 전부 이것이다.
 *
 * ⚠️ **variant는 뜻으로 고른다** (DESIGN §6.2). `success`에 초록을 쓰지 않는다 — raw 색을 늘리지 않고,
 * **성공은 조용한** 쪽이 이 화면의 규칙이다. 버린 값이 있는 결과는 `success`가 아니라 `warning`이다
 * (ARCHITECTURE §0 불변식 9).
 */
const alert = cva("flex gap-3 rounded-lg border p-4", {
  variants: {
    variant: {
      info: "border-border bg-muted/40",
      success: "border-border bg-background",
      warning: "border-amber-200 bg-amber-50 text-amber-900",
      danger: "border-destructive/40 text-destructive bg-background",
    },
  },
  defaultVariants: { variant: "info" },
});

const ICON: Record<NonNullable<VariantProps<typeof alert>["variant"]>, ComponentType<{ className?: string }>> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
};

/** 아이콘 색만 variant를 따로 든다 — 나머지 아이콘은 상속이다 (§6.8). */
const ICON_CLASS: Record<NonNullable<VariantProps<typeof alert>["variant"]>, string> = {
  info: "text-muted-foreground",
  success: "text-foreground",
  warning: "",
  danger: "",
};

export function Alert({
  variant = "info",
  inset = false,
  title,
  actions,
  onDismiss,
  role,
  className,
  children,
}: VariantProps<typeof alert> & {
  inset?: boolean;
  /** 구두점 없는 문장 조각 (§10). */
  title?: ReactNode;
  /** 최대 둘 (§6.4). */
  actions?: ReactNode;
  /** 있으면 우상단에 닫기가 붙는다. */
  onDismiss?: () => void;
  /**
   * ⚠️ **`danger`는 이미 `role="alert"`다** — 이 prop은 **그 외 variant를 live 영역으로 올리는**
   * 자리다. 비동기 진행을 말하는 info Alert가 그 부류다(온보딩 ④의 "Importing…"): 조용히 바뀌면
   * 스크린리더 사용자에게는 아무 일도 안 일어난 화면이다. `danger`의 `alert`를 덮지는 않는다.
   *
   * ⚠️ **보장은 "내용이 바뀌면 알린다"까지다** (2026-09-16 판정). 이 Alert는 **자기 자신이 내용과
   * 함께 트리에 들어왔다가 통째로 사라지는** 자리에도 서는데, live 영역은 **삽입 시점에 등록**되므로
   * 그렇게 들어온 첫 내용은 스크린리더·브라우저 조합에 따라 안 읽힐 수 있다. 제거는 `aria-relevant`
   * 기본값이 announce하지 않으므로 **언제나** 안 읽힌다.
   *
   * ⚠️ **빈 래퍼를 상시로 세우는 표준 해법을 쓰지 않는다** — 그러려면 이 Alert에서 `role`을 빼야 하고,
   * 그 순간 **`danger`가 assertive를 잃는다**(캔버스 `4f`가 고른 것은 색인데 이 프리미티브가 그것을
   * "읽던 것을 끊는다"로 번역하고, DESIGN §6.64가 그 대가를 알고 받는다고 적었다). 래퍼를 덧씌우면
   * live 영역이 중첩돼 같은 문장이 두 번 읽힐 수 있고, **스크린리더 실측 수단이 없어** 고친 쪽이
   * 나아졌는지 확인할 방법도 없다. 약속하지 않는 것을 주석이 약속하지 않게 두는 쪽을 골랐다.
   */
  role?: "status";
  className?: string;
  children?: ReactNode;
}) {
  const tone = variant ?? "info";
  const Icon = ICON[tone];
  return (
    <div className={cn(alert({ variant }), inset && "rounded-none border-0 border-t border-divider px-4 py-[13px]", inset && tone === "danger" && "bg-destructive/4", className)} role={tone === "danger" ? "alert" : role}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_CLASS[tone])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        {title !== undefined && <p className="text-sm font-medium">{title}</p>}
        {children !== undefined && <div className="text-sm">{children}</div>}
        {actions !== undefined && <div className="flex gap-2">{actions}</div>}
      </div>
      {/* ⚠️ Dialog의 닫기와 **같은 36 정방**이다 (2026-09-13 핸드오프). 음수 마진만 `-8 -8`로 다르다. */}
      {onDismiss !== undefined && (
        <Button variant="ghost" onClick={onDismiss} aria-label={m.common.dismiss} className="-mt-2 -mr-2 size-9 shrink-0 rounded-md p-0">
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
