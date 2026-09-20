"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as Primitive } from "radix-ui";
import type { ReactNode } from "react";

import { m } from "@/lib/i18n";

/**
 * 이벤트 상세의 **껍데기 640** (캔버스 `1d`–`1f`).
 *
 * ⚠️ **`dialog.tsx`(440)도 `modal.tsx`(1024)도 쓰지 않는다.** 440은 **묻고 끝나는** 표면이라
 * Before/After 두 블록과 소스별 결과 목록이 들어가면 줄바꿈이 무너지고, 1024는 **라우트를 대신하는**
 * 온보딩 껍데기라 Back/Next 푸터를 든다 — 토큰 재발급 상세에 쓰면 빈 상자가 된다. 640은 본문 한 줄이
 * 약 70자에서 끊기는 폭이고, 껍데기 값은 1024에서 비율만 줄여 물려받았다.
 *
 * ⚠️ **본문은 서버가 그린다** (결정 2) — 이 파일은 열림·닫힘·포커스만 든다. 그래서 상세 조회가
 * 클라이언트 fetch로 갈라지지 않고, 목록과 **같은 페이지 오류 경계**를 쓴다.
 *
 * ⚠️ **닫으면 `event`만 뺀다** — 목록의 필터·검색·커서는 그대로다(결정 15). 스크롤은 라우터가
 * 같은 페이지 안의 이동으로 보존한다.
 *
 * ⚠️ **닫은 뒤 포커스가 눌렀던 행으로 돌아간다.** Radix의 기본 복귀 대상은 트리거인데 여기엔
 * 트리거가 없다(링크 내비게이션으로 열렸다) — 행이 남아 있으면 그 행, 없으면 화면 제목이다.
 */
export function EventDialog({
  closeHref,
  returnFocusId,
  children,
}: {
  closeHref: string;
  /** 눌렀던 행의 DOM id. 다른 페이지·필터 밖 이벤트를 직접 열었으면 그 행이 없다. */
  returnFocusId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Primitive.Root
      open
      onOpenChange={(next) => {
        if (!next) router.push(closeHref, { scroll: false });
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-foreground/35" />
        <Primitive.Content
          className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-96px)] w-[640px] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl shadow-[0_6px_16px_2px_rgba(22,24,27,0.15)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const row = document.getElementById(returnFocusId);
            (row ?? document.querySelector("h1"))?.focus?.();
          }}
        >
          {children}
          <Primitive.Close
            aria-label={m.logs.detail.actions.close}
            className="text-muted-foreground hover:bg-accent focus-visible:ring-ring absolute top-6 right-6 inline-flex size-9 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden />
          </Primitive.Close>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
