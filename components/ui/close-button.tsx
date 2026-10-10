import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";

/**
 * **닫기 X — 한 형이다** (DESIGN §6.4 · 2026-10-01 ux-drift-unify 5-Y9): ghost · 36 · **원형** · hover `foreground` 3% · X 20.
 * 440 Dialog · 1024 모달 · 이력 상세 · Alert · Sources 결과 행이 쓴다 — 전엔 36 정방 · 36 원 · raw Close · 28 원이 섞였다.
 *
 * ⚠️ **36 정방형 크기는 `icon-lg`가 든다** — 원형·hover는 이 닫기 전용 형이 든다. `className`은 자리(음수 마진·절대 위치)만 덧댄다.
 * 예외는 둘 — `LargeModal` 시트 머리(`lg` 미만)의 `max-lg:size-8`과 측면 서랍(`DrawerContent`) 머리의 `size-8`(둘 다 32, responsive-public)만 크기를 덮는다.
 * ⚠️ **라벨은 필수다** — 자리마다 이름이 다르다(Close · Dismiss · 모달의 호출부 라벨). 글리프만 있으면 접근 이름이 빈다.
 */
export function CloseButton({ label, className, ...props }: Omit<ButtonProps, "variant" | "size" | "children"> & { label: string }) {
  return (
    <Button size="icon-lg" variant="ghost" aria-label={label} className={cn("hover:bg-foreground/[0.03] shrink-0 rounded-full", className)} {...props}>
      <X className="size-5" aria-hidden />
    </Button>
  );
}
