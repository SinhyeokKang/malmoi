import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ set: vi.fn(), signIn: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: s.signIn }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: s.set }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: async () => ({ id: "i", projectId: "p", email: "a@example.com", role: "EDITOR", acceptedAt: null, expiresAt: new Date("2030-01-01"), project: { name: "Test" } }) } }) }));
vi.mock("@/lib/credentials/records", () => ({ decodeInvitation: (row: unknown) => row }));
import Home from "@/app/page";
import InvitePage from "@/app/invite/[token]/page";
function providers(node: ReactNode): ReactElement[] {
  const found: ReactElement[] = [];
  Children.forEach(node, child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (typeof child.type === "function" && child.type.name === "ProviderButton") found.push(child);
    else found.push(...providers(child.props.children));
  });
  return found;
}
it.each(["root", "invite"])("%s login clears abandoned revocation cookies and preserves its destination", async entry => {
  const page = entry === "root" ? await Home({ searchParams: Promise.resolve({}) }) : await InvitePage({ params: Promise.resolve({ token: "invite-token" }), searchParams: Promise.resolve({}) });
  const buttons = providers(page);
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    s.set.mockClear(); s.signIn.mockClear();
    const form = Reflect.apply(button.type as Function, null, [button.props]) as ReactElement<{ action: () => Promise<void> }>;
    await form.props.action();
    for (const name of ["malmoi-session-revocation", "__Host-malmoi-session-revocation", "malmoi-revocation-state", "__Secure-malmoi-revocation-state"]) {
      expect(s.set).toHaveBeenCalledWith(name, "", expect.objectContaining({ path: "/", maxAge: 0 }));
    }
    expect(s.set.mock.invocationCallOrder[0]).toBeLessThan(s.signIn.mock.invocationCallOrder[0]!);
    expect(s.signIn).toHaveBeenCalledWith(expect.stringMatching(/^(github|google)$/), { redirectTo: entry === "root" ? "/projects" : "/invite/invite-token" });
  }
});
