/**
 * 키보드·클릭 판정의 정본 — import 0인 잎이다(`components/__tests__/client-graph.test.ts`).
 * ⚠️ `m`을 import하지 않는다: 라벨은 식별자(`mac`·`other`)만 내고 컴포넌트가 `m.common.keys`로 푼다.
 * React 합성 이벤트 호출부는 `event.nativeEvent`를 넘긴다.
 */

type Composing = Pick<KeyboardEvent, "isComposing" | "keyCode">;
type Shortcut = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing" | "keyCode">;
type Click = Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

/** Safari는 조합 확정 keydown에 `isComposing`을 안 싣고 `keyCode` 229만 준다 — 둘 다 본다. */
export function isImeComposing(event: Composing): boolean {
  return event.isComposing || event.keyCode === 229;
}

/** 새 탭·새 창·다운로드를 뜻하는 수식키나 주 버튼이 아닌 클릭은 브라우저 기본 동작에 맡긴다. */
export function isPlainPrimaryClick(event: Click): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

const isMac = (platform: string) => /mac/i.test(platform);

/**
 * 검색 단축키의 매처·칩 라벨·`aria-keyshortcuts`를 한 판정에서 낸다.
 * 플랫폼을 모르는 서버 렌더(`null`)는 칩·aria가 없다 — 클라이언트가 다른 값을 그리면 hydration이 어긋난다.
 * ⚠️ 수식키는 플랫폼 엄격이다: Mac 입력창의 Ctrl+K는 줄 끝 삭제라 가로채지 않는다(search-ux-unify D5).
 */
export function searchShortcut(platform: string | null): { matches: (event: Shortcut) => boolean; label: "mac" | "other" | null; aria: string | null } {
  const mac = platform !== null && isMac(platform);
  return {
    matches: (event) => {
      if (isImeComposing(event) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return false;
      return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    },
    label: platform === null ? null : mac ? "mac" : "other",
    aria: platform === null ? null : mac ? "Meta+K" : "Control+K",
  };
}
