import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/app/(edit)/account/actions", () => ({ startSessionRevocation: vi.fn() }));
import { SessionRevocation } from "@/components/session-revocation";
import { m } from "@/lib/i18n";
it.each([
  ["cancelled", m.account.sessions.cancelled], ["wrong-account", m.account.sessions.wrongAccount],
  ["expired", m.account.sessions.expired], ["unavailable", m.account.sessions.failed], ["invalid", m.account.sessions.failed],
])("%s renders an accessible error with a retry submit", (outcome, message) => {
  const html = renderToStaticMarkup(<SessionRevocation outcome={outcome} />);
  expect(html).toContain('role="alert"');
  expect(html).toContain(message);
  expect(html).toContain('type="submit"');
  expect(html).toContain(m.account.sessions.button);
});
it.each([undefined, "toString", "__proto__", "revoked", "<script>bad</script>"])("untrusted result %s cannot inject a message or claim success", outcome => {
  const html = renderToStaticMarkup(<SessionRevocation outcome={outcome} />);
  expect(html).not.toContain('role="alert"');
  expect(html).not.toContain(m.account.sessions.complete);
  expect(html).not.toContain("<script>bad</script>");
});
