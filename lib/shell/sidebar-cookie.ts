/**
 * **LNB 접힘 여부의 기기 쿠키** (2026-10-07 사용자) — 서버 레이아웃이 읽어 첫 페인트부터 접힌 셸을 그리고, 셸 패널(클라이언트)이
 * 사용자의 토글·드래그 때 `document.cookie`로 쓴다. 폭(200~320)은 저장하지 않는다 — 여부만이다.
 *
 * ⚠️ **http-only가 아니다 — 이 리포에서 스크립트가 쓰는 유일한 쿠키다.** 테마·언어 쿠키(`lib/device-cookies/spec.ts`)는 Server Action이
 * 쓰지만, 그 경로는 쿠키를 바꾸면 현재 라우트를 서버에서 다시 그린다 — 토글마다 번역 화면 전체를 다시 받게 된다. 담는 것이 `1`/`0`뿐이라
 * 스크립트가 읽어도 잃을 것이 없다. 개인정보 방침의 "모두 http-only" 문장이 이 쿠키를 예외로 밝힌다(`policy-gate.test.tsx`).
 *
 * ⚠️ **잎이다 — import가 0이다.** 서버 레이아웃과 클라이언트 셸이 같이 읽는다(`components/__tests__/client-graph.test.ts`).
 * ⚠️ localStorage로 옮기지 않는다 — 서버가 못 읽어 첫 페인트가 펼침이고 하이드레이션 뒤에 접힌다(DESIGN §6.5 — 폭 영속화 없음과 같은 이유).
 */
export const SIDEBAR_COLLAPSED_COOKIE = "malmoi-sidebar-collapsed";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** 쿠키 값은 남이 고칠 수 있다 — `1`만 접힘이고 그 밖은 기본(펼침)이다. */
export function parseSidebarCollapsed(raw: unknown): boolean {
  return raw === "1";
}

/** `document.cookie`에 대입할 한 줄. `secure`는 호출부가 `location.protocol`로 정한다 — 로컬 http에서 Secure를 달면 브라우저가 버린다. */
export function sidebarCollapsedCookie(collapsed: boolean, secure: boolean): string {
  return [`${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}`, "Path=/", `Max-Age=${ONE_YEAR}`, ...(secure ? ["Secure"] : []), "SameSite=Lax"].join("; ");
}
