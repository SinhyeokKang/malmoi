import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ set: vi.fn(), signIn: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: s.signIn }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: s.set, get: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: async () => ({ id: "i", projectId: "p", email: "a@example.com", role: "EDITOR", acceptedAt: null, expiresAt: new Date("2030-01-01"), project: { name: "Test", locales: [] } }) } }) }));
vi.mock("@/lib/credentials/records", () => ({ decodeInvitation: (row: unknown) => row }));
vi.mock("@/lib/login-link/view", () => ({
  loadChallengeView: async () => ({ emailLabel: "a***@example.com", have: "github", pending: "google", joined: new Date("2026-09-01"), dest: { kind: "projects" } }),
}));
import SignIn from "@/app/signin/page";
import InvitePage from "@/app/invite/[token]/page";
import LinkAccountPage from "@/app/signin/link/[challenge]/page";
function providers(node: ReactNode): ReactElement[] {
  const found: ReactElement[] = [];
  Children.forEach(node, child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (typeof child.type === "function" && child.type.name === "ProviderButton") found.push(child);
    else found.push(...providers(child.props.children));
  });
  return found;
}

const REVOCATION = ["malmoi-session-revocation", "__Host-malmoi-session-revocation", "malmoi-revocation-state", "__Secure-malmoi-revocation-state"];
const LINK = ["malmoi-login-link", "__Host-malmoi-login-link", "malmoi-link-state", "__Secure-malmoi-link-state"];

/**
 * ⚠️ **목록이 셋이 됐다** (account-linking design §13) — 병합 안내 화면의 [Confirm]도 일반
 * 로그인을 시작하므로, 버려진 회수 왕복이 그 callback을 먹으면 Location이
 * `/account?sessionRevocation=invalid`로 덮인다 (POSTMORTEM 2026-09-10).
 *
 * ⚠️ **양방향이다** — 일반 로그인 둘은 병합 쿠키도 지운다. 남은 병합 쿠키가 평범한 로그인
 * callback을 가로채면 그 로그인이 병합 실패 화면으로 샌다 (design 불변식 8c).
 */
const ENTRIES = [
  { entry: "root", buttons: 2, cleared: [...REVOCATION, ...LINK], destination: "/projects" },
  { entry: "invite", buttons: 2, cleared: [...REVOCATION, ...LINK], destination: "/invite/invite-token" },
  { entry: "link", buttons: 1, cleared: REVOCATION, destination: "/projects" },
] as const;

async function render(entry: (typeof ENTRIES)[number]["entry"]) {
  if (entry === "root") return SignIn({ searchParams: Promise.resolve({}) });
  if (entry === "invite") {
    return InvitePage({ params: Promise.resolve({ token: "invite-token" }), searchParams: Promise.resolve({}) });
  }
  return LinkAccountPage({ params: Promise.resolve({ challenge: "chal" }), searchParams: Promise.resolve({}) });
}

it.each(ENTRIES)("$entry login clears abandoned confirmation cookies and preserves its destination", async ({ entry, buttons: count, cleared, destination }) => {
  const page = await render(entry);
  const buttons = providers(page);
  expect(buttons).toHaveLength(count);
  for (const button of buttons) {
    s.set.mockClear(); s.signIn.mockClear();
    const form = Reflect.apply(button.type as Function, null, [button.props]) as ReactElement<{ action: () => Promise<void> }>;
    await form.props.action();
    for (const name of cleared) {
      expect(s.set).toHaveBeenCalledWith(name, "", expect.objectContaining({ path: "/", maxAge: 0 }));
    }
    expect(s.set.mock.invocationCallOrder[0]).toBeLessThan(s.signIn.mock.invocationCallOrder[0]!);
    expect(s.signIn).toHaveBeenCalledWith(expect.stringMatching(/^(github|google)$/), { redirectTo: destination });
  }
});

/** 병합 시작은 challenge 원문을 쿠키에 실어야 callback이 그 행을 찾는다 (design 불변식 4). */
it("link confirmation carries the challenge token in its own cookie", async () => {
  const page = await render("link");
  const button = providers(page)[0]!;
  s.set.mockClear(); s.signIn.mockClear();
  const form = Reflect.apply(button.type as Function, null, [button.props]) as ReactElement<{ action: () => Promise<void> }>;
  await form.props.action();
  expect(s.set).toHaveBeenCalledWith("malmoi-login-link", "chal", expect.objectContaining({ httpOnly: true, path: "/" }));
});
