// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { render, find } from "@/components/__tests__/helpers/dom";

const state = vi.hoisted(() => ({ session: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), accept: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: state.signIn, signOut: state.signOut }));
vi.mock("@/lib/session-revocation/clear-cookies", () => ({ clearRevocationCookies: vi.fn() }));
vi.mock("@/lib/login-link/clear-cookies", () => ({ clearLinkCookies: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: state.session }));
vi.mock("@/lib/credentials/records", () => ({ decodeInvitation: (row: unknown) => row }));
vi.mock("@/lib/credentials/access", () => ({ credentialIO: (read: () => Promise<unknown>) => read() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: async () => ({ email: "person@example.com", role: "EDITOR", acceptedAt: null, expiresAt: new Date("2099-01-01"), project: { name: "Demo" } }) } }) }));
vi.mock("../actions", () => ({ acceptInvitation: state.accept }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/signin/dot-field", () => ({ DotField: () => null }));
vi.mock("@/components/signin/auth-toast", () => ({ AuthToast: () => null }));
import Page from "../[token]/page";

for (const action of ["signIn", "accept", "signOut"] as const) {
  it(`초대 ${action} 제출 중 버튼을 잠그고 스피너를 표시한다`, async () => {
    let finish: (result?: unknown) => void = () => {};
    state[action].mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    state.session.mockResolvedValue({ status: action === "signIn" ? "none" : "ok" });
    const page = await Page({ params: Promise.resolve({ token: "token" }), searchParams: Promise.resolve(action === "signOut" ? { e: "email-mismatch" } : {}) });
    const { container } = await render(page);
    const button = find<HTMLButtonElement>(container, "form button");
    await act(async () => button.click());
    const disabled = button.disabled;
    const spinner = button.querySelector("svg.animate-spin");
    await act(async () => { finish(action === "accept" ? { ok: false, error: "unavailable" } : undefined); });
    expect(disabled).toBe(true);
    expect(spinner).not.toBeNull();
    expect(button.disabled).toBe(false);
  });
}
