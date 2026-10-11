/**
 * **셸 경계 — 뷰포트 `lg`(64rem) 하나** (responsive-public design §2 · 2026-10-07 사용자). 배치는 CSS(`lg:`·`max-lg:`)가 정하고, JS는 다섯 자리 — 열린 서랍·Inbox
 * 시트 정리 · 좁아지며 숨는 넓은 묶음의 포커스 이관(`useNarrowHandoff`) · Inbox 그릇 선택 · 앱 셸 LNB 패널의 레이아웃 보정 건너뜀(`shell-panels.tsx`, responsive-app) ·
 * 랜딩 스테이지 그릇 선택(`components/landing/stage.tsx`) — 에서만 이 쿼리를 `matchMedia`로 묻는다 — 렌더 상태로 두지 않아 SSR·하이드레이션 불일치가 없다.
 * ⚠️ **rem이다** — `1024px`·`innerWidth`로 판정하면 사용자 글꼴 크기에 따라 CSS 경계와 어긋난다. Tailwind `lg`와 같은지는 `breakpoint.test.ts`가 잰다.
 */
export const WIDE_QUERY = "(min-width: 64rem)";
/**
 * Tailwind `sm`(40rem) — **공개 랜딩 목업의 그릇 선택(T/M)에만 쓴다**(mockup-viewport-container). 앱·공개 셸 배치의 뷰포트 경계는 여전히 `lg` 하나다
 * (PRODUCT §4.1 · DESIGN §5의 예외). Tailwind `sm`과 같은지는 `breakpoint.test.ts`가 잰다.
 */
export const SM_QUERY = "(min-width: 40rem)";
