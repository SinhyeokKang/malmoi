"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

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
  title,
  actions,
  onDismiss,
  className,
  children,
}: VariantProps<typeof alert> & {
  /** 구두점 없는 문장 조각 (§10). */
  title?: ReactNode;
  /** 최대 둘 (§6.4). */
  actions?: ReactNode;
  /** 있으면 우상단에 닫기가 붙는다. */
  onDismiss?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const tone = variant ?? "info";
  const Icon = ICON[tone];
  return (
    <div className={cn(alert({ variant }), className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_CLASS[tone])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        {title !== undefined && <p className="text-sm font-medium">{title}</p>}
        {children !== undefined && <div className="text-sm">{children}</div>}
        {actions !== undefined && <div className="flex gap-2">{actions}</div>}
      </div>
      {onDismiss !== undefined && (
        <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss" className="-mt-1 -mr-1 shrink-0">
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
