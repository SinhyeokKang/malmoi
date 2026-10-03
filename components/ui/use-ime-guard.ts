import { useRef, type CompositionEvent } from "react";

import { isImeComposing } from "@/lib/keyboard";

/**
 * IME 조합 **상태 추적**의 유일한 자리다 (search-ux-unify C9·D11) — 판정식은 `lib/keyboard.ts`의 `isImeComposing`이다.
 * `Command` 루트와 오버레이 Content 다섯이 쓴다. 반환한 `onCompositionStart`·`onCompositionEnd`를 그 Content에 단다.
 *
 * ⚠️ **플래그만으로는 모자란다** — 조합을 시작한 직후의 Esc·Enter가 `isComposing` 없이 오는 브라우저가 있어 compositionstart/end를
 * 직접 센다(`global-search.test.tsx`의 "actual IME composition" 계약).
 * ⚠️ **조합 상태는 Content 수명이 아니다** (R-B2 🟡1) — 훅을 부르는 래퍼는 닫혀도 마운트된 채다. 조합 중에 닫히면(바깥 pointerdown·
 * 프로그램 닫힘) 입력이 문서에서 떨어져 compositionend가 핸들러에 닿지 않고, 다시 연 오버레이의 Esc가 전부 막혔다. 그래서 불리언이
 * 아니라 **조합을 시작한 노드**를 들고, 그 노드가 떨어졌으면 조합이 끝난 것으로 본다.
 */
export function useImeGuard() {
  const composing = useRef<Node | null>(null);
  return {
    onCompositionStart: (event: CompositionEvent) => { composing.current = event.target as Node; },
    onCompositionEnd: () => { composing.current = null; },
    blocks: (event: Pick<KeyboardEvent, "isComposing" | "keyCode">) => isImeComposing(event) || composing.current?.isConnected === true,
  };
}
