"use client";

import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

/**
 * 초대 폼·확인 모달 (DESIGN §6.4).
 *
 * ⚠️ **닫히는 길이 넷이다** — Esc·배경·X·Cancel. 앞의 둘은 Radix가, 뒤의 둘은 호출부가 든다.
 * 제목은 **대상을 명시한 질문**이고 액션 라벨은 결과다 (§10) — "Remove Jane Doe from bugshot-2?" / "Remove member".
 */
export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  title,
  description,
  footer,
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content> & {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="bg-foreground/40 fixed inset-0" />
      <Primitive.Content
        className={cn(
          "bg-background border-border fixed top-1/2 left-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-lg border shadow-lg",
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-2 p-4 pb-2">
          <Primitive.Title className="text-base font-medium">{title}</Primitive.Title>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" aria-label="Close" className="-mt-1 -mr-1">
              <X aria-hidden />
            </Button>
          </DialogClose>
        </header>
        {description !== undefined && (
          <Primitive.Description className="text-muted-foreground px-4 text-sm">
            {description}
          </Primitive.Description>
        )}
        <div className="space-y-2 p-4 text-sm">{children}</div>
        {footer !== undefined && <footer className="flex justify-end gap-2 p-4 pt-2">{footer}</footer>}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
