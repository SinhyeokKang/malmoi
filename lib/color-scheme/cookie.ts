import "server-only";

import { cookies, headers } from "next/headers";

import { deviceCookieSpec, isSecureForwardedProto } from "@/lib/device-cookies/spec";
import { COLOR_SCHEME_COOKIE, type ColorScheme } from "./scheme";

/**
 * **Server Action에서 기기 쿠키에 테마를 쓴다** — `setColorScheme`이 부른다. 속성은 `deviceCookieSpec` 한 곳이다.
 * ⚠️ **Route Handler(Auth.js 콜백)에서는 부르지 않는다** — `cookies().set`이 응답의 Set-Cookie 전체를 재직렬화한다. 로그인 동기화는 `lib/device-cookies/sign-in.ts`다.
 */
export async function setColorSchemeCookie(colorScheme: ColorScheme): Promise<void> {
  const { name, value, options } = deviceCookieSpec(COLOR_SCHEME_COOKIE, colorScheme, isSecureForwardedProto((await headers()).get("x-forwarded-proto")));
  (await cookies()).set(name, value, options);
}
