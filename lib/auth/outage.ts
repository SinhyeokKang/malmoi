import { AsyncLocalStorage } from "node:async_hooks";

/**
 * **"세션 없음"과 "세션을 못 읽었다"를 가른다** (POSTMORTEM 2026-09-06).
 *
 * `auth()`는 어댑터 예외를 `logger.error(new SessionTokenError(e))`로 삼키고 body `null`을 돌려준다
 * (`@auth/core/lib/actions/session.js:123-125`). `next-auth`의 `parseSessionResponse`도 non-OK를 `null`로
 * 접는다. 그래서 **반환값으로는 원리적으로 구별할 수 없다** — DB 장애가 정당한 비로그인과 바이트 단위로
 * 같은 응답을 냈고, 프로덕션 전면 장애를 "리다이렉트 100% = 정상"으로 읽었다.
 *
 * 남은 통로는 `logger`다. `auth.ts`가 `logger.error`에서 `noteAuthError`를 부르고, 호출부는
 * `withOutageFlag(() => auth())`로 감싸 그 표시를 받는다. `AsyncLocalStorage`라 동시 요청이 서로의 표시를
 * 보지 않는다 — 모듈 변수 하나로 두면 다른 요청의 장애가 이 요청의 거부로 둔갑한다.
 *
 * `server-only`를 붙이지 않는다 — Action 테스트가 `@/auth` mock 안에서 `noteAuthError`를 직접 부른다.
 */

type OutageStore = { outage: boolean };

const storage = new AsyncLocalStorage<OutageStore>();

/** Auth.js 오류의 `type`으로 판정한다 — `SessionTokenError`만 세션 읽기 실패다. 다른 AuthError는 정당한 거부다. */
export function isSessionReadError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { type?: unknown }).type === "SessionTokenError";
}

/**
 * `auth.ts`의 `logger.error`가 찍는 고정 분류. ⚠️ **`error.name`이 아니라 Auth.js의 `type`이다** — 프로덕션 빌드가 클래스명을 줄여
 * `name`이 `k`로 찍혔다(B7 실습). `type`은 Auth.js가 정적 문자열로 둔다. 식별자 모양이 아니면 쓰지 않는다 — 남의 오류 객체의 `type`에
 * 문장이 실려 로그로 새지 않게.
 */
export function authErrorLabel(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const type = (error as { type?: unknown }).type;
  return typeof type === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(type) ? type : error.name;
}

/** `auth.ts`의 `logger.error`가 부른다. 스코프 밖(다른 경로의 로그)에서는 아무 일도 하지 않는다. */
export function noteAuthError(error: unknown): void {
  const store = storage.getStore();
  if (store !== undefined && isSessionReadError(error)) store.outage = true;
}

export async function withOutageFlag<T>(fn: () => Promise<T>): Promise<{ value: T; outage: boolean }> {
  const store: OutageStore = { outage: false };
  const value = await storage.run(store, fn);
  return { value, outage: store.outage };
}
