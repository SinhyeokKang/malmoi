import "server-only";

import { cookies, headers } from "next/headers";

import { deviceCookieSpec, isSecureForwardedProto } from "@/lib/device-cookies/spec";
import { UI_LOCALE_COOKIE, type UiLocale } from "./locales";

/**
 * **Server Action에서 기기 쿠키에 화면 언어를 쓴다** — `setUiLocale`이 부른다. 속성은 `deviceCookieSpec` 한 곳이다.
 * ⚠️ **Route Handler(Auth.js 콜백)에서는 부르지 않는다** — 로그인 동기화는 `lib/device-cookies/sign-in.ts`다(ARCHITECTURE §6.357).
 */
export async function setUiLocaleCookie(uiLocale: UiLocale): Promise<void> {
  const { name, value, options } = deviceCookieSpec(UI_LOCALE_COOKIE, uiLocale, isSecureForwardedProto((await headers()).get("x-forwarded-proto")));
  (await cookies()).set(name, value, options);
}
