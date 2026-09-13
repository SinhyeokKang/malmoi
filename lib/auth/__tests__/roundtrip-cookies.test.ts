import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { clearAuthRoundtripCookies } from "../roundtrip-cookies";
const set = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }));
it("공통 정리는 보안 접두 유무에 관계없이 두 왕복의 쿠키를 모두 만료시킨다", async () => {
  await clearAuthRoundtripCookies();
  for (const name of ["malmoi-account-connect", "__Host-malmoi-account-connect", "malmoi-connect-state", "__Secure-malmoi-connect-state", "malmoi-session-revocation", "__Host-malmoi-session-revocation", "malmoi-revocation-state", "__Secure-malmoi-revocation-state", "malmoi-login-link", "__Host-malmoi-login-link", "malmoi-link-state", "__Secure-malmoi-link-state"]) {
    expect(set).toHaveBeenCalledWith(name, "", expect.objectContaining({ maxAge: 0 }));
  }
});
function clearedBeforeStart(source: string) {
  const clear = source.indexOf("await clearAuthRoundtripCookies()");
  return clear >= 0 && clear < source.lastIndexOf("signIn(");
}
it.each(["app/signin/page.tsx", "app/invite/[token]/page.tsx", "app/signin/link/[challenge]/page.tsx", "app/(edit)/account/actions.ts"])("%s는 새 왕복 전에 공통 정리를 거친다", (path) => {
  const source = readFileSync(path, "utf8");
  expect(clearedBeforeStart(source)).toBe(true);
  expect(clearedBeforeStart(source.replaceAll("await clearAuthRoundtripCookies()", ""))).toBe(false);
});
