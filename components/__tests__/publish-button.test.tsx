// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeActions, HomeTitle, HomeHeaderActions, HomeNotices } from "@/components/home/actions";
import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { props as workspaceProps } from "./helpers/workspace-props";
import { render } from "./helpers/dom";
import { m } from "@/lib/i18n";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), pull: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.pull, saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
const preview = { groups: [], truncated: 0, total: 1, keys: 1, openPr: null, withoutFile: 0, withoutKey: 0, sendable: { total: 1, keys: 1 } };
const PUBLISH_LIVE = '[aria-live="polite"]:not([data-footer-result])';
const ok = (data: unknown) => ({ status: "ok", preview: data });
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
async function click(name: string) { await act(async () => { await userEvent.setup().click(button(name)); }); }
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (x: unknown) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue(ok(preview)); mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" }); });
describe.each(["translations", "home"])("%s 호스트", kind => {
function Host({ count = 1, role = "EDITOR" }: { count?: number; role?: "OWNER" | "EDITOR" }) {
  if (kind === "home") return <HomeActions slug="acme"><HomeTitle archived={false}>Host</HomeTitle>
    <HomeHeaderActions slug="acme" name="Host" branch="main" role={role} unsent={count} paused={false} />
    <HomeNotices slug="acme" name="Host" branch="main" role={role} state="default" repo={{ owner: "owner", name: "repo", branch: "main", syncBranch: "malmoi-i18n/sync-acme" }} unsent={count} failedSurface={null} reason={null} lastSyncAt={null} now={new Date()} />
  </HomeActions>;
  return <TranslationWorkspace {...workspaceProps({ role, unpublished: count, publish: { repo: { owner: "owner", name: "repo", branch: "main", syncBranch: "malmoi-i18n/sync-acme" }, lastSentLabel: null, lastPrUrl: null } })} />;
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
  await act(async () => run.resolve({ status: "skipped", reason: "writer-warnings", warnings: ["web: ko.json: bad\n ^"] }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  // writer 경고는 쓰기 전에 멈춘 결과다(T10) — PR 카드가 없고 "보내지 않았다"가 제목이며 버린 값은 펼친 목록이다.
  await click("View result"); expect(document.body.textContent).toContain("Not sent"); expect(document.body.textContent).not.toContain("#12");
  expect(document.querySelector("details")).toBeNull();
  expect(document.body.textContent).toContain("bad\n ^");
});
it.each([true, false])("이전 조회의 늦은 응답을 무시한다 (성공=%s)", async success => {
  const a = deferred<unknown>(); const b = deferred<unknown>();
  mocks.preview.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await render(<Host />); await click("Publish1"); await click("Close"); await click("Publish1");
  await act(async () => { if (success) a.resolve(ok(preview)); else a.reject(new Error("old")); });
  expect(document.body.textContent).not.toContain("Open pull request");
  await act(async () => b.resolve(ok(preview))); await click("Open pull request"); expect(mocks.pull).toHaveBeenCalledTimes(1);
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
/**
 * **조회 중에는 "조회 실패"를 말하지 않는다** (malmoi#49). `prUnknown`은 열린 PR 조회가 **실제로**
 * 모른다를 돌려줬을 때의 문장이다 — 로딩에 그것을 세우면 몇 초 동안 일어나지 않은 실패를 읽힌다.
 */
it("미리보기 로딩 중엔 prUnknown이 없고, 준비된 뒤 openPr가 모름일 때만 선다", async () => {
  const read = deferred<unknown>(); mocks.preview.mockReturnValueOnce(read.promise);
  await render(<Host />); await click("Publish1");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain("Couldn't check for an open pull request");
  await act(async () => read.resolve(ok({ ...preview, openPr: undefined })));
  expect(document.body.textContent).toContain("Couldn't check for an open pull request");
});
it("열기는 컨테이너, 열린 상태 전이는 본문, disabled 호출부의 닫기는 제목으로 돌아간다", async () => {
  const read = deferred<unknown>(); mocks.preview.mockReturnValueOnce(read.promise);
  const view = await render(<Host />); await click("Publish1");
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
  await act(async () => read.resolve(ok(preview)));
  expect(document.activeElement).toBe(document.querySelector('[data-onboarding-body]'));
  await click("Close");
  const read2 = deferred<unknown>(); mocks.preview.mockReturnValueOnce(read2.promise);
  await click("Publish1");
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
  // 번역 호스트의 저장 상태줄(`data-footer-result`)은 Publish와 무관한 자기 영역이라 뺀다 — 여기서 보는 것은 Publish가 낭독하지 않는가다.
  expect(document.querySelector(PUBLISH_LIVE)?.textContent).toBe("");
  await act(async () => read2.resolve(ok(preview))); await click("Open pull request");
  await view.rerender(<Host count={0} />); await click("Close");
  // 꺼진 Publish는 `aria-disabled`라 포커스를 받는다 — 사유(describedby)가 닿는 자리로 돌아간다.
  expect(document.activeElement?.textContent?.trim()).toBe("Publish");
});
/** ⚠️ **꺼진 Publish의 사유가 hover `title`에만 있으면 키보드·스크린리더로 닿지 않는다** (DESIGN §6.65). */
it("꺼진 Publish는 aria-disabled이고 사유를 describedby로 든다", async () => {
  await render(<Host count={0} />);
  const publish = button("Publish");
  expect(publish.hasAttribute("disabled")).toBe(false);
  expect(publish.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(publish.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Everything you've edited is already sent.");
  await click("Publish");
  expect(mocks.preview).not.toHaveBeenCalled();
});
/**
 * ⚠️ **브라우저가 잡은 둘을 여기에 박는다** (2026-09-16 `/design-sync` 실측).
 * ① 키 병합은 `rowSpan`이 든다 — 테두리를 지워 병합처럼 보이게 하면 화면은 같고 **낭독에는 빈 칸이
 *    하나 더** 생긴다. 열 머리와 셀의 연결도 `<table>`이 아니면 사라진다.
 * ② `−`/`+`는 `aria-hidden`이라 **낭독에 "All … All actions"만 남는다** — 어느 쪽이 리포인지
 *    말하는 것은 `sr-only` 두 줄뿐이고, 지우면 화면은 그대로인 채 뜻만 사라진다.
 */
it("키 병합은 rowSpan이 들고 diff 두 줄은 낭독될 이름을 든다", async () => {
  mocks.preview.mockResolvedValue(ok({ total: 2, keys: 1, truncated: 0, openPr: null, withoutFile: 0, withoutKey: 0, sendable: { total: 2, keys: 1 }, groups: [{ surface: "web", path: "en.json", changes: 2, keys: 1, rows: [
    { keyId: "k", key: "onboarding.title", localeCode: "en", before: "Welcome", after: "Welcome to malmoi", author: "Jiwon", updatedAt: "", surface: "web", path: "en.json", keySpan: 2 },
    { keyId: "k", key: "onboarding.title", localeCode: "ja", before: null, after: "malmoi へようこそ", author: "Mina", updatedAt: "", surface: "web", path: "en.json", keySpan: 0 },
  ] }] }));
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
/**
 * ⚠️ **미리보기 단계의 거부는 실행 전 거부(`1h`)로 흐른다** (launch-readiness L3.3 — 새 갈래를 그리지 않는다).
 * 세션 만료는 역할과 무관하게 `Sign in`, 인가 거부는 버튼 없이 문장만, 읽기 실패만 `1k`의 Retry다.
 */
it.each([
  ["unauthorized", "OWNER", "/signin"],
  ["forbidden", "OWNER", null],
  ["unauthorized", "EDITOR", "/signin"],
] as const)("미리보기 거부 %s(%s)는 1h로 그리고 Retry를 두지 않는다", async (error, role, href) => {
  mocks.preview.mockResolvedValue({ status: "rejected", error });
  await render(<Host role={role} />);
  await click("Publish1");
  expect(document.body.textContent).not.toContain("Couldn't read what would go out");
  expect([...document.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(false);
  expect(document.body.textContent).toContain("Nothing was sent");
  const links = [...document.querySelectorAll('[role="dialog"] a')].map(a => a.getAttribute("href"));
  expect(links.filter(h => h === "/signin")).toHaveLength(href === null ? 0 : 1);
  expect(links).not.toContain("/projects/acme/settings");
  expect(mocks.pull).not.toHaveBeenCalled();
});
/**
 * **표에서 뺀 셀은 따로 말한다** (launch-readiness L3.7) — 수술적 어댑터의 원본 파일이 없어 pull이 안 쓰는 셀이다.
 * 말하지 않으면 제목의 건수와 표의 행이 조용히 어긋난다.
 */
it.each([[2, true], [0, false]] as const)("파일이 없어 빠진 셀 %i개를 표 아래에 말한다(%s)", async (n, shown) => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 3, withoutFile: n, sendable: { total: 3 - n, keys: 1 } }));
  await render(<Host count={3} />);
  await click("Publish3");
  expect(document.body.textContent?.includes("language file isn't in the repository")).toBe(shown);
});
/**
 * **결과는 실린 수로 말하고 보류는 한 줄이다** (delivery-invariants D7). 미리보기 `total`(보류를 안 뺀 미발송 전체)로 말하면
 * "3 changes are in a pull request" 아래 "1 wasn't sent"가 서는 모순이 된다. 실린 0 + 보류만이면 No changes가 아니다.
 */
const committedWith = (withheld?: { file: number; key: number }) => ({ status: "committed", delivered: 2, pr: "created", commitSha: "c", changed: ["ko.yml"],
  prUrl: "https://github.com/owner/repo/pull/7", ...(withheld === undefined ? {} : { withheld }) });
it.each([
  ["created", committedWith({ file: 1, key: 0 }), m.translations.publish.createdDescription(2)],
  ["updated", { ...committedWith({ file: 1, key: 0 }), pr: "updated" }, m.translations.publish.updatedDescription(7, 2)],
  ["no-changes", { status: "skipped", reason: "no-changes", withheld: { file: 1, key: 0 } }, m.translations.publish.withheldDescription?.noChanges],
  ["withheld", { status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 } }, m.translations.publish.withheldDescription?.withheld],
] as const)("결과 %s는 실린 수로 말하고 보류 한 줄을 붙인다", async (_name, outcome, description) => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 3, withoutFile: 1, sendable: { total: 2, keys: 1 } }));
  mocks.pull.mockResolvedValueOnce(outcome);
  await render(<Host count={3} />); await click("Publish3"); await click("Open pull request");
  const text = document.body.textContent ?? "";
  expect(text).toContain(description);
  expect(text).toContain(`${m.translations.publish.withheld.file(1)} ${m.translations.publish.withheld.editor}`);
  if (_name === "withheld") expect(text).not.toContain(m.translations.publish.noChanges);
});
it("보류가 없으면 결과에 보류 줄이 없다 (짝) · OWNER에게는 Revert를 가리킨다", async () => {
  mocks.pull.mockResolvedValueOnce(committedWith());
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(document.body.textContent).not.toContain("wasn't sent");
  expect(document.body.textContent).toContain(m.translations.publish.createdDescription(2));
});
it("OWNER의 보류 줄은 파일 추가나 Revert to last sent를 가리킨다", async () => {
  mocks.pull.mockResolvedValueOnce(committedWith({ file: 0, key: 1 }));
  await render(<Host role="OWNER" />); await click("Publish1"); await click("Open pull request");
  expect(document.body.textContent).toContain(`${m.translations.publish.withheld.key(1)} ${m.translations.publish.withheld.owner.key}`);
});
it("미리보기가 키 자리 없는 셀을 따로 말한다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 2, withoutFile: 0, withoutKey: 1, sendable: { total: 1, keys: 1 } }));
  await render(<Host count={2} />); await click("Publish2");
  expect(document.body.textContent).toContain(m.translations.publish.withoutKey(1));
});
/**
 * **base 언어 파일 부재는 전용 거부다** (coordinator review r1 — 사용자 결정). 원인(경로·브랜치)과 고칠 곳을 말하고 Try again을 두지 않는다 —
 * 다시 눌러도 같은 거부다(L3.3). OWNER는 Settings로 가고, EDITOR에게는 a project owner를 가리킨다(DESIGN §10.1).
 */
it.each(["OWNER", "EDITOR"] as const)("미리보기 base 파일 부재(%s)는 경로를 말하는 거부이고 Try again이 없다", async role => {
  mocks.preview.mockResolvedValue({ status: "refused", reason: "base-file-missing", path: "config/locales/en.yml", branch: "main" });
  await render(<Host role={role} />);
  await click("Publish1");
  const text = document.body.textContent ?? "";
  const r = m.translations.publish.baseFileMissing;
  expect(text).toContain(r.title);
  expect(text).toContain(r.description("config/locales/en.yml", "main"));
  expect(text).toContain(role === "OWNER" ? r.owner : r.editor);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(false);
  const settings = [...document.querySelectorAll('[role="dialog"] a')].filter(a => a.getAttribute("href") === "/projects/acme/settings");
  expect(settings).toHaveLength(role === "OWNER" ? 1 : 0);
  expect(mocks.pull).not.toHaveBeenCalled();
});
/**
 * #84 — 미리보기의 수·약속은 **실제로 나가는** 편집이다(결과 `delivered`·Logs와 같은 모집단, POSTMORTEM 2026-09-17).
 * 전부 보류면 PR을 만들거나 바꾸는 버튼을 두지 않고 이유를 말한다.
 */
it("보류가 섞인 미리보기는 나가는 수로 말하고 '전부 간다'고 하지 않는다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 2, keys: 1, withoutFile: 1, sendable: { total: 1, keys: 1 } }));
  await render(<Host count={2} />); await click("Publish2");
  const p = m.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).toContain(p.previewTitle(1));
  expect(text).not.toContain(p.previewTitle(2));
  expect(text).toContain(p.previewCounts(1, 1));
  expect(text).toContain(p.prNone.body(1));
  expect(text).not.toContain(p.previewIntro("owner/repo"));
  expect(text).toContain(p.previewIntroPartial("owner/repo"));
});
it("전부 보류면 PR 버튼이 없고 이유를 말한다 · 실행하지 않는다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 1, keys: 1, withoutFile: 1, sendable: { total: 0, keys: 0 }, openPr: { number: 9, url: "https://github.com/owner/repo/pull/9" } }));
  await render(<Host count={1} />); await click("Publish1");
  const p = m.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).toContain(p.nothingSendable.title);
  expect(text).toContain(p.nothingSendable.body);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === p.replacePr(9) || b.textContent === p.openPr)).toBe(false);
  expect(text).not.toContain(p.prOpen.title(9));
  expect(mocks.pull).not.toHaveBeenCalled();
});
/** #83 — no-changes + 보류는 "편집이 이미 리포에 있었다"·"Logs에 nothing to send로 남는다"를 말하지 않는다(Logs는 Not sent다). */
it("no-changes에 보류가 있으면 Not sent 틀이고 nothing-to-send 약속이 없다", async () => {
  mocks.pull.mockResolvedValueOnce({ status: "skipped", reason: "no-changes", withheld: { file: 1, key: 0 } });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  const p = m.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).not.toContain(p.noChangesDescription);
  expect(text).not.toContain(p.inLogs);
  expect(text).toContain(p.withheldDescription.noChanges);
  expect(text).toContain(`${p.withheld.file(1)} ${p.withheld.editor}`);
});
it("skipped/withheld 설명은 writer 경고 문장이 아니다", async () => {
  mocks.pull.mockResolvedValueOnce({ status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 } });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  const text = document.body.textContent ?? "";
  expect(text).not.toContain(m.translations.publish.notSentDescription);
  expect(text).toContain(m.translations.publish.withheldDescription.withheld);
});
it("미리보기 읽기 실패는 1k의 Retry다 (짝)", async () => {
  mocks.preview.mockResolvedValueOnce({ status: "failed" });
  await render(<Host />);
  await click("Publish1");
  expect(document.body.textContent).toContain("Couldn't read what would go out");
  await click("Try again");
  expect(document.body.textContent).toContain("Open pull request");
});
it.each([["OWNER", 1], ["EDITOR", 0]] as const)("설정 링크는 %s에게 %i개다", async (role, links) => {
  mocks.pull.mockResolvedValue({ status: "failed", error: "could not read the base branch", code: "base-unreadable", retryable: false, delivery: "unknown" });
  await render(<Host role={role} />);
  await click("Publish1"); await click("Open pull request");
  expect(document.querySelectorAll('a[href="/projects/acme/settings"]')).toHaveLength(links);
  expect(document.body.textContent).toContain("Not a project owner?");
  // 서버가 준 safe 메시지를 코드로 갈음하지 않는다 — 코드만 남기면 "안 된대요"가 한 낱말 바뀔 뿐이다.
  expect(document.body.textContent).toContain("could not read the base branch");
  expect(document.body.textContent).toContain("base-unreadable");
});
/**
 * audit #21 — 코드가 없는 거부의 **모르는 문자열**을 그대로 보이지 않고, `invalid input`을 권한 없음으로 오역하지 않는다.
 * 짝(N > 0): 아는 사유(`not-ready`)는 여전히 그 문장이 선다.
 */
it.each(["invalid input", "weird-code"])("코드 없는 모르는 거부 %s는 원문도 권한 문장도 아니다", async error => {
  mocks.pull.mockResolvedValue({ status: "failed", error, delivery: "not-started", retryable: false });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  const text = document.body.textContent ?? "";
  expect(text).not.toContain(error);
  expect(text).not.toContain(m.errors.access.forbidden);
  expect(text).toContain(m.translations.publish.refused);
});
it("아는 거부는 그 문장이 선다 — 폴백이 모든 거부를 삼키지 않는다", async () => {
  mocks.pull.mockResolvedValue({ status: "failed", error: "not-ready", delivery: "not-started", retryable: false });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(document.body.textContent).toContain(m.errors.onboarding["not-ready"]);
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
  expect(document.querySelector(PUBLISH_LIVE)).toBeNull();
  expect(document.body.textContent).not.toContain("Reference");
  expect(document.body.textContent).not.toContain("Next");
});
/**
 * **실패 시각은 UTC라고 말한다** (launch-readiness L7.1 결정 — Logs 형). 전엔 라벨 없는 브라우저 로컬이라 보는 사람이
 * 어느 시간대인지 몰랐고, 같은 참조 코드로 Logs 화면(UTC)과 대조하면 시각이 어긋나 보였다.
 */
/**
 * **실행 거부 둘은 작은 모달(Alert)이다** (2026-09-18 사용자). 제목·한 문장·버튼 하나뿐이라 큰 패널에 두면 빈 판이 된다 —
 * 전엔 큰 껍데기를 512로 좁혀 썼다. 거부 뒤 다시 누르면 큰 모달의 미리보기로 돌아간다.
 */
it.each([
  [{ status: "failed", error: "already-running", delivery: "not-started", retryable: false }, "Close"],
  [{ status: "failed", error: "too-soon", delivery: "not-started", retryable: false, retryAfterSeconds: 18 }, null],
] as const)("실행 거부(%#)는 작은 Dialog로 뜨고 큰 패널이 없다", async (outcome, closeLabel) => {
  mocks.pull.mockResolvedValueOnce(outcome);
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(document.querySelector("[data-onboarding-panel]")).toBeNull();
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.className).toContain("max-w-110");
  if (closeLabel) { await click(closeLabel); expect(document.querySelector('[role="dialog"]')).toBeNull(); }
});
it("실패 시각은 <time dateTime>에 UTC 라벨로 선다", async () => {
  mocks.pull.mockResolvedValueOnce({ status: "failed", error: "unavailable", retryable: true, code: "ref-1" });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  const time = document.querySelector("time");
  expect(time?.textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  expect(new Date(time?.getAttribute("dateTime") ?? "").toISOString()).toBe(time?.getAttribute("dateTime"));
});

});
