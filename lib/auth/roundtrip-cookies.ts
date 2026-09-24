import "server-only";
import { cookies } from "next/headers";
import { connectCookie, connectStateCookie } from "@/lib/account-connect/policy";
import { clearLinkCookies } from "@/lib/login-link/clear-cookies";
import { clearRevocationCookies } from "@/lib/session-revocation/clear-cookies";
import { expireBothVariants } from "./roundtrip";

// 모든 시작은 자기 쿠키를 심기 전에 버려진 다른 왕복을 전부 무효로 만든다.
export async function clearAuthRoundtripCookies(): Promise<void> {
  await clearLinkCookies();
  await clearRevocationCookies();
  expireBothVariants(await cookies(), [connectCookie, connectStateCookie]);
}
