import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { getPrisma } from "@/lib/db";
import { describeFailure } from "@/lib/failure";
import { colorSchemeCookieSpec, isSecureForwardedProto, serializeCookieSpec } from "./cookie-spec";
import { COLOR_SCHEME_COOKIE, parseColorScheme, type ColorScheme } from "./scheme";

/**
 * **로그인이 끝나면 계정의 테마를 이 기기 쿠키로 옮겨 적는다** — 그래야 로그아웃 뒤·다음 로그인 직전 화면이 계정 값과 같아 테마가 확 바뀌지 않는다.
 * 첫 로그인 그 순간의 한 번 전환은 원리상 남는다(쿠키가 아직 없다).
 *
 * ⚠️ **`cookies().set`을 쓰지 않는다** — Route Handler에서 그것은 응답의 Set-Cookie **전체를 재직렬화**하고 `Max-Age=0` 삭제 쿠키를 빈 세션 쿠키로 바꾼다
 * (리뷰 재현, ARCHITECTURE §6.357). 그래서 둘로 쪼갠다: `events.signIn`은 값을 요청 스코프에 **기록만** 하고(`recordColorSchemeAtSignIn`),
 * `handlers` 바깥 래퍼가 응답 헤더 사본에 직렬화한 한 줄을 **덧붙인다**(`withColorSchemeSync`) — 기존 헤더는 바이트 그대로다.
 * ⚠️ 계정 값이 비었거나 지원 밖이면 쿠키를 건드리지 않는다(기기 선택 보존). 쿠키를 계정으로 올리는 방향은 없다 — DB 쓰기 0.
 * ⚠️ 기록은 **절대 던지지 않는다** — 테마 때문에 로그인이 실패하면 안 된다.
 */
const pending = new AsyncLocalStorage<{ colorScheme: ColorScheme | null }>();

export async function recordColorSchemeAtSignIn(userId: string): Promise<void> {
  const slot = pending.getStore();
  if (slot === undefined) return;
  try {
    const row = await getPrisma().user.findUnique({ where: { id: userId }, select: { colorScheme: true } });
    slot.colorScheme = parseColorScheme(row?.colorScheme);
  } catch (error) {
    console.error("Color scheme cookie sync failed.", { userId, cause: describeFailure(error) });
  }
}

/** 요청 쿠키는 `NextRequest`가 들고 있고, 이 모듈은 그 모양만 읽는다. */
type SignInRequest = { headers: Headers; cookies: { get(name: string): { value: string } | undefined } };

/**
 * `handlers`의 **가장 바깥**에 선다 — 안쪽 래퍼(`withRevocation`·`withConnect`·`withLoginLink`)가 응답을 어떻게 다시 만들든 그 뒤에 한 줄을 붙이므로
 * 우리 줄은 그들의 재직렬화를 지나지 않는다. 요청 쿠키가 이미 같은 값이면 쓰지 않는다.
 */
export async function withColorSchemeSync(request: SignInRequest, run: () => Promise<Response>): Promise<Response> {
  const slot: { colorScheme: ColorScheme | null } = { colorScheme: null };
  const response = await pending.run(slot, run);
  if (slot.colorScheme === null || request.cookies.get(COLOR_SCHEME_COOKIE)?.value === slot.colorScheme) return response;

  const headers = new Headers(response.headers);
  headers.append("set-cookie", serializeCookieSpec(colorSchemeCookieSpec(slot.colorScheme, isSecureForwardedProto(request.headers.get("x-forwarded-proto")))));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
