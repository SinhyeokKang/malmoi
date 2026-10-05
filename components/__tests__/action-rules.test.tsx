// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { act, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **DESIGN §2.4 동작 규칙 둘을 렌더 결과로 센다** (ux-drift-unify T28).
 *
 * 1. **확인 Dialog의 확정이 `danger`면 트리거도 `danger`다** — 되돌릴 수 없다는 신호가 창을 열기 전에 서야 한다(3-Y2 · 🔴 L).
 *    예외는 Sync 하나다(트리거는 일상 동작이고, 위험은 확인창 안에서 판정된다 — 미전달 편집이 없으면 버릴 것이 없다).
 * 2. **셸 안 독립·행 링크의 파랑(`text-link`)은 새 탭 외부 링크다** — 내부 이동은 foreground + chevron(🔴 N · 4-R2).
 *    문장 안 인라인 링크는 파랑을 허용한다(부모 요소가 링크 밖의 글자를 함께 든다).
 *
 * ⚠️ **대상 목록을 손으로 적되, 목록 밖 파일은 소스 스캔이 red로 잡는다** — 새 확인창·새 파랑 링크는 목록 밖에서 태어난다.
 * variant는 클래스로 판정한다 — `Button`이 variant를 속성으로 내지 않고 `danger`만 `text-destructive`를 든다(`confirm-actions.test.tsx`와 같은 방법).
 */
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), push: vi.fn(), replace: vi.fn(),
  rotatePushToken: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn(), changeMember: vi.fn(), revokeInvitation: vi.fn(),
  resendInvitation: vi.fn(), disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn(), runRepositoryImport: vi.fn(),
  checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn(), listProjectBranches: vi.fn(),
  unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(), startSessionRevocation: vi.fn(),
  issueApiToken: vi.fn(), revokeApiToken: vi.fn(), disconnectOAuthConnection: vi.fn(),
  preview: vi.fn(), revert: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({
  rotatePushToken: mocks.rotatePushToken, archiveProject: mocks.archiveProject, unarchiveProject: mocks.unarchiveProject,
  changeMember: mocks.changeMember, revokeInvitation: mocks.revokeInvitation, resendInvitation: mocks.resendInvitation,
  disconnectGithub: mocks.disconnectGithub, startGithubConnectForUser: mocks.startGithubConnectForUser,
  runRepositoryImport: mocks.runRepositoryImport, checkOpenPullRequest: mocks.checkOpenPullRequest, prepareRepositorySync: mocks.prepareRepositorySync,
  listProjectBranches: mocks.listProjectBranches,
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn(), updateRepositorySettings: vi.fn() }));
vi.mock("@/app/(edit)/account/actions", () => ({
  unlinkLoginMethod: mocks.unlinkLoginMethod, startLoginMethodConnect: mocks.startLoginMethodConnect, startSessionRevocation: mocks.startSessionRevocation,
}));
vi.mock("@/app/(edit)/mcp/actions", () => ({
  issueApiToken: mocks.issueApiToken, revokeApiToken: mocks.revokeApiToken, disconnectOAuthConnection: mocks.disconnectOAuthConnection,
}));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: mocks.preview, revertTranslationKey: mocks.revert, triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ updateBaseLocale: vi.fn(), removeSource: vi.fn(), previewSourceRemoval: async () => ({ ok: true, pendingCount: 0, approval: null, openPr: "none" }) }));

import { GithubSection } from "@/components/account/github-section";
import { LoginMethods } from "@/components/account/login-methods";
import { SessionsSection } from "@/components/account/sessions-section";
import { MetaColumn } from "@/components/home/meta-column";
import { metaTabs, type MetaTabsInput } from "@/lib/home/meta";
import { SyncButton as SyncControl } from "@/components/home/sync-button";
import { ConnectedAppsCard, type ConnectedAppData } from "@/components/mcp/connected-apps-card";
import { TokenCard, type TokenCardData } from "@/components/mcp/token-card";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { ProjectList } from "@/components/projects/project-list";
import { ArchiveCard } from "@/components/settings/archive-card";
import { CiCard } from "@/components/settings/ci-card";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import { RepositoryCard } from "@/components/settings/repository-card";
import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { SourceDetailModal } from "@/components/sources/source-detail-modal";
import type { SourceDetail } from "@/lib/sources/query";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { en } from "@/messages/en";
import type { ProjectListRow } from "@/lib/keys/query";

import { render } from "./helpers/dom";
import { props as workspaceProps } from "./helpers/workspace-props";

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
  mocks.checkOpenPullRequest.mockResolvedValue(null);
  mocks.listProjectBranches.mockResolvedValue({ ok: true, names: ["main"], defaultBranch: "main", truncated: false });
  mocks.prepareRepositorySync.mockResolvedValue({ approval: "digest-1", unsent: 0 });
  mocks.preview.mockResolvedValue({ status: "ready", locales: [{ code: "ko", before: "a", after: "b" }], confirmation: "f".repeat(64) });
});

async function click(node: Element) { await act(async () => { await userEvent.setup().click(node); }); }
const danger = (node: Element) => node.className.includes("text-destructive");
const layers = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')];
const buttonByText = (label: string) => {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent?.trim() === label).at(-1);
  if (!node) throw new Error(`no button ${label}`);
  return node;
};
const q = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`no ${selector}`);
  return node;
};

const now = new Date("2026-09-17T00:00:00Z");
const owner: MemberView = { userId: "u1", name: "Owner", emailLabel: "o***@example.com", image: null, readable: true, role: "OWNER", joinedAt: now };
const alice: MemberView = { userId: "u2", name: "Alice", emailLabel: "a***@example.com", image: null, readable: true, role: "EDITOR", joinedAt: now };
const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };
const sourceDetail = {
  id: "s-web", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc", lastCommitAt: now, lastImportStartedAt: null, lastImportError: null,
  lastImportFailedAt: null, lastImportedAt: now, createdAt: now, keys: 1, locales: 1, orphanedLocales: 0, progress: { total: 1, done: 1, review: 0, percent: 100 },
  installed: true, importActive: false, languages: [{ code: "en", isBase: true, orphaned: false, total: 1, translated: 1, needsReview: 0, untranslated: 0, percent: 100 }],
} as unknown as SourceDetail;
const activeToken: TokenCardData = { state: "active", grants: [], scope: { kind: "all" }, createdAt: "2026-09-28T00:00:00.000Z", lastUsedAt: null, expiresAt: "2026-12-27T12:00:00.000Z" };
const connectedApp: ConnectedAppData = {
  id: "c1", name: "Claude Code", ident: "claude.ai/oauth/claude-code-client-metadata", state: "active", grants: [], scope: { kind: "all" },
  createdAt: "2026-09-01T00:00:00.000Z", lastUsedAt: null, expiresAt: "2026-12-26T12:00:00.000Z", brand: "claude",
};

function Sync({ unsent }: { unsent: number }) {
  const [open, setOpen] = useState(false);
  return <SyncControl slug="acme" surfaceSlug="web" name="acme" branch="main" role="OWNER" unsent={unsent} onResult={() => {}} open={open} onOpenChange={setOpen} />;
}

/**
 * 확인창을 가진 트리거 전부 — `file`은 아래 완결성 스캔이 대조한다. `trigger`는 창을 여는 버튼이다.
 */
/** `host` — 트리거가 이미 열린 창(상세 모달) 안에 있다. 그 창은 확인창이 아니므로 클릭 뒤 **새로 선** 창만 잰다. */
const CONFIRMS: { name: string; file: string[]; ui: () => ReactNode; trigger: () => HTMLElement; host?: number }[] = [
  { name: "push 토큰 Rotate token", file: ["components/settings/push-token-panel.tsx"], ui: () => <PushTokenPanel slug="acme" />, trigger: () => buttonByText(en.settings.token.rotate) },
  {
    name: "MCP 토큰 Rotate token", file: ["components/mcp/token-card.tsx", "components/mcp/token-modal.tsx"],
    ui: () => <TokenCard token={activeToken} projects={[]} now="2026-09-28T12:00:00.000Z" />, trigger: () => q('[data-token-action="rotate"]'),
  },
  {
    name: "MCP 토큰 Revoke", file: ["components/mcp/token-card.tsx"],
    ui: () => <TokenCard token={activeToken} projects={[]} now="2026-09-28T12:00:00.000Z" />, trigger: () => q('[data-token-action="revoke"]'),
  },
  {
    name: "연결된 앱 Disconnect", file: ["components/mcp/connected-apps-card.tsx"],
    ui: () => <ConnectedAppsCard apps={[connectedApp]} now="2026-09-29T12:00:00.000Z" serverUrl="https://mal-moi.com/api/mcp" />, trigger: () => q('[data-app-disconnect="c1"]'),
  },
  {
    name: "멤버 Remove", file: ["components/members/member-list.tsx"],
    ui: () => <MemberList slug="acme" members={[owner, alice]} role="OWNER" viewerId="u1" now={now} headingId="h" />, trigger: () => q(`[aria-label="${en.members.removeLabel("Alice")}"]`),
  },
  {
    name: "초대 Revoke", file: ["components/members/pending-invitations.tsx"],
    ui: () => <PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={now} headingId="h" />,
    trigger: () => q(`[aria-label="${en.members.pending.revokeLabel("t***@example.com")}"]`),
  },
  {
    name: "GitHub 계정 Disconnect", file: ["components/github-account.tsx"],
    ui: () => <GithubSection account={{ status: "ok", login: "octo" }} installedRepoCount={1} settingsUrl={null} />, trigger: () => q(`[aria-label="${en.settings.account.disconnectLabel}"]`),
  },
  {
    name: "로그인 수단 Disconnect", file: ["components/account/login-methods.tsx"],
    ui: () => <LoginMethods rows={[{ provider: "github", connected: true }, { provider: "google", connected: true }]} />,
    trigger: () => q(`[aria-label="${en.link.methods.disconnectLabel("Google")}"]`),
  },
  {
    name: "Sign out everywhere", file: ["components/account/sessions-section.tsx"],
    ui: () => <SessionsSection outcome={undefined} signOut={() => {}} confirmProvider="GitHub" />, trigger: () => buttonByText(en.account.sessions.title),
  },
  {
    name: "프로젝트 Archive", file: ["components/settings/archive-card.tsx"],
    ui: () => <ArchiveCard slug="acme" name="Acme" archived={false} openPrUrl={Promise.resolve(null)} />, trigger: () => buttonByText(en.archive.action),
  },
  {
    name: "번역 Revert to last sent", file: ["components/translations/workspace/workspace.tsx"],
    ui: () => <TranslationWorkspace {...workspaceProps()} />, trigger: () => buttonByText("Revert to last sent"),
  },
  {
    name: "소스 Remove source", file: ["components/sources/remove-source-dialog.tsx"],
    ui: () => <SourceDetailModal slug="acme" sourceSlug="web" role="OWNER" state={{ status: "ready", detail: sourceDetail }} now={now} busy={false}
      sources={[{ id: "s-web", slug: "web" }, { id: "s-app", slug: "app" }]} onRemoved={() => {}} onLost={() => {}} onBusy={() => {}} onClose={() => {}} onReload={() => {}} onImport={() => {}} onSaved={() => {}}
      returnFocusRef={{ current: null }} fallbackFocusRef={{ current: null }} />,
    trigger: () => buttonByText(en.sources.removal.action), host: 1,
  },
];

/**
 * **트리거 없는 확인창** — 이동·닫기를 가로채는 가드라 누를 트리거가 없다. 규칙의 대상이 아니므로 사유와 함께 둔다.
 */
const NO_TRIGGER: Record<string, string> = {
  // 미저장 편집이 있는 채 떠나려 할 때 선다(Discard changes).
  "components/sources/source-detail-modal.tsx": "leave guard",
  // 역할 변경의 자기 강등 확정은 `Select`가 연다 — 트리거가 버튼이 아니다(확정만 danger로 갈린다).
  "components/members/member-list.tsx#role": "select-opened",
};
/** Sync — 확정만 danger다(규칙의 예외, DESIGN §2.4). */
const SYNC_FILE = "components/home/sync-button.tsx";

describe("확인 Dialog의 확정이 danger면 트리거도 danger다 (DESIGN §2.4 동작 규칙)", () => {
  it.each(CONFIRMS.map((entry) => [entry.name, entry] as const))("%s", async (_name, entry) => {
    await render(entry.ui());
    const trigger = entry.trigger();
    const before = layers();
    expect(before).toHaveLength(entry.host ?? 0);
    await click(trigger);
    const confirms = layers().filter((layer) => !before.includes(layer)).flatMap((layer) => [...layer.querySelectorAll<HTMLButtonElement>("button")]).filter(danger);
    // 이 목록의 창은 전부 파괴 확정을 든다 — 0이면 이 행이 규칙을 재지 않는다.
    expect(confirms.length).toBeGreaterThan(0);
    expect(danger(trigger)).toBe(true);
  });

  it("예외 — Sync는 트리거가 default이고 확정만 danger다", async () => {
    await render(<Sync unsent={0} />);
    const trigger = buttonByText("Sync");
    expect(danger(trigger)).toBe(false);
    await click(trigger);
    const confirms = layers().flatMap((layer) => [...layer.querySelectorAll<HTMLButtonElement>("button")]).filter(danger);
    expect(confirms.length).toBeGreaterThan(0);
  });

  it("판정식 카나리아 — danger 확정 옆의 default 트리거는 위반이다", () => {
    const pair = (trigger: string, confirm: string) => !(danger({ className: confirm } as Element) && !danger({ className: trigger } as Element));
    expect(pair("bg-primary text-primary-foreground", "bg-destructive/8 text-destructive")).toBe(false);
    expect(pair("bg-destructive/8 text-destructive", "bg-destructive/8 text-destructive")).toBe(true);
  });

  /**
   * **완결성** — `Dialog`·`Modal`을 그리고 danger `Button`을 든 파일은 위 목록·가드·Sync 중 하나여야 한다.
   * 새 확인창이 목록 밖에서 태어나면 여기서 red다.
   */
  it("danger 확정을 든 확인창 파일이 전부 목록에 있다", () => {
    const found = SOURCES.filter(({ source }) => /<(?:DialogContent|LargeModal)\b/.test(source) && DANGER_BUTTON.test(source)).map(({ path }) => path).sort();
    const covered = new Set([...CONFIRMS.flatMap((entry) => entry.file), ...Object.keys(NO_TRIGGER).map((key) => key.split("#")[0]), SYNC_FILE]);
    expect(found.length).toBeGreaterThan(8);
    expect(found.filter((path) => !covered.has(path))).toEqual([]);
    // 가드 목록도 실재해야 한다 — 확인창이 사라진 파일은 걷는다.
    expect(Object.keys(NO_TRIGGER).map((key) => key.split("#")[0]).filter((path) => !found.includes(path!))).toEqual([]);
  });
});

const BLUE_ROW: ProjectListRow = {
  image: null, slug: "acme", name: "acme", role: "OWNER", installationId: "i",
  surfaces: [{ archivedAt: null, lastCommitSha: "s", importError: null, importing: false }],
  archivedAt: null, repoOwner: "o", repoName: "r", repositoryId: "1", memberCount: 1, baseBranch: "main", lastPrUrl: null,
  reviewSurfaceSlug: null, unsentSurfaceSlug: null, repoAheadFrom: null, meters: [], review: 0, unsent: 0, openPr: null, repoAheadFiles: 0,
};

/** 파랑 링크 중 규칙을 어기는 것 — 새 탭도 아니고 문장 안도 아닌 것. */
function strayBlueLinks(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => a.className.includes("text-link")).filter((a) => {
    if (a.target === "_blank") return false;
    const parent = a.parentElement;
    // 문장 안 인라인 — 링크와 나란한 **글자 노드에 낱말이 있다**(요소 형제는 문장이 아니다 — 행 띠의 사유 `<span>`).
    // ⚠️ 구분자만(`·` — 메타 줄 관용구)은 문장이 아니다 — 부모가 `<p>`여도 같다(r1: `<p>· <a>`가 인라인으로 새어 나갔다).
    const inline = parent !== null && [...parent.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && /\p{L}{2,}/u.test(node.textContent ?? ""));
    return !inline;
  }).map((a) => `${a.getAttribute("href")} "${a.textContent}"`);
}
const blueLinks = (root: ParentNode) => [...root.querySelectorAll("a")].filter((a) => a.className.includes("text-link")).length;

/**
 * 파랑 링크를 그리는 셸 화면 — 렌더해서 센다. `open`은 창 안의 링크를 드러내는 동작이다.
 */
const META: MetaTabsInput = {
  repository: { owner: "o", name: "r", branch: "main", connection: "connected" },
  ciConfigured: true, surfaceCount: 1, keys: 1, members: 1, pendingInvites: 0, createdAt: now, archivedAt: null,
  lastSync: null, held: null, prState: "absent",
  lastPublish: { trigger: "manual", at: now, prUrl: "https://github.com/o/r/pull/7", changedValues: null, surfaceSlugs: [] },
};
const BLUE: { name: string; file: string; ui: () => ReactNode; open?: () => Promise<void> }[] = [
  // 리포는 Project 탭, PR은 Publish 탭이다 — Radix가 비활성 패널의 자식을 그리지 않아 탭을 열어 센다.
  { name: "Home 메타 — 리포 (Project 탭)", file: "components/home/meta-column.tsx", ui: () => <MetaColumn slug="acme" now={now} canOpenSettings={false} tabs={metaTabs(META)} uiLocale="en" m={en} /> },
  {
    name: "Home 메타 — PR (Publish 탭)", file: "components/home/meta-column.tsx",
    ui: () => <MetaColumn slug="acme" now={now} canOpenSettings={false} tabs={metaTabs(META)} uiLocale="en" m={en} />,
    open: () => click([...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Publish")!),
  },
  { name: "/projects 행 띠 — 열린 PR", file: "components/projects/project-list.tsx", ui: () => <ProjectList all={[{ ...BLUE_ROW, openPr: { url: "https://github.com/o/r/pull/7", number: 7 } }]} /> },
  { name: "Settings 연결 — App 설치", file: "components/settings/repository-card.tsx", ui: () => <RepositoryCard slug="acme" owner="o" repo="r" branch="main" archived={false} health={Promise.resolve({ status: "app-uninstalled" } as ConnectionHealth)} account={Promise.resolve({ status: "ok", login: "octo" })} appSlug="malmoi" /> },
  { name: "Settings CI — Sources·문서 (문장 안)", file: "components/settings/ci-card.tsx", ui: () => <CiCard slug="acme" archived={false} stale={[]}><p>yaml</p></CiCard> },
  {
    name: "Archive 확인 — 열린 PR (문장 안)", file: "components/settings/archive-card.tsx",
    ui: () => <ArchiveCard slug="acme" name="Acme" archived={false} openPrUrl={Promise.resolve("https://github.com/o/r/pull/7")} />,
    open: () => click(buttonByText(en.archive.action)),
  },
  {
    name: "Sync 확인 — Publish first (문장 안)", file: SYNC_FILE, ui: () => <Sync unsent={3} />,
    open: async () => { mocks.prepareRepositorySync.mockResolvedValue({ approval: "digest-1", unsent: 3 }); await click(buttonByText("Sync")); },
  },
  { name: "번역 화면 — 코드 참조", file: "components/translations/workspace/locale-panel.tsx", ui: () => <TranslationWorkspace {...workspaceProps()} /> },
];

/**
 * **렌더하지 않는 파랑 링크 파일** — 셸 밖(공개 화면)이거나, 서버 데이터 픽스처가 무거워 기존 화면 테스트가 링크 형을 이미 든다.
 * 셸 안 파일은 소스에서 사유를 적는다 — 새 파일이 이 목록에 들어오면 렌더 목록으로 옮기는 것이 먼저다.
 */
const BLUE_UNRENDERED: Record<string, string> = {
  "app/changelog/page.tsx": "public documentation navigation, outside the shell",
  "app/docs/not-found.tsx": "public documentation navigation, outside the shell",
  "components/changelog/release-markdown.tsx": "public documentation links, outside the shell",
  "components/docs/guide-markdown.tsx": "public documentation links, outside the shell",
  "app/oauth/authorize/page.tsx": "public — not in the shell",
  "app/signin/page.tsx": "public — not in the shell",
  // 실행 상세의 PR 링크 둘 — `target="_blank"`(logs-events 픽스처가 무겁다)
  "components/logs/event-detail.tsx": "external, new tab",
  // Publish 결과의 닫힌 PR 링크 — `target="_blank"`
  "components/publish-button.tsx": "external, new tab",
  // 번역 화면 세션 만료 줄의 Sign in — `target="_blank"`(편집 draft를 잃지 않으려 새 탭)
  "components/translations/workspace/workspace.tsx": "external-style new tab",
  // "Reconnect in Project settings" — 문장 안 인라인
  "components/sources/source-detail-modal.tsx": "inline in a sentence",
  "components/sources/sources-screen.tsx": "inline in a sentence",
  // App 설치 — 문장 안 인라인, 같은 탭(DESIGN §6.3 예외 — callback이 ①로 되돌린다)
  "components/onboarding/steps/repo.tsx": "inline in a sentence",
};

describe("셸 안 독립·행 링크의 파랑은 새 탭 외부 링크다 (DESIGN §2.4 동작 규칙 · 🔴 N)", () => {
  it.each(BLUE.map((entry) => [entry.name, entry] as const))("%s", async (_name, entry) => {
    await render(entry.ui());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await entry.open?.();
    expect(blueLinks(document)).toBeGreaterThan(0);
    expect(strayBlueLinks(document)).toEqual([]);
  });

  it("판정식 카나리아 — 독립 파랑 내부 링크는 잡고, 새 탭·문장 안은 놓아준다", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<div><a class="text-link" href="/projects/acme/settings">Settings</a></div>',
      '<div><a class="text-link" href="https://github.com" target="_blank">GitHub</a></div>',
      '<p>Go to <a class="text-link" href="/projects/acme/sources">Sources</a>.</p>',
      '<div><a class="text-foreground" href="/projects/acme">acme</a></div>',
      '<div><span>A pull request is open.</span><a class="text-link" href="/pr">View</a></div>',
      '<div>· <a class="text-link" href="/meta">View</a></div>',
      '<p> · <a class="text-link" href="/dot">Open</a></p>',
    ].join("");
    expect(strayBlueLinks(root)).toEqual(['/projects/acme/settings "Settings"', '/pr "View"', '/meta "View"', '/dot "Open"']);
  });

  it("파랑 링크를 그리는 파일이 전부 렌더 목록이나 사유 목록에 있다", () => {
    // `ButtonLink variant="link"`도 파랑이다(`buttonClass`의 `link` — `text-link`).
    const blue = (tag: string) => /(?<![\w-])text-link(?![\w-])/.test(tag) || (tag.startsWith("<ButtonLink") && /variant="link"/.test(tag));
    const found = SOURCES.filter(({ source }) => {
      const inlineNames = [...source.matchAll(/import\s*\{\s*Link(?:\s+as\s+(\w+))?\s*\}\s*from\s*["']@\/components\/ui\/link["']/g)].map(match => match[1] ?? "Link");
      return openingTags(source, ["a", "Link", "ButtonLink", ...inlineNames].join("|")).some(tag => blue(tag) || inlineNames.some(name => tag.startsWith(`<${name} `)));
    }).map(({ path }) => path).sort();
    const covered = new Set([...BLUE.map((entry) => entry.file), ...Object.keys(BLUE_UNRENDERED)]);
    expect(found.length).toBeGreaterThan(10);
    expect(found.filter((path) => !covered.has(path))).toEqual([]);
    // 사유 목록도 실재해야 한다 — 파랑이 사라진 파일은 걷는다.
    expect(Object.keys(BLUE_UNRENDERED).filter((path) => !found.includes(path))).toEqual([]);
  });
});

// ── 소스 스캔(완결성 대조용) ──
// jsdom 환경에서는 `import.meta.url`이 file 스킴이 아니다 — 다른 DOM 테스트처럼 작업 디렉터리를 뿌리로 쓴다.
const ROOT = process.cwd();
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}
const bare = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
const SOURCES = ["app", "components"].flatMap((dir) => sourceFiles(join(ROOT, dir))).map((file) => ({ path: relative(ROOT, file), source: bare(readFileSync(file, "utf8")) }));
/** 여는 태그를 깊이 0의 `>`까지 뗀다 — `visual-system.test.ts`의 `openingTags`와 같은 방법. */
function openingTags(source: string, names: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(new RegExp(`<(?:${names})\\b`, "g"))) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = match.index; i < source.length; i++) {
      const c = source[i];
      if (quote !== null) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) { out.push(source.slice(match.index, i + 1)); break; }
    }
  }
  return out;
}
const DANGER_BUTTON = { test: (source: string) => openingTags(source, "Button").some((tag) => /variant=(?:"danger"|\{[^}]*"danger")/.test(tag)) };
