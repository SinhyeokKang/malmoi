// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **누른 컨트롤이 꺼지거나 사라진 뒤 포커스가 `body`로 빠지지 않는다** (audit #32·#32b).
 *
 * ⚠️ **두 형이다.** Dialog 트리거는 닫힐 때 Radix가 포커스를 돌려주는 대상이라 **진행 중에도 포커스를 받아야** 한다 —
 * `busy`(`aria-disabled` + 스피너)다. 폼의 [Save]는 저장 중 `loading`(진짜 `disabled`)이 규칙이라(DESIGN §6.6) 끝난 뒤
 * **착지**한다: 버튼이 다시 켜졌으면 버튼, 저장할 것이 없어 꺼진 채면 방금 고친 필드다.
 *
 * ⚠️ **jsdom에는 focus fixup이 없다** (POSTMORTEM 2026-09-20) — 포커스된 버튼이 `disabled`가 되면 브라우저는
 * `activeElement`를 `body`로 돌리지만 jsdom은 그대로 둔다. 그 규칙을 흉내 내지 않으면 "클릭이 남긴 포커스"를 잰다.
 */
const mocks = vi.hoisted(() => ({
  updateProjectName: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn(), updateRepositorySettings: vi.fn(), connectRepository: vi.fn(),
  listRepoBranches: vi.fn(), rotatePushToken: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn(),
  changeMember: vi.fn(), revokeInvitation: vi.fn(), resendInvitation: vi.fn(), disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn(),
  unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(), updateProfileName: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({
  updateProjectName: mocks.updateProjectName, uploadProjectImage: mocks.uploadProjectImage, deleteProjectImage: mocks.deleteProjectImage,
  updateRepositorySettings: mocks.updateRepositorySettings, connectRepository: mocks.connectRepository,
}));
vi.mock("@/app/(edit)/projects/actions", () => ({
  listRepoBranches: mocks.listRepoBranches, rotatePushToken: mocks.rotatePushToken, archiveProject: mocks.archiveProject, unarchiveProject: mocks.unarchiveProject,
  changeMember: mocks.changeMember, revokeInvitation: mocks.revokeInvitation, resendInvitation: mocks.resendInvitation,
  disconnectGithub: mocks.disconnectGithub, startGithubConnectForUser: mocks.startGithubConnectForUser,
}));
vi.mock("@/app/(edit)/account/actions", () => ({ unlinkLoginMethod: mocks.unlinkLoginMethod, startLoginMethodConnect: mocks.startLoginMethodConnect, updateProfileName: mocks.updateProfileName }));

import { GithubSection } from "@/components/account/github-section";
import { LoginMethods } from "@/components/account/login-methods";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { ArchiveCard } from "@/components/settings/archive-card";
import { GeneralCard } from "@/components/settings/general-card";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import { RepositoryForm } from "@/components/settings/repository-form";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";

import { input } from "./helpers/dom";

let fixup: MutationObserver | undefined;
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => { fixup?.disconnect(); });

/** 응답을 손으로 푼다 — 즉시 풀리면 `disabled`가 켜졌다 꺼지는 사이에 fixup이 돌 틈이 없다. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve: async (value: T) => { await act(async () => { resolve(value); }); } };
}
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
const byText = (label: string) => {
  const node = buttons().filter(b => b.textContent?.trim() === label).at(-1);
  if (!node) throw new Error(`no button ${label}`);
  return node;
};
const byLabel = (label: string) => {
  const node = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!node) throw new Error(`no ${label}`);
  return node;
};
async function click(node: HTMLElement) { await act(async () => { await userEvent.setup().click(node); }); }

describe("폼 [Save] — 끝난 뒤 착지 (#32)", () => {
  it("General 이름 저장이 성공하면 꺼진 Save 대신 이름 필드로, 실패하면 다시 켜진 Save로", async () => {
    const ok = deferred<{ ok: true; name: string }>();
    mocks.updateProjectName.mockReturnValueOnce(ok.promise);
    const { container } = await render(<GeneralCard slug="acme" name="Acme" image={null} archived={false} />);
    const name = container.querySelector<HTMLInputElement>("#project-name")!;
    await input(name, "Renamed");
    await click(byText(m.settings.repository.fields.save));
    await ok.resolve({ ok: true, name: "Renamed" });
    expect(document.activeElement).toBe(name);

    const failed = deferred<{ ok: false; error: string }>();
    mocks.updateProjectName.mockReturnValueOnce(failed.promise);
    await input(name, "Again");
    await click(byText(m.settings.repository.fields.save));
    await failed.resolve({ ok: false, error: "unavailable" });
    expect(document.activeElement).toBe(byText(m.settings.repository.fields.save));
  });

  it("Base branch 저장이 성공하면 브랜치 필드로 돌아온다", async () => {
    mocks.listRepoBranches.mockResolvedValue({ ok: true, names: ["main", "dev"], defaultBranch: "main", truncated: false });
    const ok = deferred<{ ok: true }>();
    mocks.updateRepositorySettings.mockReturnValue(ok.promise);
    const { container } = await render(<RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" />);
    await click(container.querySelector<HTMLElement>('[role="combobox"]')!);
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find(n => n.textContent === "dev")!);
    await click(byText(m.settings.repository.fields.save));
    await ok.resolve({ ok: true });
    expect(document.activeElement?.id).toBe("base-branch");
  });
});

describe("Dialog 트리거 — 진행 중에도 포커스를 지킨다 (#32·#32b)", () => {
  it("토큰 회전 뒤 포커스가 Rotate 트리거에 남는다 — 진행 중엔 aria-disabled", async () => {
    const response = deferred<{ ok: true; pushToken: string }>();
    mocks.rotatePushToken.mockReturnValue(response.promise);
    await render(<PushTokenPanel slug="acme" />);
    await click(byText(m.settings.token.rotate));
    await click(byText(m.settings.token.confirmAction));
    const trigger = byText(m.settings.token.rotate);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    await response.resolve({ ok: true, pushToken: "tok" });
    expect(document.activeElement).toBe(byText(m.settings.token.rotate));
  });

  it("보관이 성공해 카드가 [Restore project]로 바뀌면 그 버튼으로 착지한다", async () => {
    const response = deferred<{ ok: true }>();
    mocks.archiveProject.mockReturnValue(response.promise);
    const view = await render(<ArchiveCard slug="acme" name="Acme" archived={false} openPrUrl={Promise.resolve(null)} />);
    await click(byText(m.archive.action));
    await click(byText(m.archive.action));
    // 서버 revalidate가 같은 커밋에 보관 상태를 싣는다.
    await act(async () => { response.resolve({ ok: true }); await view.rerender(<ArchiveCard slug="acme" name="Acme" archived />); });
    expect(document.activeElement).toBe(byText(m.archive.restore));
  });

  it("초대 철회를 기다리는 동안 포커스가 그 행의 Revoke에 있다", async () => {
    const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };
    const response = deferred<{ ok: false; error: string }>();
    mocks.revokeInvitation.mockReturnValue(response.promise);
    await render(<PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={new Date("2026-09-17T00:00:00Z")} headingId="pending-heading" />);
    await click(byLabel(m.members.pending.revokeLabel("t***@example.com")));
    await click(byText(m.members.pending.confirmRevokeAction));
    expect(document.activeElement).toBe(byLabel(m.members.pending.revokeLabel("t***@example.com")));
    await response.resolve({ ok: false, error: "unavailable" });
  });

  it("역할 변경을 확정하면 그 행의 역할 셀렉트로 돌아온다 — 트리거 없는 Dialog다", async () => {
    const now = new Date("2026-09-17T00:00:00Z");
    const members: MemberView[] = [
      { userId: "u1", name: "Owner", emailLabel: "o***@example.com", readable: true, role: "OWNER", joinedAt: now },
      { userId: "u2", name: "Alice", emailLabel: "a***@example.com", readable: true, role: "EDITOR", joinedAt: now },
    ];
    const response = deferred<{ ok: true }>();
    mocks.changeMember.mockReturnValue(response.promise);
    await render(<MemberList slug="acme" members={members} role="OWNER" viewerId="u1" now={now} headingId="members-heading" />);
    const select = document.getElementById("role-u2")!;
    await click(select);
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find(n => n.textContent === m.projects.role.OWNER)!);
    await click(byText(m.members.confirmRoleAction));
    expect(document.activeElement).toBe(document.getElementById("role-u2"));
    await response.resolve({ ok: true });
    expect(document.activeElement).toBe(document.getElementById("role-u2"));
  });
});

describe("해제 뒤 행이 바뀌면 그 행의 새 컨트롤로 (#32)", () => {
  it("로그인 수단을 해제하면 같은 행의 [Connect]로 착지한다", async () => {
    const response = deferred<void>();
    mocks.unlinkLoginMethod.mockReturnValue(response.promise);
    const both = [{ provider: "github" as const, connected: true }, { provider: "google" as const, connected: true }];
    const view = await render(<LoginMethods rows={both} />);
    await click(byLabel(m.link.methods.disconnectLabel("Google")));
    await click(byText(m.link.methods.disconnect));
    // `redirect`가 싣는 새 행은 transition이 끝나는 커밋에 함께 온다 — 행이 먼저 바뀌고 pending이 그 뒤에 풀린다.
    await view.rerender(<LoginMethods rows={[both[0]!, { provider: "google", connected: false }]} />);
    await response.resolve();
    expect(document.activeElement).toBe(byLabel(m.link.methods.connectLabel("Google")));
  });

  it("GitHub 연결을 해제하면 같은 행의 연결 버튼으로 착지한다", async () => {
    const response = deferred<{ ok: true }>();
    mocks.disconnectGithub.mockReturnValue(response.promise);
    const view = await render(<GithubSection account={{ status: "ok", login: "octo" }} installedRepoCount={1} settingsUrl={null} />);
    await click(byLabel(m.settings.account.disconnectLabel));
    await click(byText(m.settings.account.disconnect));
    await act(async () => {
      response.resolve({ ok: true });
      await view.rerender(<GithubSection account={{ status: "ok", login: null }} installedRepoCount={null} settingsUrl={null} />);
    });
    expect(document.activeElement?.textContent).toBe(m.settings.account.connect);
  });
});
