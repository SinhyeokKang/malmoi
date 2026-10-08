import { useSyncExternalStore } from "react";

/**
 * **탭 안의 Inbox 안 읽음 수 하나** — 헤더 배지·사이드바 배지가 같은 n을 보이고, `/inbox` 페이지의 읽음 기록이 둘을 함께 0으로 만든다.
 * 헤더와 사이드바는 레이아웃에 있어 페이지 이동에 다시 마운트되지 않으므로 각자의 상태로는 페이지의 기록을 모른다.
 * Provider가 아니라 모듈 store인 것은 공개 셸 헤더도 같은 `AttentionInbox`이기 때문이다(공개 셸엔 사이드바·페이지가 없다).
 *
 * ⚠️ **렌더 중 `setUnread` 금지** — 이 모듈은 SSR에서도 평가되고 서버 프로세스에선 인스턴스 하나를 요청들이 공유한다.
 * 쓰기는 effect·이벤트 콜백에서만 한다. 그래서 서버 스냅샷은 store 값이 아니라 늘 0이다(레이아웃 렌더에 집계를 싣지 않는다).
 */
let unread = 0;
const countListeners = new Set<() => void>();
const seenListeners = new Set<() => void>();

function emit(listeners: Set<() => void>) {
  // 알림 도중 해제·추가가 순회를 흔들지 않도록 사본을 돈다.
  for (const listener of [...listeners]) listener();
}

export function getUnread(): number {
  return unread;
}

export function setUnread(n: number): void {
  unread = n;
  emit(countListeners);
}

export function subscribe(listener: () => void): () => void {
  countListeners.add(listener);
  return () => { countListeners.delete(listener); };
}

/** 페이지가 읽음을 기록했다는 신호 — 수를 직접 바꾸지 않는다. 0으로 만들 시점(닫힘 즉시 · 메뉴가 닫힐 때)은 헤더가 정한다. */
export function notifySeen(): void {
  emit(seenListeners);
}

export function onSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => { seenListeners.delete(listener); };
}

const serverSnapshot = () => 0;

export function useInboxUnread(): number {
  return useSyncExternalStore(subscribe, getUnread, serverSnapshot);
}
