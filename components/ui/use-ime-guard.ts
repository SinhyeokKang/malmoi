import { useRef } from "react";

import { isImeComposing } from "@/lib/keyboard";

/**
 * IME 조합 **상태 추적**의 유일한 자리다 (search-ux-unify C9·D11) — 판정식은 `lib/keyboard.ts`의 `isImeComposing`이다.
 * `Command` 루트와 오버레이 Content 다섯이 쓴다. 반환한 `onCompositionStart`·`onCompositionEnd`를 그 Content에 단다.
 *
 * ⚠️ **플래그만으로는 모자란다** — 조합을 시작한 직후의 Esc·Enter가 `isComposing` 없이 오는 브라우저가 있어 compositionstart/end를
 * 직접 센다(`global-search.test.tsx`의 "actual IME composition" 계약). 조합 상태는 Content 수명이라 닫히면 함께 사라진다.
 */
export function useImeGuard() {
  const composing = useRef(false);
  return {
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: () => { composing.current = false; },
    blocks: (event: Pick<KeyboardEvent, "isComposing" | "keyCode">) => isImeComposing(event) || composing.current,
  };
}
