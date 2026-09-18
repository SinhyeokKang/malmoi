import "server-only";
import { cookies } from "next/headers";
import { connectCookie, connectStateCookie } from "@/lib/account-connect/policy";
import { clearLinkCookies } from "@/lib/login-link/clear-cookies";
import { clearRevocationCookies } from "@/lib/session-revocation/clear-cookies";

// 모든 시작은 자기 쿠키를 심기 전에 버려진 다른 왕복을 전부 무효로 만든다.
export async function clearAuthRoundtripCookies(): Promise<void> {
  await clearLinkCookies();
  await clearRevocationCookies();
  const jar = await cookies();
  for (const secure of [false, true]) {
    for (const cookie of [connectCookie(secure), connectStateCookie(secure)]) {
      jar.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
    }
  }
}
