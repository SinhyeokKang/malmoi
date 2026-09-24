"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as Primitive } from "radix-ui";
import { useState, type ReactNode } from "react";

import { m } from "@/lib/i18n";

/**
 * 이벤트 상세의 **껍데기 1024** (캔버스 `1d`–`1f`).
 *
 * ⚠️ **폭이 핸드오프를 뒤집은 값이다** (2026-09-22 사용자 — `/design-sync`). 시안 `1d`의 640
 * 판정과 그것을 뒤집은 근거는 **DESIGN §6.68이 정본**이다. `modal.tsx`와 **폭·radius·dim(`/32` + blur 6)이
 * 같다** (2026-09-24 사용자) — Sources 상세와 나란히 서는 표면이라 셋이 갈리면 차이가 먼저 보였다.
 * ⚠️ **껍데기 컴포넌트는 따로다** — `OnboardingModal`은 높이 하한 `80svh`와 [Back]/[Next] 바닥을
 * 들어, 참조 한 줄뿐인 상세가 빈 판이 되고 글리프·시각을 둘 머리 자리가 없다.
 *
 * ⚠️ **본문은 서버가 그린다** (결정 2) — 이 파일은 열림·닫힘·포커스만 든다. 그래서 상세 조회가
 * 클라이언트 fetch로 갈라지지 않고, 목록과 **같은 페이지 오류 경계**를 쓴다.
 *
 * ⚠️ **닫으면 `event`만 뺀다** — 목록의 필터·검색·커서는 그대로다(결정 15). 스크롤은 라우터가
 * 같은 페이지 안의 이동으로 보존한다.
 *
 * ⚠️ **닫기는 로컬이 먼저고 URL이 뒤따른다** (audit-ux #9). 전엔 `open`이 늘 true인 제어형이라 Esc·×가
 * `router.push`의 전체 재조회(Home이면 GitHub probe까지)를 기다렸다. 닫을 결과를 서버에 물을 것이 없으니
 * 먼저 닫고, 주소는 **`replace`**로 맞춘다 — `push`면 뒤로가기가 방금 닫은 상세를 다시 열었다.
 * 닫힌 표시는 **대상 id에 묶는다**: 서버가 옛 상세를 아직 그리는 사이 다른 행을 누르면 같은 인스턴스가
 * 새 대상으로 다시 렌더되는데, 불리언이면 그 상세가 닫힌 채로 떴다.
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
  const [closedFor, setClosedFor] = useState<string | null>(null);
  return (
    <Primitive.Root
      open={closedFor !== returnFocusId}
      onOpenChange={(next) => {
        if (next) return;
        setClosedFor(returnFocusId);
        router.replace(closeHref, { scroll: false });
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="bg-foreground/32 fixed inset-0 z-50 backdrop-blur-[6px]" />
        <Primitive.Content
          /* ⚠️ **`w-[calc(100%-96px)]`이 dim 여백 48을 든다** — 옛 `max-w-[calc(100vw-48px)]`는 좌우로
             24씩만 비워 시안의 절반이었다(높이는 그때도 96을 뺐다). */
          className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-96px)] w-[calc(100%-96px)] max-w-[1024px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl shadow-medium"
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
