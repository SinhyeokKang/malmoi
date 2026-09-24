// @vitest-environment jsdom
import { act, Component, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **Server Action이 던져도 화면이 제자리로 돌아오고 사유를 말한다** (audit #24). 네 호출부가 `await`를 try 없이 불러,
 * 통신이 끊기면 transition 안의 예외가 error boundary로 올라가 **화면이 통째로 오류 화면**이 됐다 — 입력 중이던 다른
 * 카드까지 함께. 거부(`{ ok: false }`)는 이미 값으로 다뤘으므로 throw만 같은 자리로 접는다.
 */
const mocks = vi.hoisted(() => ({
  changeMember: vi.fn(), revokeInvitation: vi.fn(), disconnectGithub: vi.fn(), connectRepository: vi.fn(),
  rotatePushToken: vi.fn(), startGithubConnectForUser: vi.fn(), startGithubConnect: vi.fn(),
  addSurfaces: vi.fn(), confirmManualFormat: vi.fn(), detectRepoFormats: vi.fn(), loadCandidateSample: vi.fn(),
  updateProfileName: vi.fn(), uploadProfileImage: vi.fn(), deleteProfileImage: vi.fn(), unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(), startSessionRevocation: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({
  changeMember: mocks.changeMember, revokeInvitation: mocks.revokeInvitation, disconnectGithub: mocks.disconnectGithub,
  rotatePushToken: mocks.rotatePushToken, startGithubConnectForUser: mocks.startGithubConnectForUser,
  addSurfaces: mocks.addSurfaces, confirmManualFormat: mocks.confirmManualFormat, detectRepoFormats: mocks.detectRepoFormats, loadCandidateSample: mocks.loadCandidateSample,
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: mocks.connectRepository, startGithubConnect: mocks.startGithubConnect }));
vi.mock("@/app/(edit)/account/actions", () => ({
  updateProfileName: mocks.updateProfileName, uploadProfileImage: mocks.uploadProfileImage, deleteProfileImage: mocks.deleteProfileImage,
  unlinkLoginMethod: mocks.unlinkLoginMethod, startLoginMethodConnect: mocks.startLoginMethodConnect, startSessionRevocation: mocks.startSessionRevocation,
}));

import { LoginMethods } from "@/components/account/login-methods";
import { ProfileNameForm } from "@/components/account/profile-name-form";
import { ProfilePicture } from "@/components/account/profile-picture";
import { SessionsSection } from "@/components/account/sessions-section";
import { DisconnectGithubButton } from "@/components/github-account";
import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import { AddSourcesModal } from "@/components/sources/add-sources-modal";
import { failureText } from "@/components/onboarding/failure";
import { uploadRejectMessage } from "@/lib/upload/message";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { ReconnectButton } from "@/components/reconnect-button";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";

const now = new Date("2026-09-17T00:00:00Z");
const alice: MemberView = { userId: "u2", name: "Alice", emailLabel: "a***@example.com", readable: true, role: "EDITOR", joinedAt: now };
const owner: MemberView = { userId: "u1", name: "Owner", emailLabel: "o***@example.com", readable: true, role: "OWNER", joinedAt: now };
const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };

const byLabel = (label: string) => {
  const node = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!node) throw new Error(`Missing ${label}`);
  return node;
};
const inDialog = (text: string) => {
  const node = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find(b => b.textContent === text);
  if (!node) throw new Error(`Missing dialog button ${text}`);
  return node;
};
async function click(node: HTMLElement) { await act(async () => { await userEvent.setup().click(node); }); }
const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";

beforeEach(() => { vi.clearAllMocks(); });

it("멤버 제거 호출이 던지면 행이 풀리고 확인 불가를 말한다", async () => {
  mocks.changeMember.mockRejectedValue(new Error("offline"));
  await render(<MemberList slug="acme" members={[owner, alice]} role="OWNER" viewerId="u1" now={now} headingId="h" />);
  await click(byLabel("Remove Alice"));
  await click(inDialog("Remove"));
  expect(alert()).toContain(m.members.changeUnconfirmed);
  expect(byLabel("Remove Alice").hasAttribute("disabled")).toBe(false);
});

it("초대 철회 호출이 던지면 행이 풀리고 확인 불가를 말한다", async () => {
  mocks.revokeInvitation.mockRejectedValue(new Error("offline"));
  await render(<PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={now} headingId="h" />);
  await click(byLabel("Revoke invitation for t***@example.com"));
  await click(inDialog(m.members.pending.confirmRevokeAction));
  expect(alert()).toContain(m.members.pending.revokeUnconfirmed);
  expect(byLabel("Revoke invitation for t***@example.com").hasAttribute("disabled")).toBe(false);
});

it("GitHub 연결 해제 호출이 던지면 실패 문구를 세운다", async () => {
  mocks.disconnectGithub.mockRejectedValue(new Error("offline"));
  await render(<DisconnectGithubButton />);
  await click(byLabel(m.settings.account.disconnectLabel));
  await click(inDialog(m.settings.account.disconnect));
  expect(alert()).toContain(m.settings.account.disconnectFailed);
});

it("Reconnect 호출이 던지면 실패 문구를 세운다 — onFailure가 있으면 그쪽으로 보낸다", async () => {
  mocks.connectRepository.mockRejectedValue(new Error("offline"));
  await render(<ReconnectButton slug="acme" label="Reconnect" />);
  await click([...document.querySelectorAll("button")].find(b => b.textContent?.includes("Reconnect"))!);
  expect(alert()).toContain(m.settings.repository.connectFailed);

  const onFailure = vi.fn();
  await render(<ReconnectButton slug="acme" label="Reconnect again" onFailure={onFailure} />);
  await click([...document.querySelectorAll("button")].find(b => b.textContent?.includes("Reconnect again"))!);
  expect(onFailure).toHaveBeenLastCalledWith(m.settings.repository.connectFailed);
});

/**
 * **일곱 곳 더** (audit-ux #14) — 같은 형이다. ⚠️ **redirect로 끝나는 Action은 되던진다** — Next는 Action의 redirect를 그 promise의
 * reject로 알리고(`server-action-reducer`), 그것을 삼키면 이동 대신 실패 문구가 선다. `unstable_rethrow`가 그 갈래를 가른다.
 */
const offline = () => new Error("offline");
const buttonByText = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text)!;
const alerts = () => [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent ?? "").join(" ");

it("push 토큰 재발급이 던지면 확인 불가를 말한다 — 옛 토큰이 이미 죽었을 수 있다", async () => {
  mocks.rotatePushToken.mockRejectedValue(offline());
  await render(<PushTokenPanel slug="acme" />);
  await click(buttonByText(m.settings.token.rotate));
  await click(inDialog(m.settings.token.confirmAction));
  expect(alerts()).toContain(m.settings.token.unconfirmed);
});

it.each(["upload", "delete"] as const)("프로필 사진 %s 호출이 던지면 실패 문구를 세운다", async kind => {
  mocks.uploadProfileImage.mockRejectedValue(offline());
  mocks.deleteProfileImage.mockRejectedValue(offline());
  await render(<ProfilePicture hasPicture />);
  if (kind === "delete") await click(buttonByText(m.account.picture.delete));
  else await act(async () => { await userEvent.setup().upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([new Uint8Array(8)], "me.png", { type: "image/png" })); });
  expect(alerts()).toContain(uploadRejectMessage("unavailable"));
});

it("표시 이름 저장이 던지면 제자리에서 실패를 말하고 입력을 지킨다", async () => {
  mocks.updateProfileName.mockRejectedValue(offline());
  await render(<ProfileNameForm name="Jane" inputId="name" />);
  await click(buttonByText(m.account.profile.save));
  expect(alerts()).toContain(m.account.profile.errors.unavailable);
  expect(document.querySelector<HTMLInputElement>("#name")?.value).toBe("Jane");
});

it("GitHub 계정 연결 시작이 던지면 실패 문구를 세운다", async () => {
  mocks.startGithubConnectForUser.mockRejectedValue(offline());
  await render(<ConnectGithubButton dest="account" label="Connect GitHub" />);
  await click(buttonByText("Connect GitHub"));
  expect(alerts()).toContain(m.settings.repository.connectFailed);
});

it("Add sources의 GitHub 재연결이 던지면 모달 안에서 말한다", async () => {
  mocks.detectRepoFormats.mockResolvedValue({ ok: false, error: "reauthorize" });
  mocks.startGithubConnect.mockRejectedValue(offline());
  await render(<AddSourcesModal open onClose={vi.fn()} onAdded={vi.fn()} returnFocusRef={{ current: null }} slug="acme" owner="o" repo="r" branch="main" existing={[]} adapters={[]} />);
  await click(buttonByText(m.newProject.empty.connect.reauthorize));
  expect(alerts()).toContain(failureText("unavailable"));
});

const methods = [{ provider: "github" as const, connected: true }, { provider: "google" as const, connected: true }];
it("로그인 수단 해제가 던지면 카드 머리에 확인 불가를 말한다", async () => {
  mocks.unlinkLoginMethod.mockRejectedValue(offline());
  await render(<LoginMethods rows={methods} />);
  await click(byLabel(m.link.methods.disconnectLabel("GitHub")));
  await click(inDialog(m.link.methods.disconnect));
  expect(alerts()).toContain(m.link.methods.unlinkUnconfirmed);
});

it("모든 세션 로그아웃 시작이 던지면 구역 실패 문구를 세운다", async () => {
  mocks.startSessionRevocation.mockRejectedValue(offline());
  await render(<SessionsSection outcome={undefined} signOut={vi.fn()} confirmProvider={null} />);
  await click(buttonByText(m.account.sessions.title));
  await click(inDialog(m.account.sessions.button));
  expect(alerts()).toContain(m.account.sessions.failed);
});

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error === null ? this.props.children : <p data-caught>{String((this.state.error as { digest?: string }).digest)}</p>; }
}
it("redirect는 삼키지 않는다 — 해제 성공의 redirect가 실패 문구가 되지 않는다 (짝: 위의 확인 불가)", async () => {
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/account?link=disconnected;307;" });
  mocks.unlinkLoginMethod.mockRejectedValue(redirect);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<Boundary><LoginMethods rows={methods} /></Boundary>);
  await click(byLabel(m.link.methods.disconnectLabel("GitHub")));
  await click(inDialog(m.link.methods.disconnect));
  error.mockRestore();
  expect(alerts()).not.toContain(m.link.methods.unlinkUnconfirmed);
  expect(document.querySelector("[data-caught]")?.textContent).toContain("NEXT_REDIRECT");
});
