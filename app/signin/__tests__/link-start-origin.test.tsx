import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ set: vi.fn(), signIn: vi.fn(), host: "localhost:3000" }));
vi.mock("@/auth", () => ({ signIn: s.signIn }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: s.set, get: () => undefined }),
  headers: async () => new Headers({ host: s.host, "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/login-link/view", () => ({
  loadChallengeView: async () => ({ emailLabel: "a***@example.com", have: "github", pending: "google", joined: new Date("2026-09-01"), dest: { kind: "projects" } }),
}));
import LinkAccountPage from "@/app/signin/link/[challenge]/page";

/**
 * **origin을 판정 못 하면 병합 확인을 시작하지 않는다** (launch-readiness L7.6, audit #48). 전엔 `origin?.secure ?? false`로
 * 비-secure 쿠키를 심고 시작했는데 콜백 쪽 폴백은 `?? https`라 state 쿠키 이름이 갈렸고, 증상은 원인과 먼 **"계정 병합 실패"**로
 * 나왔다(CLAUDE.md 2026-09-14 — `ALLOWED_HOSTS` 누락). 모르는 호스트에서 인증 쿠키를 심는 것 자체도 막을 이유다.
 */
function confirmButton(node: ReactNode): ReactElement | undefined {
  let found: ReactElement | undefined;
  Children.forEach(node, (child) => {
    if (found || !isValidElement<{ children?: ReactNode }>(child)) return;
    if (typeof child.type === "function" && child.type.name === "ProviderButton") found = child;
    else found = confirmButton(child.props.children);
  });
  return found;
}
async function start() {
  const page = await LinkAccountPage({ params: Promise.resolve({ challenge: "chal" }), searchParams: Promise.resolve({}) });
  const button = confirmButton(page)!;
  const form = Reflect.apply(button.type as Function, null, [button.props]) as ReactElement<{ action: () => Promise<void> }>;
  return form.props.action();
}
beforeEach(() => { s.set.mockClear(); s.signIn.mockClear(); });

it("허용 목록 밖 호스트면 쿠키를 심지 않고 Unavailable로 돌려보낸다", async () => {
  s.host = "evil.example.com";
  await expect(start()).rejects.toThrow("REDIRECT:/signin?error=Unavailable");
  expect(s.signIn).not.toHaveBeenCalled();
  expect(s.set).not.toHaveBeenCalledWith(expect.stringContaining("malmoi-login-link"), "chal", expect.anything());
});

it("정상 origin이면 secure 쿠키로 시작한다 (짝)", async () => {
  s.host = "mal-moi.com";
  await start();
  expect(s.set).toHaveBeenCalledWith("__Host-malmoi-login-link", "chal", expect.objectContaining({ secure: true }));
  expect(s.signIn).toHaveBeenCalledTimes(1);
});
