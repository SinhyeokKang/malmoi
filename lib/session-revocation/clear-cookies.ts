import "server-only";
import { cookies } from "next/headers";
import { revocationCookie, revocationStateCookie } from "./policy";

/** Both ordinary login entry points supersede an abandoned account-confirmation flow. */
export async function clearRevocationCookies() {
  const jar = await cookies();
  for (const secure of [false, true]) {
    for (const cookie of [revocationCookie(secure), revocationStateCookie(secure)]) {
      jar.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
    }
  }
}
