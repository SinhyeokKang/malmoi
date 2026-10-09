"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/utils";

import { glyphSlot } from "./button";

/**
 * **누르는 글자** — 공개 푸터의 스위처 트리거(ui-locales design §5.1, 2026-10-04 사용자). 소비자는 `LocaleSwitcher`·`ThemeSwitcher` 둘이다.
 *
 * ⚠️ **`Button`이 아니다** — `Button`은 라벨 500을 강제해(`label-weight.test.ts`) 이웃 푸터 링크(13/400 muted)와 무게가 갈린다. 날 `<button>`은
 * `ui/` 밖에서 막히므로(`focus-ring.test.ts`) 프리미티브로 둔다. hover·focus는 푸터 `LINK`(`components/public-shell/footer.tsx`)와 같은 값이다.
 *
 * ⚠️ **`busy`는 진짜 `disabled`가 아니다** — 꺼지면 Radix가 메뉴를 닫으며 트리거로 돌려준 포커스가 `body`로 빠진다(POSTMORTEM 2026-09-24).
 * `aria-disabled` + `aria-busy`로 알리고 클릭·포인터·키(Tab 말고)를 막는다. 넘겨받은 핸들러를 **부르지 않는다** — `DropdownMenuTrigger asChild`의
 * 열기는 Slot이 이 핸들러들에 합쳐 넘기므로, 안 부르는 것이 곧 "열리지 않는다"다. 앞 글리프(`aria-hidden`을 든 첫 자식)는 스피너로
 * **교체**한다 — `Button`과 같은 `glyphSlot` 판정이다(DESIGN §6.4). 글리프는 슬롯 prop이 아니라 자식이다(`api-contract.test.ts`).
 * ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** — 상수로 모으면 `focus-ring.test.ts`가 이 파일을 못 본다.
 */
export function TextTrigger({
  busy = false,
  className,
  children,
  onClick,
  onPointerDown,
  onKeyDown,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  busy?: boolean;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1 text-xs",
        "hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        busy && "cursor-not-allowed",
        className,
      )}
      {...props}
      aria-disabled={busy ? true : props["aria-disabled"]}
      aria-busy={busy ? true : props["aria-busy"]}
      onClick={busy ? (event) => event.preventDefault() : onClick}
      onPointerDown={busy ? (event) => event.preventDefault() : onPointerDown}
      onKeyDown={busy ? (event) => { if (event.key !== "Tab") event.preventDefault(); } : onKeyDown}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {glyphSlot(children, busy)}
    </button>
  );
}
