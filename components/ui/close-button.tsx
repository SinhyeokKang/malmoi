import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";

/**
 * **닫기 X — 한 형이다** (DESIGN §6.4 · 2026-10-01 ux-drift-unify 5-Y9): ghost · 36 · **원형** · hover `foreground` 3% · X 20.
 * 440 Dialog · 1024 모달 · 이력 상세 · Alert · Sources 결과 행이 쓴다 — 전엔 36 정방 · 36 원 · raw Close · 28 원이 섞였다.
 *
 * ⚠️ **`size` prop을 늘리지 않았다** — `md`의 높이 위에 정사각·원형 유틸을 얹는다(DESIGN §6.4가 size를 셋으로 묶었다). 형은
 * 1024 모달의 것을 옮겼다(`components/ui/modal.tsx`에서 추출). `className`은 자리(음수 마진·절대 위치)만 덧댄다.
 * ⚠️ **라벨은 필수다** — 자리마다 이름이 다르다(Close · Dismiss · 모달의 호출부 라벨). 글리프만 있으면 접근 이름이 빈다.
 */
export function CloseButton({ label, className, ...props }: Omit<ButtonProps, "variant" | "size" | "children"> & { label: string }) {
  return (
    <Button variant="ghost" aria-label={label} className={cn("hover:bg-foreground/[0.03] size-9 shrink-0 rounded-full px-0", className)} {...props}>
      <X className="size-5" aria-hidden />
    </Button>
  );
}
