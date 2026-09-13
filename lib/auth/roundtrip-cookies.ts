import "server-only";
import { clearLinkCookies } from "@/lib/login-link/clear-cookies";
import { clearRevocationCookies } from "@/lib/session-revocation/clear-cookies";

// Every start supersedes all abandoned purposes before setting its own cookies.
export async function clearAuthRoundtripCookies(): Promise<void> {
  await clearLinkCookies();
  await clearRevocationCookies();
}
