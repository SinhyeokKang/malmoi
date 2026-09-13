import { auth } from "@/auth";

import { withOutageFlag } from "./outage";

/**
 * `auth()`를 **장애 표시와 함께** 읽는다. 모든 서버 진입점이 `auth()` 대신 이걸 쓴다 — 직접 부르면
 * DB 장애가 "비로그인"으로 접힌다 (`lib/auth/outage.ts`).
 *
 * `server-only`를 붙이지 않는다 — Action 테스트가 이 모듈을 지나며 `@/auth`만 mock한다.
 */
export type SessionRead =
  /**
   * `name`·`email`·`image`는 헤더 라벨용이다 — `publicSession`이 실어 준 값이라 왕복이 늘지 않는다.
   *
   * ⚠️ **`image`를 떨어뜨리던 것이 이 타입이었다** (2026-09-13). `lib/auth/public-session.ts`의
   * 허용 목록에 `image`가 **이미 있고** `getSessionAndUser`가 복호된 행을 돌려주므로,
   * `/api/auth/session` 본문은 전부터 사진 URL을 싣고 있었다 — **세션 페이로드는 안 커진다.**
   */
  | { status: "ok"; userId: string; name: string | null; email: string | null; image: string | null }
  | { status: "none" }
  /** 세션을 읽지 못했다 — 거부가 아니다. 호출부는 재시도를 권하고 로그인을 시키지 않는다. */
  | { status: "unavailable" };

export async function readSession(): Promise<SessionRead> {
  const { value, outage } = await withOutageFlag(() => auth());
  if (outage) return { status: "unavailable" };
  const userId = value?.user?.id;
  if (typeof userId !== "string" || userId === "") return { status: "none" };
  return { status: "ok", userId, name: value?.user?.name ?? null, email: value?.user?.email ?? null, image: value?.user?.image ?? null };
}
