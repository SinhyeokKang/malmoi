/**
 * 저장 실패 뒤 커서를 그 셀로 되돌릴지 (DESIGN §6.1).
 *
 * ⚠️ **blur 저장은 비동기다.** 실패 응답이 올 때 사용자는 이미 **다음 셀에 타이핑 중**일 수 있고,
 * 그 순간 `focus()`를 부르면 입력이 엉뚱한 셀로 들어간다 (WCAG 3.2 예측 가능성). 처음 초안은
 * 무조건 되돌리는 것이었다. 되돌리지 않는 경우의 재시도 지점은 상태줄의 [Retry]다.
 *
 * ⚠️ **`components/translation-input.tsx` 안이 아니라 별도 모듈이다.** 그 파일은 Server Action을
 * import하고 그 그래프에 `server-only`가 있어 vitest가 import만으로 죽는다 — 판정을 테스트하려면
 * 이 함수가 잎이어야 한다.
 *
 * ⚠️ **`document.body`와 비교하지 않고 `tagName`을 본다.** 같은 이유로 이 모듈은 DOM을 모른다 —
 * 판정에 필요한 신호는 "포커스가 아무 컨트롤에도 없다"이고 그것이 `BODY`다. `null`도 같은 상태다.
 */
export function shouldRefocus(active: Element | null, own: Element | null): boolean {
  // 언마운트된 셀에 focus()를 부르지 않는다.
  if (own === null) return false;
  if (active === null || active === own) return true;
  return active.tagName === "BODY";
}
