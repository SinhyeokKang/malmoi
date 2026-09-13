import "server-only";
import { cookies } from "next/headers";
import { connectCookie, connectStateCookie } from "@/lib/account-connect/policy";
import { clearLinkCookies } from "@/lib/login-link/clear-cookies";
import { clearRevocationCookies } from "@/lib/session-revocation/clear-cookies";

// Every start supersedes all abandoned purposes before setting its own cookies.
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
