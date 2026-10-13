import { expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
const state = vi.hoisted(() => ({ factory: undefined as (() => Promise<NextAuthConfig>) | undefined, findUnique: vi.fn(), transaction: vi.fn() }));
vi.mock("next-auth", () => ({ default: (factory: () => Promise<NextAuthConfig>) => { state.factory = factory; return {}; } }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ account: { findUnique: state.findUnique }, $transaction: state.transaction }) }));
await import("@/auth");
const { gitlabProfile } = await import("@/lib/auth/profile");
it("production signIn callback distinguishes storage outages from unverified email", async () => {
  const callback = (await state.factory!()).callbacks!.signIn!;
  const input = { user: { id: "u1", email: "old@example.com" }, account: { provider: "github", providerAccountId: "gh1", type: "oauth" as const }, profile: { email: "fresh@example.com" } };
  state.findUnique.mockRejectedValue(new Error("Prisma private data"));
  expect(await callback(input)).toBe("/signin?error=Unavailable");
  expect(await callback({ ...input, user: { ...input.user, email: "" } })).toBe(false);
  state.findUnique.mockResolvedValue({ userId: "u1" });
  state.transaction.mockRejectedValue({ code: "P2002", message: "private collision" });
  expect(await callback(input)).toBe(true);
});

it("production providers require both state and PKCE", async () => {
  const config = await state.factory!();
  expect(config.providers).toHaveLength(2);
  for (const provider of config.providers) expect(provider).toMatchObject({ options: { checks: ["pkce", "state"] } });
});

/**
 * ⚠️ **GitLab을 켜고 먼저 목록에 있음을 단언한다** — 위 루프는 켜진 provider만 돌아서, 테스트 기본 env에 GitLab 쌍이 없으면
 * GitLab에 대해 공허하게 통과한다(POSTMORTEM 2026-09-07 계열). 기본형은 pkce만 건다(`@auth/core/providers.js`) — state는 우리가 명시한다.
 */
it("production GitLab provider requires both state and PKCE and replaces the default profile", async () => {
  vi.stubEnv("AUTH_GITLAB_ID", "test-AUTH_GITLAB_ID");
  vi.stubEnv("AUTH_GITLAB_SECRET", "test-AUTH_GITLAB_SECRET");
  try {
    const config = await state.factory!();
    const ids = config.providers.map((provider) => (provider as { id: string }).id);
    expect(ids).toEqual(["github", "gitlab", "google"]);
    const gitlab = config.providers.find((provider) => (provider as { id: string }).id === "gitlab") as { options: { checks: unknown; profile: unknown } };
    expect(gitlab.options.checks).toEqual(["pkce", "state"]);
    expect(gitlab.options.profile).toBe(gitlabProfile);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("production providers omit GitLab when its pair is absent", async () => {
  vi.stubEnv("AUTH_GITLAB_ID", "");
  vi.stubEnv("AUTH_GITLAB_SECRET", "");
  try {
    const ids = (await state.factory!()).providers.map((provider) => (provider as { id: string }).id);
    expect(ids).not.toContain("gitlab");
  } finally {
    vi.unstubAllEnvs();
  }
});

it("production signIn stops a revocation flow before email refresh even without a nonce", async () => {
  const { NextRequest } = await import("next/server");
  const { withRevocation } = await import("@/lib/session-revocation/http");
  const callback = (await state.factory!()).callbacks!.signIn!;
  state.findUnique.mockClear();
  const request = new NextRequest("http://localhost/api/auth/callback/github?state=s", { headers: { cookie: "authjs.callback-url=http%3A%2F%2Flocalhost%2Faccount%3FsessionRevocation%3Dexpired" } });
  await withRevocation(request, async () => {
    const destination = await callback({ user: { id: "u1", email: "old@example.com" }, account: { provider: "github", providerAccountId: "gh1", type: "oauth" }, profile: { email: "fresh@example.com" } });
    expect(destination).toBe("/account?sessionRevocation=invalid");
    return new Response(null);
  });
  expect(state.findUnique).not.toHaveBeenCalled();
});

/**
 * **바깥 경계도 한 줄 남긴다** (launch-readiness L5.1). 전에는 이 catch가 무로그라, 안쪽에서 일부러 던진 `CredentialError`
 * (찍지 않는 갈래)로 끝나면 "Unavailable"에 로그 0줄이었다. 원문은 어디에도 없다.
 */
it("production signIn logs the stage for a storage outage without the raw message", async () => {
  const callback = (await state.factory!()).callbacks!.signIn!;
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  state.findUnique.mockRejectedValue(new Error("Prisma private data"));
  expect(await callback({ user: { id: "u1", email: "old@example.com" }, account: { provider: "github", providerAccountId: "gh1", type: "oauth" }, profile: { email: "fresh@example.com" } })).toBe("/signin?error=Unavailable");
  const lines = spy.mock.calls.map((call) => String(call[0]));
  expect(lines.some((line) => /\[credentials\] \w{8} sign-in: CredentialError$/.test(line))).toBe(true);
  expect(lines.join("\n")).not.toContain("Prisma private data");
  spy.mockRestore();
});
