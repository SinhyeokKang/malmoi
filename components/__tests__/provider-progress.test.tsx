// @vitest-environment jsdom
import { act, Children, isValidElement, type ReactElement, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render, find } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), set: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: mocks.signIn, signOut: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, get: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: async () => ({
  id: "i", projectId: "p", email: "a@example.test", role: "EDITOR", acceptedAt: null,
  expiresAt: new Date("2030-01-01"), project: { name: "Test", locales: [] },
}) } }) }));
vi.mock("@/lib/credentials/records", () => ({ decodeInvitation: (row: unknown) => row, decodeUser: (row: unknown) => row }));
vi.mock("@/lib/oauth-server/authorize", () => ({
  readAuthorizationRequest: async () => ({ status: "ok", request: {
    clientId: "https://claude.ai/oauth/claude-code-client-metadata", clientName: "Claude Code", redirectUri: "http://localhost:5000/callback",
  } }), storeAuthorizationRequest: vi.fn(),
}));
vi.mock("@/lib/oauth-server/client-metadata-fetch", () => ({ fetchClientMetadata: vi.fn() }));
vi.mock("@/app/invite/actions", () => ({ acceptInvitation: vi.fn() }));
vi.mock("@/app/oauth/authorize/actions", () => ({ authorizeOAuthRequest: vi.fn(), denyOAuthRequest: vi.fn(), switchOAuthAccount: vi.fn(), checkOAuthRequest: vi.fn() }));

import SignIn from "@/app/signin/page";
import InvitePage from "@/app/invite/[token]/page";
import OAuthAuthorizePage from "@/app/oauth/authorize/page";
import { ProviderSubmit } from "@/components/signin/provider-button";
import { m } from "@/lib/i18n";

type ProviderProps = { provider: string; children?: ReactNode };
function providers(node: ReactNode): ReactElement<ProviderProps>[] {
  const found: ReactElement<ProviderProps>[] = [];
  Children.forEach(node, child => {
    if (!isValidElement<ProviderProps>(child)) return;
    if (typeof child.type === "function" && child.type.name === "ProviderButton") found.push(child);
    else found.push(...providers(child.props.children));
  });
  return found;
}
const pages = {
  signin: () => SignIn({ searchParams: Promise.resolve({}) }),
  invite: () => InvitePage({ params: Promise.resolve({ token: "invite-token" }), searchParams: Promise.resolve({}) }),
  oauth: () => OAuthAuthorizePage({ searchParams: Promise.resolve({ request: "req_1" }) }),
};
const cases = (Object.keys(pages) as (keyof typeof pages)[]).flatMap(entry => (["github", "google"] as const).map(provider => ({ entry, provider })));
beforeEach(() => { vi.clearAllMocks(); });

// 실제 서버 페이지의 ProviderButton과 실제 form action/useFormStatus를 렌더한다.
it.each(cases)("$entry/$provider keeps one glyph, its label and native submit lock", async ({ entry, provider }) => {
  const callers = providers(await pages[entry]());
  expect(callers).toHaveLength(2);
  const caller = callers.find(node => node.props.provider === provider)!;
  const form = Reflect.apply(caller.type as Function, null, [caller.props]) as ReactElement<{ children: ReactElement<Parameters<typeof ProviderSubmit>[0]> }>;
  expect(form.props.children.type).toBe(ProviderSubmit);
  let finish!: () => void;
  mocks.signIn.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  const { container } = await render(form);
  const button = find<HTMLButtonElement>(container, "button");
  const text = provider === "github" ? m.signIn.github : m.signIn.google;
  expect(button.textContent).toBe(text);
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  expect(button.disabled).toBe(false);
  try {
    await act(async () => { await userEvent.setup().click(button); });
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button.querySelector(".animate-spin")?.classList.contains("size-4")).toBe(true);
    expect(button.textContent).toBe(text);
    expect(container.querySelector("button")).toBe(button);
    await act(async () => { button.click(); });
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  } finally { await act(async () => { finish(); }); }
  expect(button.disabled).toBe(false);
  expect(button.querySelector(".animate-spin")).toBeNull();
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  expect(container.querySelector("button")).toBe(button);
  expect(button.textContent).toBe(text);
  // SVG 내부 표식만으로는 Button의 첫 JSX 자식 인식이 되지 않는다.
  const icon = form.props.children.props.icon;
  expect(isValidElement<{ "aria-hidden"?: boolean }>(icon) && icon.props["aria-hidden"]).toBe(true);
});
