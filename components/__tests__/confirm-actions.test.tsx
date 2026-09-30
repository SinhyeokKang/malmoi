// @vitest-environment jsdom
import { act, createRef } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **확인 동작의 형** (ux-drift-unify T22 — DESIGN §6.4 · §2.4 동작 규칙).
 * - 확정 버튼은 **동사+목적어**다(3-Y10) — 맨 동사("Remove"·"Disconnect")는 트리거에만 허용한다.
 * - **확정이 `danger`면 트리거도 `danger`다**(3-Y2 · 🔴 L) — 되돌릴 수 없다는 신호가 창을 열기 전에 서야 한다. Sync만 예외다.
 * - 1024 모달의 바닥은 닫기뿐이면 "Close", 입력 폼이면 Cancel을 든다(3-Y6).
 * variant는 클래스 문자열로 단언한다 — `Button`이 variant를 속성으로 내지 않고, `danger`만 `text-destructive`를 든다.
 */
const mocks = vi.hoisted(() => ({
  changeMember: vi.fn(), revokeInvitation: vi.fn(), resendInvitation: vi.fn(), createInvitations: vi.fn(), rotatePushToken: vi.fn(),
  disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn(), unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(),
  issue: vi.fn(), revoke: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({
  changeMember: mocks.changeMember, revokeInvitation: mocks.revokeInvitation, resendInvitation: mocks.resendInvitation, createInvitations: mocks.createInvitations,
  rotatePushToken: mocks.rotatePushToken, disconnectGithub: mocks.disconnectGithub, startGithubConnectForUser: mocks.startGithubConnectForUser,
}));
vi.mock("@/app/(edit)/account/actions", () => ({ unlinkLoginMethod: mocks.unlinkLoginMethod, startLoginMethodConnect: mocks.startLoginMethodConnect }));
vi.mock("@/app/(edit)/mcp/actions", () => ({ issueApiToken: mocks.issue, revokeApiToken: mocks.revoke }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: mocks.refresh }) }));

import { GithubSection } from "@/components/account/github-section";
import { LoginMethods } from "@/components/account/login-methods";
import { TokenCard } from "@/components/mcp/token-card";
import { InviteModal } from "@/components/members/invite-modal";
import { MemberList } from "@/components/members/member-list";
import { CiCard } from "@/components/settings/ci-card";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import type { MemberView } from "@/lib/auth/query";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

beforeEach(() => { vi.clearAllMocks(); });

async function click(node: Element) { await act(async () => { await userEvent.setup().click(node); }); }
const buttons = (root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>("button")];
const byText = (label: string, root: ParentNode = document) => {
  const node = buttons(root).filter((b) => b.textContent?.trim() === label).at(-1);
  if (!node) throw new Error(`no button ${label}`);
  return node;
};
const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const danger = (node: Element) => node.className.includes("text-destructive");

const now = new Date("2026-09-17T00:00:00Z");
const owner: MemberView = { userId: "u1", name: "Owner", emailLabel: "o***@example.com", image: null, readable: true, role: "OWNER", joinedAt: now };
const alice: MemberView = { userId: "u2", name: "Alice", emailLabel: "a***@example.com", image: null, readable: true, role: "EDITOR", joinedAt: now };

describe("확정 = 동사+목적어 (3-Y10)", () => {
  it("멤버 제거 — 트리거는 Remove, 확정은 Remove member", async () => {
    await render(<MemberList slug="acme" members={[owner, alice]} role="OWNER" viewerId="u1" now={now} headingId="h" />);
    await click(byLabel(m.members.removeLabel("Alice")));
    expect(byText(m.members.removeConfirm, dialog()).textContent).toBe("Remove member");
    expect(buttons(dialog()).map((b) => b.textContent?.trim())).not.toContain(m.members.remove);
  });

  it("GitHub App 연결 해제 — 확정이 대상을 든다", async () => {
    await render(<GithubSection account={{ status: "ok", login: "octo" }} installedRepoCount={1} settingsUrl={null} />);
    await click(byLabel(m.settings.account.disconnectLabel));
    expect(danger(byText(m.settings.account.disconnectConfirm, dialog()))).toBe(true);
    expect(buttons(dialog()).map((b) => b.textContent?.trim())).not.toContain(m.settings.account.disconnect);
  });

  it("로그인 수단 해제 — 확정이 대상을 든다", async () => {
    await render(<LoginMethods rows={[{ provider: "github", connected: true }, { provider: "google", connected: true }]} />);
    await click(byLabel(m.link.methods.disconnectLabel("Google")));
    expect(danger(byText(m.link.methods.disconnectConfirm, dialog()))).toBe(true);
    expect(buttons(dialog()).map((b) => b.textContent?.trim())).not.toContain(m.link.methods.disconnect);
  });
});

describe("확정이 danger면 트리거도 danger (3-Y2 · 🔴 L)", () => {
  it("push 토큰 Rotate token 트리거가 danger다", async () => {
    await render(<PushTokenPanel slug="acme" />);
    const trigger = byText(m.settings.token.rotate);
    expect(danger(trigger)).toBe(true);
    await click(trigger);
    expect(danger(byText(m.settings.token.confirmAction, dialog()))).toBe(true);
  });

  it("MCP 토큰 회전 — 트리거는 Rotate token · danger, 모달 확정도 danger다(생성 확정은 primary)", async () => {
    await render(<TokenCard token={{ state: "active", grants: [], scope: { kind: "all" }, createdAt: "2026-09-28T00:00:00.000Z", lastUsedAt: null, expiresAt: "2026-12-27T12:00:00.000Z" }} projects={[]} now="2026-09-28T12:00:00.000Z" />);
    const trigger = document.querySelector<HTMLButtonElement>('[data-token-action="rotate"]')!;
    expect(trigger.textContent).toBe("Rotate token");
    expect(danger(trigger)).toBe(true);
    await click(trigger);
    expect(danger(byText(m.mcpConnector.form.rotateConfirm))).toBe(true);
  });

  it("MCP 토큰 생성 확정은 primary 그대로다", async () => {
    await render(<TokenCard token={{ state: "none" }} projects={[]} now="2026-09-28T12:00:00.000Z" />);
    await click(document.querySelector('[data-token-action="create"]')!);
    expect(danger(byText(m.mcpConnector.form.create))).toBe(false);
  });
});

describe("1024 모달 바닥 (3-Y6)", () => {
  it("CI 워크플로 모달은 Close 하나로 닫힌다", async () => {
    await render(<CiCard slug="acme" archived={false} stale={[]}><p>yaml</p></CiCard>);
    await click(buttons().find((b) => b.textContent?.includes(m.settings.ci.workflow))!);
    expect(buttons().map((b) => b.textContent?.trim())).toContain(m.common.close);
    expect(buttons().map((b) => b.textContent?.trim())).not.toContain(m.common.dismiss);
  });

  it("초대 모달은 Cancel이 있고 누르면 닫는다", async () => {
    const onClose = vi.fn();
    await render(<InviteModal slug="acme" open onClose={onClose} seats={{ n: 1, limit: 10 }} returnFocusRef={createRef<HTMLButtonElement>()} />);
    await click(byText(m.common.cancel));
    expect(onClose).toHaveBeenCalled();
  });
});

it("CI 워크플로 행은 누를 수 있는 행이라 hover 면이 있다 (4-Y12)", async () => {
  const { container } = await render(<CiCard slug="acme" archived={false} stale={[]}><p>yaml</p></CiCard>);
  const row = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(m.settings.ci.workflow))!;
  expect(row.className).toContain("hover:bg-foreground/[0.02]");
});
