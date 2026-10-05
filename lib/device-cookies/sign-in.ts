import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { COLOR_SCHEME_COOKIE, parseColorScheme } from "@/lib/color-scheme/scheme";
import { getPrisma } from "@/lib/db";
import { describeFailure } from "@/lib/failure";
import { UI_LOCALE_COOKIE, parseUiLocale } from "@/lib/i18n/locales";
import { deviceCookieSpec, isSecureForwardedProto, serializeCookieSpec } from "./spec";

/**
 * **로그인이 끝나면 계정의 화면 테마·화면 언어를 이 기기 쿠키로 옮겨 적는다** — 그래야 로그아웃 뒤·다음 로그인 직전 화면이 계정 값과 같아 테마·언어가 확 바뀌지 않는다.
 * 첫 로그인 그 순간의 한 번 전환은 원리상 남는다(쿠키가 아직 없다). 판정 순서(계정 > 쿠키 > 기본)는 그대로다.
 *
 * ⚠️ **`cookies().set`을 쓰지 않는다** — Route Handler에서 그것은 응답의 Set-Cookie **전체를 재직렬화**하고 `Max-Age=0` 삭제 쿠키를 빈 세션 쿠키로 바꾼다
 * (리뷰 재현, ARCHITECTURE §6.357). 그래서 둘로 쪼갠다: `events.signIn`은 값을 요청 스코프에 **기록만** 하고(`recordDeviceCookiesAtSignIn`),
 * `handlers` 바깥 래퍼가 응답 헤더 사본에 직렬화한 줄을 **덧붙인다**(`withDeviceCookieSync`) — 기존 헤더는 바이트 그대로다.
 * ⚠️ 계정 값이 비었거나 지원 밖이면 그 쿠키는 건드리지 않는다(기기 선택 보존). 쿠키를 계정으로 올리는 방향은 없다 — DB 쓰기 0, 한 번의 조회로 둘을 읽는다.
 * ⚠️ 기록은 **절대 던지지 않는다** — 테마·언어 때문에 로그인이 실패하면 안 된다.
 */
type Slot = { colorScheme: string | null; uiLocale: string | null };
const pending = new AsyncLocalStorage<Slot>();

export async function recordDeviceCookiesAtSignIn(userId: string): Promise<void> {
  const slot = pending.getStore();
  if (slot === undefined) return;
  try {
    const row = await getPrisma().user.findUnique({ where: { id: userId }, select: { colorScheme: true, uiLocale: true } });
    slot.colorScheme = parseColorScheme(row?.colorScheme);
    slot.uiLocale = parseUiLocale(row?.uiLocale);
  } catch (error) {
    console.error("Device cookie sync failed.", { userId, cause: describeFailure(error) });
  }
}

/** 요청 쿠키는 `NextRequest`가 들고 있고, 이 모듈은 그 모양만 읽는다. */
type SignInRequest = { headers: Headers; cookies: { get(name: string): { value: string } | undefined } };

/**
 * `handlers`의 **가장 바깥**에 선다 — 안쪽 래퍼(`withRevocation`·`withConnect`·`withLoginLink`)가 응답을 어떻게 다시 만들든 그 뒤에 줄을 붙이므로
 * 우리 줄은 그들의 재직렬화를 지나지 않는다. 쿠키마다 요청 쿠키가 이미 같은 값이면 쓰지 않는다.
 */
export async function withDeviceCookieSync(request: SignInRequest, run: () => Promise<Response>): Promise<Response> {
  const slot: Slot = { colorScheme: null, uiLocale: null };
  const response = await pending.run(slot, run);

  const secure = isSecureForwardedProto(request.headers.get("x-forwarded-proto"));
  const wanted: Array<[name: string, value: string | null]> = [
    [COLOR_SCHEME_COOKIE, slot.colorScheme],
    [UI_LOCALE_COOKIE, slot.uiLocale],
  ];
  const lines: string[] = [];
  for (const [name, value] of wanted) {
    if (value === null || request.cookies.get(name)?.value === value) continue;
    lines.push(serializeCookieSpec(deviceCookieSpec(name, value, secure)));
  }
  if (lines.length === 0) return response;

  const headers = new Headers(response.headers);
  for (const line of lines) headers.append("set-cookie", line);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
