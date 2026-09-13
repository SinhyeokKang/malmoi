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
      <Primitive.Overlay className="bg-foreground/40 fixed inset-0 z-50" />
      <Primitive.Content
        className={cn(
          /**
           * ⚠️ **360이다 — `max-w-lg`(512)가 아니었다** (2026-09-13 핸드오프). 확인 대화는 어느
           * 화면이든 같은 무게여야 하므로 프리미티브 기본값을 옮겼다 — 소비자 넷이 함께 움직인다
           * (archive-card · invite-dialog · member-list · login-methods).
           *
           * ⚠️ **`shadow-lg`는 Tailwind 기본 그림자라 DESIGN §4.5가 금지한 값이었다.** 캔버스 값이
           * `--shadow-medium`과 바이트로 같으므로 이건 이탈이 아니라 **기존 위반의 교정**이다.
           */
          "bg-background border-border fixed top-1/2 left-1/2 z-50 w-full max-w-90 -translate-x-1/2 -translate-y-1/2",
          "shadow-medium rounded-lg border",
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-2 p-4 pb-2">
          <Primitive.Title className="text-base font-medium">{title}</Primitive.Title>
          <DialogClose asChild>
            {/*
              ⚠️ **36 정방이다 — `size="sm"`(28 / radius 8)이 아니었다** (2026-09-13 핸드오프).
              `size="icon"`을 만들지 않는다(DESIGN §6.4가 size를 셋으로 묶었다) — `md`의 높이·radius를
              그대로 쓰고 정사각 유틸로 폭만 맞춘다. 음수 마진은 캔버스의 `-6px -8px 0 0`이다.
            */}
            <Button variant="ghost" aria-label="Close" className="-mt-1.5 -mr-2 size-9 rounded-md p-0">
              <X aria-hidden />
            </Button>
          </DialogClose>
        </header>
        {/* ⚠️ 설명문은 13(`text-xs`)이다 — 제목 15와 본문 14 사이에 한 단계를 둔다. */}
        {description !== undefined && (
          <Primitive.Description className="text-muted-foreground px-4 text-xs">
            {description}
          </Primitive.Description>
        )}
        {/*
          ⚠️ **본문이 없으면 그리지 않는다** (2026-09-13). 빈 `<div>`도 `p-4`를 들어 설명문과 푸터
          사이에 **32px의 죽은 공간**이 생겼다 — 확인 Dialog는 대부분 본문이 없어서 그 상태가
          기본이었다. 아래 `padding:16 16 0`은 푸터가 자기 16을 갖기 때문이다.
          ⚠️ `Boolean`으로 거른다 — 호출부가 `cond && <x/>`를 그대로 넘기므로 `false`도 부재다.
        */}
        {Boolean(children) && <div className="space-y-2 p-4 pb-0 text-sm">{children}</div>}
        {/* ⚠️ 푸터 위 간격이 16이다 — `pt-2`(8)로 붙어 있었다. */}
        {footer !== undefined && <footer className="flex justify-end gap-2 p-4">{footer}</footer>}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
