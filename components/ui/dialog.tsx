"use client";

import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { Button } from "./button";

/**
 * 초대 폼·확인 모달 (DESIGN §6.4).
 *
 * ⚠️ **닫히는 길이 넷이다** — Esc·배경·X·Cancel. 앞의 둘은 Radix가, 뒤의 둘은 호출부가 든다.
 * 제목은 **대상을 명시한 질문**이고 액션 라벨은 결과다 (§10) — "Remove Jane Doe from bugshot-2?" / "Remove member".
 */
export const Dialog = Primitive.Root;

/**
 * ⚠️ **닫히면 연 자리로 돌아간다** (audit #34). Radix의 기본 복귀 대상은 `DialogTrigger`뿐이라 **상태로 여는** Dialog
 * (미저장 확인 · Revert · 역할 변경 · 배너의 [Try again])는 닫히면 포커스가 `body`로 빠졌다 — 중첩이면 부모 모달 밖이다.
 *
 * ⚠️ **"열 때의 `activeElement`"로는 못 잡는다** — 두 갈래가 그것을 이미 지운다: 안쪽 버튼의 `autoFocus`는 React 커밋에서
 * FocusScope의 mount 이벤트보다 **먼저** 돌아 `onOpenAutoFocus`가 아예 안 오고, Select 옵션에서 여는 Dialog는 그 순간
 * 포커스가 사라질 옵션 위다(Select의 트리거 복귀는 `setTimeout` 뒤다). 그래서 **최근 포커스 기록**을 들고, 닫힐 때
 * 아직 붙어 있는 가장 최근 것으로 간다 — Dialog 안의 요소는 그때 떨어져 있어 저절로 빠진다.
 * ⚠️ **그것이 꺼져 있으면 더 거슬러 가지 않는다** — 앞의 무관한 컨트롤에 포커스가 서면 "빠졌을 때만" 옮기는 호출부의
 * 착지(`useLandAfter`)가 그것을 살아 있는 포커스로 읽어 비켜선다 (B5 리뷰).
 *
 * ⚠️ **호출부의 `onCloseAutoFocus`가 먼저다** — 그것이 `preventDefault`했으면 손대지 않는다. 후보가 없으면 Radix 기본
 * (트리거)으로 넘기고, 그래도 빠지면 호출부의 착지(`useLandAfter`)가 받는다.
 *
 * ⚠️ **`pointerdown`도 기록한다** (B5 리뷰 r1 🔴). Safari·macOS Firefox는 마우스 클릭으로 버튼에 포커스를 주지 않아 누른 버튼에
 * `focusin`이 안 오고, 기록의 마지막이 **더 오래된 요소**였다 — 닫힐 때 포커스와 스크롤이 그리로 튀었다(Settings: 이름 저장 →
 * 스크롤 → Rotate token → Cancel → 이름 칸으로 점프). 누른 것을 기록하면 트리거로 연 Dialog는 트리거로, 트리거 밖에서 연 같은
 * Dialog(Home 배너의 [Try again] → Sync 확인)는 **누른 그 버튼**으로 돌아온다 — 후자가 의도다(malmoi#86): 배너를 읽다 눌렀는데
 * 머리의 [Sync]로 튀면 그 문장을 다시 찾아 내려와야 한다.
 * ⚠️ **"트리거가 붙어 있으면 비켜선다"를 r1에 넣었다가 걷었다** — Radix는 닫힌 트리거에서 `aria-controls`를 **지워서**
 * (`context.open ? contentId : undefined`) 닫힐 때의 그 판정은 한 번도 참이 아니었다. 동작을 만든 것은 위의 기록이다.
 */
const recent: HTMLElement[] = [];
function remember(node: HTMLElement | null) {
  if (node === null || node === document.body) return;
  const at = recent.indexOf(node);
  if (at >= 0) recent.splice(at, 1);
  recent.push(node);
  if (recent.length > 8) recent.shift();
}
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (event) => { if (event.target instanceof HTMLElement) remember(event.target); });
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Element) remember(event.target.closest<HTMLElement>('button, a[href], [role="option"], [tabindex]'));
  }, true);
}
function returnTarget(): HTMLElement | null {
  for (let i = recent.length - 1; i >= 0; i--) {
    const node = recent[i];
    if (node === undefined || !node.isConnected) continue;
    return node.matches(":disabled") ? null : node;
  }
  return null;
}
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  title,
  description,
  footer,
  className,
  children,
  onCloseAutoFocus,
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
           * ⚠️ **440이다** (2026-09-18 사용자 — 핸드오프 360에서 올렸다. 그 전엔 `max-w-lg` 512였다). 확인 대화는 어느
           * 화면이든 같은 무게여야 하므로 프리미티브 기본값을 옮겼다 — 소비자 넷이 함께 움직인다
           * (archive-card · invite-dialog · member-list · login-methods).
           *
           * ⚠️ **`shadow-lg`는 Tailwind 기본 그림자라 DESIGN §4.5가 금지한 값이었다.** 캔버스 값이
           * `--shadow-medium`과 바이트로 같으므로 이건 이탈이 아니라 **기존 위반의 교정**이다.
           */
          "bg-background border-border fixed top-1/2 left-1/2 z-50 w-full max-w-110 -translate-x-1/2 -translate-y-1/2",
          "shadow-medium rounded-lg border",
          className,
        )}
        {...props}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const target = returnTarget();
          if (target === null) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <header className="flex items-start justify-between gap-2 p-4 pb-2">
          <Primitive.Title className="text-base font-medium">{title}</Primitive.Title>
          <DialogClose asChild>
            {/*
              ⚠️ **36 정방이다 — `size="sm"`(28 / radius 8)이 아니었다** (2026-09-13 핸드오프).
              `size="icon"`을 만들지 않는다(DESIGN §6.4가 size를 셋으로 묶었다) — `md`의 높이·radius를
              그대로 쓰고 정사각 유틸로 폭만 맞춘다. 음수 마진은 캔버스의 `-6px -8px 0 0`이다.
            */}
            <Button variant="ghost" aria-label={m.common.close} className="-mt-1.5 -mr-2 size-9 rounded-md p-0">
              <X aria-hidden />
            </Button>
          </DialogClose>
        </header>
        {/*
          ⚠️ 설명문은 13(`text-xs`)이다 — 제목 15와 한 단계 차이를 둔다.
          ⚠️ **행간 1.6이 임의값이다** — 타입 스케일에 1.6이 없다(`leading-normal` 1.5 ·
          `leading-relaxed` 1.625). DESIGN §4.2가 "스케일에 대응값이 없을 때만" 임의값을 허용하고
          여기가 그 경우다. 기본값(`text-xs`의 1.333 = 17.33px)이면 두 줄짜리 질문이 붙어 읽힌다.
        */}
        {description !== undefined && (
          <Primitive.Description className="text-muted-foreground px-4 text-xs leading-[1.6]">
            {description}
          </Primitive.Description>
        )}
        {/*
          ⚠️ **본문이 없으면 그리지 않는다** (2026-09-13). 빈 `<div>`도 `p-4`를 들어 설명문과 푸터
          사이에 **32px의 죽은 공간**이 생겼다 — 확인 Dialog는 대부분 본문이 없어서 그 상태가
          기본이었다. 아래 `padding:16 16 0`은 푸터가 자기 16을 갖기 때문이다.
          ⚠️ `Boolean`으로 거른다 — 호출부가 `cond && <x/>`를 그대로 넘기므로 `false`도 부재다.
        */}
        {/*
          ⚠️ **본문의 형이 푸터 유무를 따라간다.** 캔버스가 재는 것은 확인 Dialog의 **검은 줄**
          (`16 16 0` · 13/1.6)이고, 그 값은 **푸터가 자기 16을 갖는다**는 전제 위에 선다. 푸터 없는
          소비자(초대 폼)는 본문이 곧 폼이라 둘 다 틀린다 — 실측에서 본문이 바닥에 붙었고(1px),
          `FormGroup`의 help와 초대 링크까지 13으로 내려갔다. 이 루프가 만든 회귀이고 화면에도
          테스트에도 안 나타나는 부류다.
        */}
        {Boolean(children) && (
          <div className={cn("space-y-2 p-4", footer !== undefined ? "pb-0 text-xs leading-[1.6]" : "text-sm")}>
            {children}
          </div>
        )}
        {/* ⚠️ 푸터 위 간격이 16이다 — `pt-2`(8)로 붙어 있었다. */}
        {footer !== undefined && <footer className="flex justify-end gap-2 p-4">{footer}</footer>}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
