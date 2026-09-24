"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";

/**
 * 이벤트 행 끝의 chevron — **누른 행이 상세가 뜰 때까지 스피너로 바뀐다** (audit-ux #9).
 *
 * ⚠️ **`?event=`만 바뀌는 이동이라 `loading.tsx`가 안 선다** — 전엔 상세가 서버에서 올 때까지 행을
 * 누른 흔적이 화면 어디에도 없었다. 그래서 pending은 `useLinkStatus`가 재고, 가장 가까운 `Link`(행)의
 * 것이다.
 *
 * ⚠️ **더하지 않고 교체한다** (DESIGN §6 `Button loading`) — 같은 16 정방이라 결과 열의 세로선이 안 흔들린다.
 * ⚠️ **행이 서버 컴포넌트라 이것만 떼어 냈다** — 훅 하나 때문에 행 전체를 클라이언트로 올리지 않는다.
 */
export function RowChevron() {
  const { pending } = useLinkStatus();
  return pending
    ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
    : <ChevronRight className="size-4 shrink-0" aria-hidden />;
}
