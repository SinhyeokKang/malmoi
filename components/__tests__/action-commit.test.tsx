// @vitest-environment jsdom
import { act, startTransition, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **액션의 대기는 재검증 커밋까지다** (audit-ux #12·#13). Action이 `revalidatePath`를 부르면 Next는 그 응답에 새 트리를
 * 실어 **Action의 promise가 풀린 뒤** 라우터 transition으로 커밋한다. 그래서 `await` 직후 대기를 풀면 목록이 바뀌기 전에
 * 버튼이 다시 켜지고 결과 문구·토스트·닫기가 먼저 서며, 그 위에 `router.refresh()`를 또 부르면 두 번째 전체 렌더가
 * 표시 없이 돈다.
 *
 * 그 라우터 transition을 여기서 **Action mock이 여는 async transition**으로 흉내 낸다 — React 19는 진행 중인 async
 * transition을 전역으로 얽으므로(POSTMORTEM 2026-09-18), 대기를 transition 안에서 푸는 쪽만 그것이 끝날 때까지 기다린다.
 * ⚠️ 매 테스트 끝에 커밋을 푼다 — 안 풀면 그 전역 스코프가 다음 테스트로 샌다(같은 POSTMORTEM).
 */
const mocks = vi.hoisted(() => ({
  runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn(), runFirstIngest: vi.fn(),
  changeMember: vi.fn(), resendInvitation: vi.fn(), revokeInvitation: vi.fn(), createInvitations: vi.fn(),
  addSurfaces: vi.fn(), confirmManualFormat: vi.fn(), detectRepoFormats: vi.fn(), loadCandidateSample: vi.fn(), startGithubConnect: vi.fn(),
  triggerPullAction: vi.fn(), loadPublishPreview: vi.fn(), loadSourceDetail: vi.fn(), updateBaseLocale: vi.fn(),
  refresh: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({
  runRepositoryImport: mocks.runRepositoryImport, checkOpenPullRequest: mocks.checkOpenPullRequest, prepareRepositorySync: mocks.prepareRepositorySync,
  runFirstIngest: mocks.runFirstIngest, changeMember: mocks.changeMember, resendInvitation: mocks.resendInvitation, revokeInvitation: mocks.revokeInvitation,
  createInvitations: mocks.createInvitations, addSurfaces: mocks.addSurfaces, confirmManualFormat: mocks.confirmManualFormat,
  detectRepoFormats: mocks.detectRepoFormats, loadCandidateSample: mocks.loadCandidateSample,
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: mocks.startGithubConnect }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.triggerPullAction }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.loadPublishPreview }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: mocks.loadSourceDetail, updateBaseLocale: mocks.updateBaseLocale }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));

import { SyncButton } from "@/components/home/sync-button";
import { PublishButton, PublishModal, usePublish } from "@/components/publish-button";
import { InviteModal } from "@/components/members/invite-modal";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { AddSourcesModal } from "@/components/sources/add-sources-modal";
import { SourcesScreen } from "@/components/sources/sources-screen";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";

let commit: () => void = () => {};
/** 값을 곧장 돌려주되, 라우터의 재검증 커밋에 해당하는 transition을 열어 둔다. */
function revalidating<T>(value: T): () => Promise<T> {
  return () => {
    let done!: () => void;
    const pending = new Promise<void>(resolve => { done = resolve; });
    commit = () => done();
    startTransition(async () => { await pending; });
    return Promise.resolve(value);
  };
}
async function finishCommit() { await act(async () => { commit(); }); }
afterEach(async () => { await finishCommit(); commit = () => {}; });
beforeEach(() => { vi.clearAllMocks(); });

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
const byName = (name: string) => {
  const node = buttons().find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
};
const inDialog = (text: string) => {
  const node = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.trim() === text);
  if (!node) throw new Error(`Missing dialog button ${text}`);
  return node;
};
async function click(node: HTMLElement) { await act(async () => { await userEvent.setup().click(node); }); }
const spinning = (node: Element) => node.querySelector(".animate-spin") !== null;

describe("#12 — 중복 refresh를 지우고 대기가 커밋을 덮는다", () => {
  /*
    ⚠️ **긴 실행(Sync·Publish·첫 적재)은 대기를 커밋까지 끌지 않는다** — 그러려면 실행 전체를 async transition으로 감싸야
    하는데, React 19가 그것을 전역으로 얽어 그동안의 내비게이션까지 멈춘다(POSTMORTEM 2026-09-18). 여기서는 중복 refresh가
    사라졌는지와, 그 짝으로 결과가 여전히 닿는지만 본다.
  */
  it("Sync 성공: refresh를 부르지 않고 결과는 호스트에 닿는다", async () => {
    mocks.checkOpenPullRequest.mockResolvedValue(null);
    mocks.prepareRepositorySync.mockResolvedValue({ approval: "d", unsent: 0 });
    mocks.runRepositoryImport.mockResolvedValue({ ok: true, remainingEdits: 0, surfaces: [] });
    function Host() {
      const [open, setOpen] = useState(false);
      const [result, setResult] = useState<string | null>(null);
      return <><SyncButton slug="acme" name="acme" branch="main" role="OWNER" unsent={0} open={open} onOpenChange={setOpen} onResult={outcome => setResult(outcome.ok ? "synced" : "failed")} /><output>{result}</output></>;
    }
    await render(<Host />);
    await click(byName(m.repositorySync.action));
    await click(byName("Sync from repository"));
    expect(document.querySelector("output")?.textContent).toBe("synced");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("Publish: refresh를 부르지 않고 결과를 보인다", async () => {
    const preview = { groups: [], truncated: 0, total: 1, keys: 1, openPr: null, withoutFile: 0, withoutKey: 0, sendable: { total: 1, keys: 1 } };
    mocks.loadPublishPreview.mockResolvedValue({ status: "ok", preview });
    mocks.triggerPullAction.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    function Host() {
      const publish = usePublish("acme");
      return <><PublishButton count={1} publish={publish} /><PublishModal slug="acme" publish={publish} fallbackFocusRef={{ current: null }} count={1} repo={{ owner: "o", name: "r", branch: "main", syncBranch: "malmoi-i18n/sync-acme" }} role="EDITOR" /></>;
    }
    await render(<Host />);
    await click(buttons()[0]!);
    await click(byName("Open pull request"));
    expect(document.body.textContent).toContain("Nothing changed in the files");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  const source = { id: "s", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: null, lastCommitAt: null, lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: null, createdAt: new Date("2026-09-19T00:00:00Z"), keys: 0, locales: 1, orphanedLocales: 0, progress: { total: 0, done: 0, review: 0, percent: 0 } };
  const data: SourcesData = { installed: true, sources: [source], repository: { repoOwner: "o", repoName: "r", baseBranch: "main" } };
  const detail: SourceDetail = { ...source, installed: true, languages: [{ code: "en", isBase: true, orphaned: false, total: 0, translated: 0, needsReview: 0, untranslated: 0, percent: 0 }] };

  it("Sources 첫 적재: 상세는 재검증된 data로 한 번만 다시 읽는다 — refresh·직접 재조회 없음", async () => {
    mocks.loadSourceDetail.mockResolvedValue({ ok: true, detail });
    mocks.runFirstIngest.mockResolvedValue({ ok: true, count: 7, failed: 0, unmanaged: 0 });
    const view = await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
    await click(document.querySelector<HTMLElement>("[data-source-row]")!);
    await click(byName("Run first sync"));
    expect(mocks.loadSourceDetail).toHaveBeenCalledTimes(1);
    // 재검증이 싣고 온 새 data — 서버 컴포넌트가 다시 렌더한 값이다.
    await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...data, sources: [{ ...source }] }} adapters={[]} now={new Date()} />);
    expect(mocks.loadSourceDetail).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("Sources 추가: 모달 닫기와 결과 배너가 커밋과 함께 선다 — refresh 없음", async () => {
    const candidate: CandidateSummary = {
      adapter: "json-catalog", label: "JSON", pathTemplate: "i18n/{locale}.json", locales: ["en"], outputPaths: ["i18n/en.json"],
      baseLocale: "en", keys: { status: "counted", count: 2 }, samples: [{ locale: "en", rows: [{ key: "hello", value: "Hi" }], total: 2 }],
    };
    mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [candidate] });
    mocks.addSurfaces.mockImplementation(revalidating({ ok: true, results: [{ surfaceSlug: "mobile", count: 2, failed: 0 }] }));
    const onAdded = vi.fn(); const onClose = vi.fn();
    const ref = { current: null };
    await render(<AddSourcesModal open onClose={onClose} onAdded={onAdded} returnFocusRef={ref} slug="p" owner="o" repo="r" branch="main" existing={[]} adapters={[]} />);
    await click(document.querySelector<HTMLElement>('[role="checkbox"]')!);
    await click(document.querySelector<HTMLElement>("[data-add-sources]")!);
    expect(onAdded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await finishCommit();
    expect(onAdded).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("#13 — 행 잠금과 토스트·닫기가 커밋 뒤다", () => {
  const now = new Date("2026-09-17T00:00:00Z");
  const alice: MemberView = { userId: "u2", name: "Alice", emailLabel: "a***@example.com", readable: true, role: "EDITOR", joinedAt: now };
  const owner: MemberView = { userId: "u1", name: "Owner", emailLabel: "o***@example.com", readable: true, role: "OWNER", joinedAt: now };
  const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };

  it("멤버 제거: 목록 커밋 전까지 그 행의 Remove가 잠긴 채 돈다", async () => {
    mocks.changeMember.mockImplementation(revalidating({ ok: true }));
    await render(<MemberList slug="acme" members={[owner, alice]} role="OWNER" viewerId="u1" now={now} headingId="h" />);
    await click(byName("Remove Alice"));
    await click(inDialog("Remove"));
    expect(spinning(byName("Remove Alice"))).toBe(true);
    await finishCommit();
    expect(spinning(byName("Remove Alice"))).toBe(false);
  });

  /**
   * **스피너는 쓴 컨트롤에만 선다** (malmoi#106) — 행의 대기 하나가 Select `aria-busy`와 [Remove] `busy`를 함께 먹여, 역할 변경 중에
   * 되돌릴 수 없는 [Remove]가 "제거 중"처럼 돌았다. 다른 쪽은 잠기기만 한다. 잠금은 둘 다 커밋까지다(#13).
   */
  const pickRole = async (userId: string, label: string) => {
    await click(document.getElementById(`role-${userId}`)!);
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.trim() === label)!);
  };
  it("역할 변경: Select만 돌고 [Remove]는 잠기기만 한다 — 커밋까지", async () => {
    mocks.changeMember.mockImplementation(revalidating({ ok: true }));
    await render(<MemberList slug="acme" members={[owner, alice]} role="OWNER" viewerId="u1" now={now} headingId="h" />);
    await pickRole("u2", m.projects.role.OWNER);
    await click(inDialog(m.members.confirmRoleAction));
    const select = document.getElementById("role-u2")!;
    expect(select.getAttribute("aria-busy")).toBe("true");
    expect(spinning(byName("Remove Alice"))).toBe(false);
    expect(byName("Remove Alice").getAttribute("aria-busy")).toBeNull();
    expect(byName("Remove Alice").getAttribute("aria-disabled")).toBe("true");
    await finishCommit();
    expect(select.getAttribute("aria-busy")).toBeNull();
    expect(byName("Remove Alice").getAttribute("aria-disabled")).toBeNull();
  });
  it("제거: [Remove]만 돌고 Select는 잠기기만 한다 — 위의 짝", async () => {
    mocks.changeMember.mockImplementation(revalidating({ ok: true }));
    await render(<MemberList slug="acme" members={[owner, alice]} role="OWNER" viewerId="u1" now={now} headingId="h" />);
    await click(byName("Remove Alice"));
    await click(inDialog("Remove"));
    const select = document.getElementById("role-u2")!;
    expect(spinning(byName("Remove Alice"))).toBe(true);
    expect(select.getAttribute("aria-busy")).toBeNull();
    expect(select.getAttribute("aria-disabled")).toBe("true");
  });

  it("초대 철회: 목록 커밋 전까지 그 행의 Revoke가 잠긴 채 돈다", async () => {
    mocks.revokeInvitation.mockImplementation(revalidating({ ok: true }));
    await render(<PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={now} headingId="h" />);
    const revoke = byName("Revoke invitation for t***@example.com");
    await click(revoke);
    await click(inDialog(m.members.pending.confirmRevokeAction));
    expect(spinning(revoke)).toBe(true);
    await finishCommit();
    expect(spinning(revoke)).toBe(false);
  });

  it("초대 발송: 토스트와 닫기가 목록 커밋 뒤다", async () => {
    mocks.createInvitations.mockImplementation(revalidating({ ok: true, count: 1 }));
    const onClose = vi.fn();
    await render(<InviteModal slug="acme" open onClose={onClose} seats={{ n: 1, limit: 10 }} returnFocusRef={{ current: null }} />);
    const email = document.querySelector<HTMLInputElement>('[data-recipient-row] input[inputmode="email"]')!;
    await act(async () => { await userEvent.setup().type(email, "new@example.com"); });
    await click(document.querySelector<HTMLElement>('[data-onboarding-panel] button[type="submit"]')!);
    expect(mocks.createInvitations).toHaveBeenCalledOnce();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await finishCommit();
    expect(mocks.toast).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
