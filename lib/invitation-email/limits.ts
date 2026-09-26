/**
 * 발급 제한 상수 (design §3). **잎 모듈이다** — `recipients.ts`가 클라이언트 폼에서도 불리므로
 * `plan.ts`(→ `lib/auth/invitation` → `node:crypto`)를 거치지 않고 이 값을 읽는다.
 */

export const ADDRESS_INTERVAL_MS = 60_000;
export const PROJECT_WINDOW_MS = 60 * 60 * 1000;
/** 한 요청의 주소 수 상한도 이 값이다 — 넘는 요청은 기다려도 통과할 수 없다. */
export const INVITATION_HOURLY_LIMIT = 20;
/**
 * 발급자 한 사람의 최근 1시간 합산(전 프로젝트, 창은 `PROJECT_WINDOW_MS`와 같다). 프로젝트를 여럿 만들어
 * 20 × N으로 보내는 경로를 닫는다 — 프로젝트 한도보다 크고 세 프로젝트 몫보다 작다(sec-audit-3 결정 E).
 */
export const USER_HOURLY_LIMIT = 30;
