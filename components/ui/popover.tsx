"use client";

import { cn } from "@/lib/utils";
import { Popover as Primitive } from "radix-ui";
import { useRef, type ReactNode, type RefObject } from "react";

import { useImeGuard } from "./use-ime-guard";

/** 외부 트리거를 기준으로 연다. 바깥 클릭은 사용자가 누른 곳의 포커스를 유지한다. */
export function Popover({ open, onOpenChange, anchor, id, children, className, "aria-label": label }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLElement | null>;
  id: string;
  "aria-label": string;
  children: ReactNode;
  className?: string;
}) {
  const escaped = useRef(false);
  const ime = useImeGuard();
  return <Primitive.Root open={open} onOpenChange={onOpenChange}>
    <Primitive.Anchor virtualRef={anchor} />
    <Primitive.Portal>
      <Primitive.Content id={id} aria-label={label} side="bottom" align="start" sideOffset={18} alignOffset={-4} collisionPadding={8}
        className={cn("border-border bg-popover shadow-md z-50 flex max-h-80 w-70 flex-col overflow-hidden rounded-lg border", className)}
        onOpenAutoFocus={event => {
          escaped.current = false;
          const content = event.currentTarget as HTMLElement;
          const target = content.querySelector<HTMLElement>('[aria-current="true"]') ?? content.querySelector<HTMLElement>("button");
          if (target) { event.preventDefault(); target.focus(); }
        }}
        onPointerDownOutside={event => {
          // 트리거 click 한 번만 토글한다. 여기서 먼저 닫으면 같은 click이 다시 연다.
          if (event.target instanceof Node && anchor.current?.contains(event.target)) event.preventDefault();
        }}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        // ⚠️ 조합 중 Esc는 `escaped`를 세우지 않고 돌아간다 — 세우면 다음 비-Esc 닫힘(바깥 클릭)이 앵커로 포커스를 잘못 돌린다.
        onEscapeKeyDown={event => {
          if (ime.blocks(event)) { event.preventDefault(); return; }
          escaped.current = true;
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (escaped.current) anchor.current?.focus();
        }}
      >{children}</Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
