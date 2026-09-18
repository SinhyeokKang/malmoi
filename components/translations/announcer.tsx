"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * 표 하나의 **live region 하나** (DESIGN §7).
 *
 * ⚠️ **셀마다 두지 않는다.** 903행 × 3로케일이면 `aria-live` 영역이 2,700개이고, 스크린리더가
 * 그만큼의 영역을 감시한다 — 처음 초안이 그랬고 CDO 검수가 잡았다. 셀 안 상태줄은 **시각 전용**이고
 * 결과만 이 영역이 읽는다("Saving…"은 알리지 않는다).
 *
 * ⚠️ **기본값이 no-op이다.** provider 없이 셀이 렌더되면 알림이 조용히 사라지는 대가로, 셀 하나가
 * 표 전체를 죽이지 않는다 (Radix가 provider 없이 **던져서** 접힌 사이드바가 셸을 죽인 전례 —
 * POSTMORTEM 2026-09-08). 배선은 `components/__tests__/translations-screen.test.ts`가 센다.
 */
const AnnounceContext = createContext<(text: string) => void>(() => {});

export function useAnnounce(): (text: string) => void {
  return useContext(AnnounceContext);
}

export function Announcer({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");

  const announce = useCallback((next: string) => {
    // ⚠️ 스크린리더는 **텍스트 변화**를 읽는다 — 같은 셀에서 같은 실패가 반복되면 값이 그대로여서
    // 두 번째가 무음이 된다. 공백 하나를 붙여 값을 바꾼다(보이지 않는 영역이라 표시엔 영향이 없다).
    setText((prev) => (prev === next ? `${next} ` : next));
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      <div aria-live="polite" className="sr-only">
        {text}
      </div>
      {children}
    </AnnounceContext.Provider>
  );
}
