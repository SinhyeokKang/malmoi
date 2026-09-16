import type { ReactNode } from "react";

import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 프로필·수단·GitHub 상태가 서버에서 오는 동안의 골격 (핸드오프 `2f`).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — 이 라우트는 패널을 `account/layout.tsx`가 든다
 * (`/projects`만 페이지가 들고, 그쪽 `loading.tsx`가 패널을 드는 이유가 그것이다). 여기서 또 들면
 * 로딩 동안 흰 패널이 두 겹이 된다.
 *
 * ⚠️ **Sessions를 그리지 않는다 — 핸드오프 `2f`가 그렇게 그렸다.** 근거는 "그 구역이 기다리지
 * 않아서"가 **아니다**(2026-09-14 리뷰 🟢7에서 고쳤다): `loading.tsx`는 페이지 세그먼트 전체의
 * fallback이라 Sessions도 그동안 렌더되지 않는다. 대가는 그 리스트 한 벌만큼의 높이 변화이고,
 * 그것을 받아들이는 이유는 **골격이 길수록 화면이 "다 왔다"고 거짓말한다**는 쪽이다 — 아래 치수
 * 규칙이 막는 것은 필드·아바타처럼 **자리가 남는** 요소의 튐이다.
 *
 * ⚠️ **치수가 실물이다** — 필드 320×36 · 아바타 56 · 글리프 **28**. 다르면 데이터가 도착하는 순간
 * 레이아웃이 튀고, 그 튐이 로딩 표시보다 더 눈에 띈다.
 *
 * ⚠️ **radius가 자리를 따라간다** — 글자 4 · 버튼·필드 10 · 글리프 **4** · 아바타 999. 전부
 * `rounded`로 두면 필드 자리에 글자 모양 블록이 선다.
 *
 * ⚠️ **카드 껍데기·헤더 padding·디바이더 둘은 골격에서도 실물이다** — 골격이 그 값을 안 들면
 * 데이터가 도착할 때 본문이 튄다 (POSTMORTEM 2026-09-15 #3의 유령 띠와 같은 축).
 *
 * ⚠️ **`aria-hidden`은 `Skeleton`이 든다** — 호출부가 컨테이너마다 붙이면 하나가 빠지고, 그 순간
 * 스크린리더가 회색 블록을 읽는다 (`projects/loading.tsx`에서 실제로 둘로 갈렸다).
 */
export default function AccountLoading() {
  return (
    <>
      <PanelHeader>
        {/* 제목 줄은 실물과 같은 min-h-9다 — 머리 높이가 안 튄다. */}
        <div className="flex min-h-9 items-center">
          <Skeleton className="h-7 w-32" />
        </div>
      </PanelHeader>

      <PanelBody className="space-y-4">
        {/* Profile 카드 — 아바타 + 버튼 둘 + 캡션, 그리고 라벨/필드 두 행. */}
        <SkeletonCard>
          <div className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-4 px-4 py-3.5">
            <div className="col-span-2 flex items-center gap-4">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-32 rounded-md" />
                  <Skeleton className="h-9 w-20 rounded-md" />
                </div>
                <Skeleton className="h-4 w-64" />
              </div>
            </div>

            <Skeleton className="h-4 w-12" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-80 rounded-md" />
              <Skeleton className="h-9 w-16 rounded-md" />
            </div>

            <Skeleton className="h-4 w-12" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-80 rounded-md" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </SkeletonCard>

        {/* 수단(행 둘) · GitHub App(행 하나). Sessions는 위 주석대로 없다. */}
        {[2, 1].map((rows, card) => (
          <SkeletonCard key={card}>
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className={`flex items-center gap-3 px-4 py-[13px] ${row === 0 ? "" : "border-border border-t"}`}>
                <Skeleton className="size-7 rounded" />
                <div className="flex flex-1 flex-col gap-px">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            ))}
          </SkeletonCard>
        ))}
      </PanelBody>
    </>
  );
}

/**
 * 카드 껍데기 — **테두리·radius·헤더 padding·디바이더가 실물과 같은 값이다.** 헤더 안의 글자만
 * 골격이고, 그래서 데이터가 도착해도 카드 경계가 움직이지 않는다.
 */
function SkeletonCard({ children }: { children: ReactNode }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-divider flex items-center gap-2 border-b p-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="ml-auto h-4 w-48" />
      </div>
      {children}
    </div>
  );
}
