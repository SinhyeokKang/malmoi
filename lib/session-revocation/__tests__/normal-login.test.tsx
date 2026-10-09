import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ set: vi.fn(), signIn: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: s.signIn }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: s.set, get: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: async () => ({ id: "i", projectId: "p", email: "a@example.com", role: "EDITOR", acceptedAt: null, expiresAt: new Date("2030-01-01"), project: { name: "Test", locales: [] } }) } }) }));
vi.mock("@/lib/credentials/records", () => ({ decodeInvitation: (row: unknown) => row, decodeUser: (row: unknown) => row }));
vi.mock("@/lib/login-link/view", () => ({
  loadChallengeView: async () => ({ emailLabel: "a***@example.com", have: "github", pending: "google", joined: new Date("2026-09-01"), dest: { kind: "projects" } }),
}));
vi.mock("@/lib/oauth-server/authorize", () => ({
  readAuthorizationRequest: async () => ({ status: "ok", request: { clientId: "https://claude.ai/oauth/claude-code-client-metadata", clientName: "Claude Code", redirectUri: "http://localhost:5000/callback" } }),
  storeAuthorizationRequest: vi.fn(),
}));
vi.mock("@/lib/oauth-server/client-metadata-fetch", () => ({ fetchClientMetadata: vi.fn() }));
import SignIn from "@/app/signin/page";
import OAuthAuthorizePage from "@/app/oauth/authorize/page";
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
const CONNECT = ["malmoi-account-connect", "__Host-malmoi-account-connect", "malmoi-connect-state", "__Secure-malmoi-connect-state"];
const LINK = ["malmoi-login-link", "__Host-malmoi-login-link", "malmoi-link-state", "__Secure-malmoi-link-state"];

/**
 * ⚠️ **목록이 셋이 됐다** (ARCHITECTURE "계정 병합") — 병합 안내 화면의 [Confirm]도 일반
 * 로그인을 시작하므로, 버려진 회수 왕복이 그 callback을 먹으면 Location이
 * `/account?sessionRevocation=invalid`로 덮인다 (POSTMORTEM 2026-09-10).
 *
 * ⚠️ **양방향이다** — 일반 로그인 둘은 병합 쿠키도 지운다. 남은 병합 쿠키가 평범한 로그인
 * callback을 가로채면 그 로그인이 병합 실패 화면으로 샌다 (ARCHITECTURE "계정 병합").
 */
const ENTRIES = [
  { entry: "root", buttons: 2, cleared: [...REVOCATION, ...LINK, ...CONNECT], destination: "/projects" },
  { entry: "invite", buttons: 2, cleared: [...REVOCATION, ...LINK, ...CONNECT], destination: "/invite/invite-token" },
  { entry: "link", buttons: 1, cleared: [...REVOCATION, ...LINK, ...CONNECT], destination: "/projects" },
  // mcp-oauth design §6.1 — 동의 화면의 로그인도 일반 로그인 진입점이다. 목적지는 요청 ID 정규형 하나(`e` 없이).
  { entry: "oauth", buttons: 2, cleared: [...REVOCATION, ...LINK, ...CONNECT], destination: "/oauth/authorize?request=req_1" },
] as const;

async function render(entry: (typeof ENTRIES)[number]["entry"]) {
  if (entry === "root") return SignIn({ searchParams: Promise.resolve({}) });
  if (entry === "oauth") return OAuthAuthorizePage({ searchParams: Promise.resolve({ request: "req_1", e: "signed-out" }) });
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

/** 병합 시작은 challenge 원문을 쿠키에 실어야 callback이 그 행을 찾는다 (ARCHITECTURE "계정 병합"). */
it("link confirmation carries the challenge token in its own cookie", async () => {
  const page = await render("link");
  const button = providers(page)[0]!;
  s.set.mockClear(); s.signIn.mockClear();
  const form = Reflect.apply(button.type as Function, null, [button.props]) as ReactElement<{ action: () => Promise<void> }>;
  await form.props.action();
  expect(s.set).toHaveBeenCalledWith("malmoi-login-link", "chal", expect.objectContaining({ httpOnly: true, path: "/" }));
});

/**
 * 켜진 공급자만 그린다 (optional-login-providers spec §4.2) — 버튼 소비자 셋(`/signin`·`/invite`·`/oauth/authorize`)이 같은 판정
 * (`signInButtons`)을 쓴다. 테스트 기본(setup)은 hosted 두 쌍이고, 단독은 env를 비워 만든다.
 */
const BUTTON_ENTRIES = ["root", "invite", "oauth"] as const;
const shape = (buttons: ReactElement[]) => buttons.map((b) => {
  const props = b.props as { provider: string; variant: string };
  return [props.provider, props.variant];
});
afterEach(() => vi.unstubAllEnvs());

it.each(BUTTON_ENTRIES)("%s draws both providers on hosted — GitHub primary", async (entry) => {
  expect(shape(providers(await render(entry)))).toEqual([["github", "primary"], ["google", "default"]]);
});

it.each(BUTTON_ENTRIES)("%s draws only the enabled provider — Google alone is primary", async (entry) => {
  vi.stubEnv("AUTH_GITHUB_SECRET", "");
  const buttons = providers(await render(entry));
  expect(shape(buttons)).toEqual([["google", "primary"]]);
  s.signIn.mockClear();
  const form = Reflect.apply(buttons[0]!.type as Function, null, [buttons[0]!.props]) as ReactElement<{ action: () => Promise<void> }>;
  await form.props.action();
  expect(s.signIn).toHaveBeenCalledWith("google", expect.anything());
});

it.each(BUTTON_ENTRIES)("%s draws only GitHub when Google is off", async (entry) => {
  vi.stubEnv("AUTH_GOOGLE_ID", "");
  expect(shape(providers(await render(entry)))).toEqual([["github", "primary"]]);
});

/** `/signin?error=MethodUnavailable` — `auth.ts`가 보내는 사유를 이 화면이 실제로 읽는다(보내놓고 안 읽으면 무음이다, POSTMORTEM 2026-09-06). */
it("signin shows the MethodUnavailable message, not OAuthAccountNotLinked", async () => {
  const page = await SignIn({ searchParams: Promise.resolve({ error: "MethodUnavailable" }) });
  const toast = (function find(node: ReactNode): ReactElement<{ error?: string }> | undefined {
    let hit: ReactElement<{ error?: string }> | undefined;
    Children.forEach(node, (child) => {
      if (hit !== undefined || !isValidElement<{ children?: ReactNode; error?: string }>(child)) return;
      if (typeof child.type === "function" && child.type.name === "AuthToast") hit = child;
      else hit = find(child.props.children);
    });
    return hit;
  })(page);
  expect(toast?.props.error).toBe("Your sign-in method isn't available here. Ask your administrator.");
});
