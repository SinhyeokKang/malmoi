/**
 * 주소창에 싣는 불투명 토큰의 코덱 — 키셋 커서가 쓴다(`lib/events/filter.ts` · `lib/keys/translation-list.ts`).
 * 페이로드 모양(구분자·JSON 튜플)은 소비자가 정하고, 여기는 문자열 ↔ base64url만 든다 (audit #73 — 전엔 세 벌이었다).
 *
 * ⚠️ **잎이다** — import가 0이고 `Buffer`를 쓰지 않는다. Logs 필터 UI가 클라이언트 컴포넌트라 이 그래프가 곧
 * 번들이다(`components/__tests__/client-graph.test.ts`). `btoa`/`atob`는 latin1만 받으므로 퍼센트 인코딩을 한 겹 지난다.
 *
 * ⚠️ **디코드는 무엇을 받아도 던지지 않는다** — 주소창 값이다. 깨진 토큰은 `null`이고 화면은 첫 페이지를 그린다.
 */

/** `+`·`/`·`=`가 URL에 실리면 인코딩이 한 겹 더 붙는다 — base64url로 낸다. */
export function encodeUrlToken(value: string): string {
  return btoa(encodeURIComponent(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeUrlToken(raw: string): string | null {
  if (raw === "" || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
  try {
    const decoded = decodeURIComponent(atob(padded));
    return decoded === "" ? null : decoded;
  } catch {
    return null;
  }
}
