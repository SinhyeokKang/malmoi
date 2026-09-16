// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeActions, HomeTitle, HomeHeaderActions, HomeNotices } from "@/components/home/actions";
import { TranslationsHeader } from "@/components/translations/header";
import { render } from "./helpers/dom";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), pull: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.pull }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
const preview = { groups: [], truncated: 0, total: 1, keys: 1, openPr: null };
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
async function click(name: string) { await act(async () => { await userEvent.setup().click(button(name)); }); }
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (x: unknown) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue(preview); mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" }); });
describe.each(["translations", "home"])("%s 호스트", kind => {
function Host({ count = 1, role = "EDITOR" }: { count?: number; role?: "OWNER" | "EDITOR" }) {
  if (kind === "home") return <HomeActions slug="acme"><HomeTitle archived={false}>Host</HomeTitle>
    <HomeHeaderActions slug="acme" name="Host" branch="main" role={role} unsent={count} paused={false} />
    <HomeNotices slug="acme" name="Host" branch="main" role={role} state="default" repo={{ owner: "owner", name: "repo", branch: "main", syncBranch: "malmoi-i18n/sync-acme" }} unsent={count} failedSurface={null} reason={null} lastSyncAt={null} now={new Date()} />
  </HomeActions>;
  return <TranslationsHeader slug="acme" surfaceSlug="default" surfaces={[]} totalCount={1} query={{}} chipQuery={{}}
    namespaces={[]} locales={[]} selected={[]} fallback={[]} unpublished={count} repo={{ owner: "owner", name: "repo", branch: "main", syncBranch: "malmoi-i18n/sync-acme" }} role={role} lastSentLabel={null} lastPrUrl={null}
    dismissKey="never" baseLocale="en" declaredBaseLocale="en"><p>Rows</p></TranslationsHeader>;
}
it("확인 전에는 쓰지 않고 0건 refresh 뒤에도 결과와 재열기를 보존한다", async () => {
  const view = await render(<Host />);
  await click("Publish1");
  expect(mocks.pull).not.toHaveBeenCalled();
  await click("Open pull request");
  expect(mocks.pull).toHaveBeenCalledTimes(1);
  await view.rerender(<Host count={0} />);
  expect(document.body.textContent).toContain("Nothing changed in the files");
  await click("Close");
  await click("View result");
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  expect(mocks.pull).toHaveBeenCalledTimes(1);
});
it("닫힌 동안 실행을 유지하고 완료가 자동으로 열리지 않는다", async () => {
  const run = deferred<unknown>(); mocks.pull.mockReturnValue(run.promise);
  await render(<Host />); await click("Publish1"); await click("Open pull request"); await click("Close");
  await click("Publishing…"); expect(mocks.pull).toHaveBeenCalledTimes(1); await click("Close");
  await act(async () => run.resolve({ status: "committed", pr: "updated", prUrl: "https://github.com/owner/repo/pull/12", changed: ["ko.json"], warnings: ["web: ko.json: bad\n ^"] }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("View result"); expect(document.body.textContent).toContain("#12"); expect(document.querySelector("details")).toBeNull();
  expect(document.body.textContent).toContain("bad\n ^");
});
it.each([true, false])("이전 조회의 늦은 응답을 무시한다 (성공=%s)", async success => {
  const a = deferred<unknown>(); const b = deferred<unknown>();
  mocks.preview.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await render(<Host />); await click("Publish1"); await click("Close"); await click("Publish1");
  await act(async () => { if (success) a.resolve(preview); else a.reject(new Error("old")); });
  expect(document.body.textContent).not.toContain("Open pull request");
  await act(async () => b.resolve(preview)); await click("Open pull request"); expect(mocks.pull).toHaveBeenCalledTimes(1);
});
it("조회 실패와 응답 유실 재시도 모두 새 확인을 요구한다", async () => {
  mocks.preview.mockRejectedValueOnce(new Error("read")); mocks.pull.mockRejectedValueOnce(new Error("lost"));
  await render(<Host />); await click("Publish1"); expect(document.body.textContent).not.toContain("Open pull request");
  await click("Try again"); expect(mocks.pull).not.toHaveBeenCalled(); await click("Open pull request");
  expect(document.body.textContent).toContain("We couldn't confirm whether your changes were sent.");
  expect(document.body.textContent).not.toContain("Nothing was sent");
  expect(mocks.refresh).not.toHaveBeenCalled();
  await click("Try again"); expect(mocks.pull).toHaveBeenCalledTimes(1);
  await click("Open pull request"); expect(mocks.pull).toHaveBeenCalledTimes(2);
});
it("열기는 컨테이너, 열린 상태 전이는 본문, disabled 호출부의 닫기는 제목으로 돌아간다", async () => {
  const read = deferred<unknown>(); mocks.preview.mockReturnValueOnce(read.promise);
  const view = await render(<Host />); await click("Publish1");
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
  await act(async () => read.resolve(preview));
  expect(document.activeElement).toBe(document.querySelector('[data-onboarding-body]'));
  await click("Close");
  const read2 = deferred<unknown>(); mocks.preview.mockReturnValueOnce(read2.promise);
  await click("Publish1");
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  await act(async () => read2.resolve(preview)); await click("Open pull request");
  await view.rerender(<Host count={0} />); await click("Close");
  expect(document.activeElement?.textContent).toBe(kind === "home" ? "Host" : "Translations");
});
/**
 * ⚠️ **브라우저가 잡은 둘을 여기에 박는다** (2026-09-16 `/design-sync` 실측).
 * ① 키 병합은 `rowSpan`이 든다 — 테두리를 지워 병합처럼 보이게 하면 화면은 같고 **낭독에는 빈 칸이
 *    하나 더** 생긴다. 열 머리와 셀의 연결도 `<table>`이 아니면 사라진다.
 * ② `−`/`+`는 `aria-hidden`이라 **낭독에 "All … All actions"만 남는다** — 어느 쪽이 리포인지
 *    말하는 것은 `sr-only` 두 줄뿐이고, 지우면 화면은 그대로인 채 뜻만 사라진다.
 */
it("키 병합은 rowSpan이 들고 diff 두 줄은 낭독될 이름을 든다", async () => {
  mocks.preview.mockResolvedValue({ total: 2, keys: 1, truncated: 0, openPr: null, groups: [{ surface: "web", path: "en.json", changes: 2, keys: 1, rows: [
    { keyId: "k", key: "onboarding.title", localeCode: "en", before: "Welcome", after: "Welcome to malmoi", author: "Jiwon", updatedAt: "", surface: "web", path: "en.json", keySpan: 2 },
    { keyId: "k", key: "onboarding.title", localeCode: "ja", before: null, after: "malmoi へようこそ", author: "Mina", updatedAt: "", surface: "web", path: "en.json", keySpan: 0 },
  ] }] });
  await render(<Host count={2} />);
  await click("Publish2");
  expect(document.querySelectorAll("th[scope=col]")).toHaveLength(3);
  const rows = [...document.querySelectorAll("tbody tr")].slice(1);
  expect(rows.map(row => row.children.length)).toEqual([3, 2]);
  const key = rows[0]?.firstElementChild as HTMLTableCellElement;
  expect([key.textContent, key.rowSpan]).toEqual(["onboarding.title", 2]);
  const labels = [...document.querySelectorAll(".sr-only")].map(n => n.textContent);
  expect(labels).toContain("In the repository");
  expect(labels).toContain("Your edit");
});
/**
 * ⚠️ **복구 버튼이 역할을 탄다** (2026-09-16 사용자 판정). 설정 화면은 `project:settings`라 EDITOR가
 * 누르면 거절당한다 — **무반응·거절당하는 버튼은 비활성보다 한 단계 아래다**. 캔버스 자신도 `1h`에
 * "설정은 OWNER만 열므로 눌러서 거절당하는 경험을 만들지 않는다"고 적었다.
 * ⚠️ **바닥의 "오너에게 전달하라" 한 줄은 두 역할 모두에 선다** — 그것이 EDITOR의 유일한 복구 경로다.
 */
it.each([["OWNER", 1], ["EDITOR", 0]] as const)("설정 링크는 %s에게 %i개다", async (role, links) => {
  mocks.pull.mockResolvedValue({ status: "failed", error: "could not read the base branch", code: "base-unreadable", retryable: false, delivery: "unknown" });
  await render(<Host role={role} />);
  await click("Publish1"); await click("Open pull request");
  expect(document.querySelectorAll('a[href="/projects/acme/settings"]')).toHaveLength(links);
  expect(document.body.textContent).toContain("Not an owner?");
  // 서버가 준 safe 메시지를 코드로 갈음하지 않는다 — 코드만 남기면 "안 된대요"가 한 낱말 바뀔 뿐이다.
  expect(document.body.textContent).toContain("could not read the base branch");
  expect(document.body.textContent).toContain("base-unreadable");
});
it("실패의 alert만 낭독하고 닫힌 동안 완료는 포커스를 빼앗지 않는다", async () => {
  const run = deferred<unknown>(); mocks.pull.mockReturnValueOnce(run.promise);
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(document.activeElement).toBe(document.querySelector('[data-onboarding-body]'));
  await click("Close"); const focused = document.activeElement;
  await act(async () => run.resolve({ status: "failed", error: "unavailable", retryable: true, delivery: "unknown" }));
  expect(document.activeElement).toBe(focused);
  await click("View result");
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(document.querySelector('[aria-live="polite"]')).toBeNull();
  expect(document.body.textContent).not.toContain("Reference");
  expect(document.body.textContent).not.toContain("Next");
});

});
