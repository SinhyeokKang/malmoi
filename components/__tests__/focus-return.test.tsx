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
  listProjectBranches: vi.fn(), rotatePushToken: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn(),
  changeMember: vi.fn(), revokeInvitation: vi.fn(), resendInvitation: vi.fn(), disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn(),
  unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(), updateProfileName: vi.fn(), startSessionRevocation: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({
  updateProjectName: mocks.updateProjectName, uploadProjectImage: mocks.uploadProjectImage, deleteProjectImage: mocks.deleteProjectImage,
  updateRepositorySettings: mocks.updateRepositorySettings, connectRepository: mocks.connectRepository,
}));
vi.mock("@/app/(edit)/projects/actions", () => ({
  listProjectBranches: mocks.listProjectBranches, rotatePushToken: mocks.rotatePushToken, archiveProject: mocks.archiveProject, unarchiveProject: mocks.unarchiveProject,
  changeMember: mocks.changeMember, revokeInvitation: mocks.revokeInvitation, resendInvitation: mocks.resendInvitation,
  disconnectGithub: mocks.disconnectGithub, startGithubConnectForUser: mocks.startGithubConnectForUser,
}));
// 번역 단일 판 그물(아래) — 작업 화면이 무는 Action. 라우터는 그 describe가 `doMock`으로 든다(앱 LNB 서랍 그물의 `doUnmock`이 파일 단위 mock을 걷는다).
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/account/actions", () => ({
  unlinkLoginMethod: mocks.unlinkLoginMethod, startLoginMethodConnect: mocks.startLoginMethodConnect, updateProfileName: mocks.updateProfileName,
  startSessionRevocation: mocks.startSessionRevocation,
}));

import { GithubSection } from "@/components/account/github-section";
import { LoginMethods } from "@/components/account/login-methods";
import { SessionsSection } from "@/components/account/sessions-section";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { ArchiveCard } from "@/components/settings/archive-card";
import { GeneralCard } from "@/components/settings/general-card";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import { RepositoryForm } from "@/components/settings/repository-form";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import { en } from "@/messages/en";

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
    await click(byText(en.settings.repository.fields.save));
    await ok.resolve({ ok: true, name: "Renamed" });
    expect(document.activeElement).toBe(name);

    const failed = deferred<{ ok: false; error: string }>();
    mocks.updateProjectName.mockReturnValueOnce(failed.promise);
    await input(name, "Again");
    await click(byText(en.settings.repository.fields.save));
    await failed.resolve({ ok: false, error: "unavailable" });
    expect(document.activeElement).toBe(byText(en.settings.repository.fields.save));
  });

  it("Base branch 저장이 성공하면 브랜치 필드로 돌아온다", async () => {
    mocks.listProjectBranches.mockResolvedValue({ ok: true, names: ["main", "dev"], defaultBranch: "main", truncated: false });
    const ok = deferred<{ ok: true }>();
    mocks.updateRepositorySettings.mockReturnValue(ok.promise);
    const { container } = await render(<RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" />);
    await click(container.querySelector<HTMLElement>('[role="combobox"]')!);
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find(n => n.textContent === "dev")!);
    await click(byText(en.settings.repository.fields.save));
    await ok.resolve({ ok: true });
    expect(document.activeElement?.id).toBe("base-branch");
  });
});

describe("Dialog 트리거 — 진행 중에도 포커스를 지킨다 (#32·#32b)", () => {
  it("토큰 회전 뒤 포커스가 Rotate 트리거에 남는다 — 진행 중엔 aria-disabled", async () => {
    const response = deferred<{ ok: true; pushToken: string }>();
    mocks.rotatePushToken.mockReturnValue(response.promise);
    await render(<PushTokenPanel slug="acme" />);
    await click(byText(en.settings.token.rotate));
    await click(byText(en.settings.token.confirmAction));
    const trigger = byText(en.settings.token.rotate);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    await response.resolve({ ok: true, pushToken: "tok" });
    expect(document.activeElement).toBe(byText(en.settings.token.rotate));
  });

  /**
   * **모든 기기 로그아웃도 절차 (a)다** (ux-drift-unify 3-Y3 · 3-⚪17) — 확정하면 Dialog가 닫히고 트리거가 `busy`로 포커스를 지킨다.
   * 전엔 트리거가 진짜 `disabled`라 닫힐 때 포커스가 `body`로 빠질 수 있었다. ⚠️ **두 번째 challenge를 막는 것도 트리거다** —
   * `busy`가 클릭을 막아 진행 중에 Dialog를 다시 열 수 없다(옛 근거: 확정을 두 번 누르면 첫 challenge가 지워진다).
   */
  it("모든 기기 로그아웃 확정 뒤 포커스가 트리거에 남고, 진행 중엔 Dialog가 다시 열리지 않는다", async () => {
    const response = deferred<void>();
    mocks.startSessionRevocation.mockReturnValue(response.promise);
    await render(<SessionsSection outcome={undefined} signOut={() => {}} confirmProvider="github" />);
    await click(byText(en.account.sessions.title));
    await click(byText(en.account.sessions.confirmAction("GitHub")));
    const trigger = byText(en.account.sessions.title);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    await click(trigger);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.startSessionRevocation).toHaveBeenCalledTimes(1);
    // 돌아왔다는 것 자체가 실패다(성공은 provider로 redirect) — 사유가 Dialog 밖 구역에 서고 트리거가 다시 켜진다.
    await response.resolve();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(en.account.sessions.failed);
    expect(byText(en.account.sessions.title).getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(byText(en.account.sessions.title));
  });

  it("보관이 성공해 카드가 [Restore project]로 바뀌면 그 버튼으로 착지한다", async () => {
    const response = deferred<{ ok: true }>();
    mocks.archiveProject.mockReturnValue(response.promise);
    const view = await render(<ArchiveCard slug="acme" name="Acme" archived={false} openPrUrl={Promise.resolve(null)} />);
    await click(byText(en.archive.action));
    await click(byText(en.archive.action));
    // 서버 revalidate가 같은 커밋에 보관 상태를 싣는다.
    await act(async () => { response.resolve({ ok: true }); await view.rerender(<ArchiveCard slug="acme" name="Acme" archived />); });
    expect(document.activeElement).toBe(byText(en.archive.restore));
  });

  it("초대 철회를 기다리는 동안 포커스가 그 행의 Revoke에 있다", async () => {
    const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };
    const response = deferred<{ ok: false; error: string }>();
    mocks.revokeInvitation.mockReturnValue(response.promise);
    await render(<PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={new Date("2026-09-17T00:00:00Z")} headingId="pending-heading" />);
    await click(byLabel(en.members.pending.revokeLabel("t***@example.com")));
    await click(byText(en.members.pending.confirmRevokeAction));
    expect(document.activeElement).toBe(byLabel(en.members.pending.revokeLabel("t***@example.com")));
    await response.resolve({ ok: false, error: "unavailable" });
  });

  it("역할 변경을 확정하면 그 행의 역할 셀렉트로 돌아온다 — 트리거 없는 Dialog다", async () => {
    const now = new Date("2026-09-17T00:00:00Z");
    const members: MemberView[] = [
      { userId: "u1", name: "Owner", emailLabel: "o***@example.com", image: null, readable: true, role: "OWNER", joinedAt: now },
      { userId: "u2", name: "Alice", emailLabel: "a***@example.com", image: null, readable: true, role: "EDITOR", joinedAt: now },
    ];
    const response = deferred<{ ok: true }>();
    mocks.changeMember.mockReturnValue(response.promise);
    await render(<MemberList slug="acme" members={members} role="OWNER" viewerId="u1" now={now} headingId="members-heading" />);
    const select = document.getElementById("role-u2")!;
    await click(select);
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find(n => n.textContent === en.projects.role.OWNER)!);
    await click(byText(en.members.confirmRoleAction));
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
    await click(byLabel(en.link.methods.disconnectLabel("Google")));
    await click(byText(en.link.methods.disconnectConfirm));
    // `redirect`가 싣는 새 행은 transition이 끝나는 커밋에 함께 온다 — 행이 먼저 바뀌고 pending이 그 뒤에 풀린다.
    await view.rerender(<LoginMethods rows={[both[0]!, { provider: "google", connected: false }]} />);
    await response.resolve();
    expect(document.activeElement).toBe(byLabel(en.link.methods.connectLabel("Google")));
  });

  it("GitHub 연결을 해제하면 같은 행의 연결 버튼으로 착지한다", async () => {
    const response = deferred<{ ok: true }>();
    mocks.disconnectGithub.mockReturnValue(response.promise);
    const view = await render(<GithubSection account={{ status: "ok", login: "octo" }} installedRepoCount={1} settingsUrl={null} />);
    await click(byLabel(en.settings.account.disconnectLabel));
    await click(byText(en.settings.account.disconnectConfirm));
    await act(async () => {
      response.resolve({ ok: true });
      await view.rerender(<GithubSection account={{ status: "ok", login: null }} installedRepoCount={null} settingsUrl={null} />);
    });
    expect(document.activeElement?.textContent).toBe(en.settings.account.connect);
  });
});

it("actual GitHub unavailable omits actions box; connected retains contents ref and disconnect focus landing", async () => {
  const view = await render(<GithubSection account={{status: "unavailable"}} installedRepoCount={null} settingsUrl={null} />);
  const row = () => view.container.querySelector("li")!;
  expect(row().children).toHaveLength(2);
  expect(row().querySelector(".contents")).toBeNull();
  expect(row().querySelector("button, a")).toBeNull();
  await view.rerender(<GithubSection account={{status: "ok", login: "octo"}} installedRepoCount={2} settingsUrl="https://github.com/settings/installations" />);
  expect(row().children).toHaveLength(3);
  // `stackActions`(responsive-app)가 좁은 카드에서 둘째 줄 오른쪽으로 내리는 클래스를 더한다 — 상자·`contents` 래퍼 구조는 그대로다.
  expect(row().lastElementChild?.className).toBe("flex shrink-0 items-center gap-2 @max-form:basis-full @max-form:flex-wrap @max-form:justify-end");
  const controls = row().lastElementChild?.firstElementChild;
  expect(controls?.className).toBe("contents");
  expect(controls?.querySelector("a")?.getAttribute("href")).toBe("https://github.com/settings/installations");
  expect(row().textContent).toContain("Installed on 2 repositories.");
  await view.rerender(<GithubSection account={{status: "ok", login: null}} installedRepoCount={null} settingsUrl={null} />);
  expect(document.activeElement?.textContent).toBe(en.settings.account.connect);
  expect(row().lastElementChild?.firstElementChild?.className).toBe("contents");
});

/**
 * **공개 셸 측면 서랍** (responsive-public design §2) — 메뉴 버튼은 진행 상태가 없지만 서랍 안 스위처가 진행 중 `busy`라 닫힘이 `body`로
 * 빠질 갈래가 없다. 그물에 등재해 두는 것은 "Esc·닫기 → 메뉴 버튼"이다(넓어지는·좁아지는 방향은 `public-nav-drawer.test.tsx`).
 */
describe("공개 셸 서랍 — 닫으면 메뉴 버튼으로", () => {
  it("Esc와 닫기 버튼 둘 다 메뉴 버튼으로 돌아온다", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} }));
    try {
      const { NavDrawer } = await import("@/components/public-shell/nav-drawer");
      await render(<NavDrawer current="docs" />);
      const menu = byLabel(en.landing.shell.openNav);
      await act(async () => { await userEvent.setup().click(menu); });
      expect(document.activeElement?.getAttribute("aria-current")).toBe("page");
      await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
      expect(document.activeElement).toBe(menu);
      await act(async () => { await userEvent.setup().click(menu); });
      await act(async () => { await userEvent.setup().click(document.querySelector(`[role="dialog"] button[aria-label="${en.common.close}"]`)!); });
      expect(document.activeElement).toBe(menu);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * **앱 LNB 서랍** (responsive-app design §2 · 시안 AT1b) — 공개 서랍과 같은 계약이다: 열면 현재 항목, Esc·닫기는 메뉴 버튼으로 돌아온다.
 * 넓어지는·좁아지는 방향과 링크로 닫힘은 `app-nav-drawer.test.tsx`가 잰다.
 */
describe("앱 LNB 서랍 — 닫으면 메뉴 버튼으로", () => {
  it("Esc와 닫기 버튼 둘 다 메뉴 버튼으로 돌아온다", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.doMock("next/navigation", () => ({ usePathname: () => "/projects/demo", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
    try {
      const { AppNavDrawer } = await import("@/components/shell/nav-drawer");
      await render(<AppNavDrawer memberships={[{ slug: "demo", name: "Demo", role: "OWNER", archived: false, image: null }]} userName="Kim" />);
      const menu = byLabel(en.landing.shell.openNav);
      await act(async () => { await userEvent.setup().click(menu); });
      expect(document.activeElement?.getAttribute("aria-current")).toBe("page");
      await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
      expect(document.activeElement).toBe(menu);
      await act(async () => { await userEvent.setup().click(menu); });
      await act(async () => { await userEvent.setup().click(document.querySelector(`[role="dialog"] button[aria-label="${en.common.close}"]`)!); });
      expect(document.activeElement).toBe(menu);
      // #222 — 서랍 안 프로젝트 전환 메뉴도 열면 검색 입력이다(서랍 FocusScope가 포커스를 되가져가 role=menu에 서던 결함).
      await act(async () => { await userEvent.setup().click(menu); });
      await act(async () => { await userEvent.setup().click(document.querySelector(`[role="dialog"] [data-zone-head] button[aria-label="${en.common.nav.projectSwitcher.label}"]`)!); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(document.activeElement).toBe(document.querySelector(`[role="menu"] input[aria-label="${en.common.nav.projectSwitcher.search.label}"]`));
    } finally {
      vi.doUnmock("next/navigation");
      vi.unstubAllGlobals();
    }
  });
});

/**
 * **번역 단일 판** (responsive-app design §3) — 판 전환으로 누른 자리가 `display:none`이 된다. 브라우저는 그 포커스를 `body`로 옮기므로(Chrome은 blur 없이)
 * 착지가 판마다 정해져 있다: 상세로 가면 상세 제목, ‹ Keys로 돌아오면 선택 행. 판 전환·폭 왕복·트리 이동의 전수는 `translation-workspace-compact.test.tsx`다.
 */
describe("번역 단일 판 — 숨는 판에서 body로 빠지지 않는다", () => {
  it("행 → 상세 제목, ‹ Keys → 선택 행", async () => {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() { this.callback([{ contentRect: { width: 500 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    });
    // single 폭의 focus fixup — 숨는 판 안의 포커스를 버린다.
    const hide = new MutationObserver(() => {
      const root = document.querySelector<HTMLElement>("[data-pane]");
      const hidden = root?.dataset.pane === "detail" ? document.querySelector("[data-pane-card]") : document.querySelector("[data-panel=detail]");
      if (document.activeElement instanceof HTMLElement && hidden?.contains(document.activeElement)) document.activeElement.blur();
    });
    hide.observe(document.body, { attributes: true, attributeFilter: ["data-pane"], subtree: true });
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));
    try {
      const { TranslationWorkspace } = await import("@/components/translations/workspace/workspace");
      const { props } = await import("./helpers/workspace-props");
      const base = props();
      window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?ns=*&key=k1");
      await render(<TranslationWorkspace {...base} />);
      const row = () => document.querySelector<HTMLElement>('[data-key-row="k1"]')!;
      await act(async () => { await userEvent.setup().click(byLabel(en.responsive.backToKeys)); });
      expect(document.activeElement).toBe(row());
      await act(async () => { await userEvent.setup().click(row()); });
      expect(document.activeElement).toBe(document.querySelector("[data-detail-title]"));
    } finally {
      vi.doUnmock("next/navigation");
      hide.disconnect();
      vi.unstubAllGlobals();
    }
  });
});

/**
 * **Files 순차 판 — 누른 판 버튼이 가려져도 `body`로 빠지지 않는다** (responsive-app A5). `View sample` · 행 안 미리보기 버튼은 누르면
 * 자기 판이 `display: none`이 된다 — 반대편 판 버튼(`Candidates`)으로 착지한다. 판 판정은 잰 폭이라 `ResizeObserver`를 부르는 stub을 쓴다.
 */
describe("Files 순차 판 — 판 버튼 착지", () => {
  it("View sample과 행 미리보기 버튼 둘 다 Candidates로 착지하고, Candidates는 View sample로 돌아온다", async () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: ResizeObserverCallback) { callbacks.push(cb); } observe() {} unobserve() {} disconnect() {} });
    try {
      const { FilesStep } = await import("@/components/onboarding/steps/files");
      const candidate = (path: string) => ({ outputPaths: [path], adapter: "json-catalog" as const, pathTemplate: path, locales: ["en"], baseLocale: "en", keys: { status: "counted" as const, count: 1 }, samples: [] });
      const state = {
        detecting: false, detectError: undefined, candidates: [candidate("a/{locale}.json"), candidate("b/{locale}.json")], picked: 0, locale: "en",
        preview: { status: "loading" as const }, manual: { adapter: "json-catalog" as const, pathTemplate: "", baseLocale: "" }, manualMatched: false,
        adapters: [], repoLabel: "o/r", branch: "main", banner: null,
      };
      const noop = vi.fn();
      const selection = { checked: new Set<number>(), locked: new Set<number>(), conflicts: [], onToggle: noop };
      await render(<FilesStep state={state} selection={selection} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />);
      const body = document.querySelector("[data-files-body]")!;
      await act(async () => { for (const cb of callbacks) cb([{ target: body, contentRect: { width: 400 } } as unknown as ResizeObserverEntry], {} as ResizeObserver); });
      const click = async (node: HTMLElement) => { await act(async () => { await userEvent.setup().click(node); }); };
      await click(byText(en.responsive.viewSample));
      expect(document.activeElement).toBe(byText(en.responsive.backToCandidates));
      await click(byText(en.responsive.backToCandidates));
      expect(document.activeElement).toBe(byText(en.responsive.viewSample));
      await click(byLabel(en.newProject.files.previewCandidate("b/{locale}.json")));
      expect(document.activeElement).toBe(byText(en.responsive.backToCandidates));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
