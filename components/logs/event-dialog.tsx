"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as Primitive } from "radix-ui";
import type { ReactNode } from "react";

import { m } from "@/lib/i18n";

/**
 * 이벤트 상세의 **껍데기 1024** (캔버스 `1d`–`1f`).
 *
 * ⚠️ **폭이 핸드오프를 뒤집은 값이다** (2026-09-22 사용자 — `/design-sync`). 시안 `1d`의 640
 * 판정과 그것을 뒤집은 근거는 **DESIGN §6.68이 정본**이다. 여기서 알아야 할 것 하나: `modal.tsx`에서
 * 가져오는 것은 **폭뿐이고** radius·그림자·dim은 시안 값이다 — 온보딩 껍데기까지 따라가면 목록 위에
 * 뜬 이 표면이 라우트를 대신하는 판으로 읽힌다.
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
          /* ⚠️ **`w-[calc(100%-96px)]`이 dim 여백 48을 든다** — 옛 `max-w-[calc(100vw-48px)]`는 좌우로
             24씩만 비워 시안의 절반이었다(높이는 그때도 96을 뺐다). */
          className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-96px)] w-[calc(100%-96px)] max-w-[1024px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl shadow-medium"
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
