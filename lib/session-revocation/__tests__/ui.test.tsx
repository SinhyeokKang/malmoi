import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/app/(edit)/account/actions", () => ({ startSessionRevocation: vi.fn() }));
import { SessionsSection } from "@/components/account/sessions-section";
import { m } from "@/lib/i18n";

/**
 * ⚠️ **`components/session-revocation.tsx`를 겨냥하던 파일이다** (2026-09-13). 그 카드가 Sessions
 * **구역의 항목 하나**가 되면서 문구의 자리가 바뀌었고, 그 자리를 이 파일이 계속 잡는다 —
 * `?sessionRevocation=`이 **구역 안**에 닿는다는 것이 이 화면의 완료 조건 하나다.
 *
 * ⚠️ **확인 버튼은 Dialog 안이라 정적 마크업에 없다** (Radix Portal). 정적으로 셀 수 있는 것은
 * **여는 버튼**이고, 그것이 없으면 사용자는 그 Dialog에 도달할 길이 없다.
 */
const render = (outcome: string | undefined) =>
  renderToStaticMarkup(<SessionsSection outcome={outcome} signOut={() => {}} confirmProvider="GitHub" />);

it.each([
  ["cancelled", m.account.sessions.cancelled], ["wrong-account", m.account.sessions.wrongAccount],
  ["expired", m.account.sessions.expired], ["unavailable", m.account.sessions.failed], ["invalid", m.account.sessions.failed],
])("%s renders an accessible error inside the sessions section", (outcome, message) => {
  const html = render(outcome);
  expect(html).toContain('role="alert"');
  expect(html).toContain(message);
  expect(html).toContain(m.account.sessions.title);
});

it.each([undefined, "toString", "__proto__", "revoked", "<script>bad</script>"])("untrusted result %s cannot inject a message or claim success", outcome => {
  const html = render(outcome);
  expect(html).not.toContain('role="alert"');
  expect(html).not.toContain(m.account.sessions.complete);
  expect(html).not.toContain("<script>bad</script>");
});
