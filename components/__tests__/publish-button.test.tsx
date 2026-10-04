// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeActions, HomeTitle, HomeHeaderActions, HomeNotices } from "@/components/home/actions";
import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { props as workspaceProps } from "./helpers/workspace-props";
import { render } from "./helpers/dom";
import { formatMinute } from "@/lib/date-format";
import { en } from "@/messages/en";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), pull: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.pull, saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
const preview = { groups: [], truncated: 0, total: 1, keys: 1, openPr: null, withoutFile: 0, withoutKey: 0, changedFiles: ["ko.json"] as string[], sendable: { total: 1, keys: 1 } };
const PUBLISH_LIVE = '[aria-live="polite"]:not([data-footer-result])';
const ok = (data: unknown) => ({ status: "ok", preview: data });
/** 보이는 글자 — 개수 배지의 sr 문장(`CountBadge`)은 빼고 센다. 버튼 이름 `Publish1`은 보이는 라벨 + 숫자다. */
function visible(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach(sr => sr.remove());
  return copy.textContent?.trim() ?? "";
}
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => visible(b) === name || b.getAttribute("aria-label") === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
async function click(name: string) { await act(async () => { await userEvent.setup().click(button(name)); }); }
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (x: unknown) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue(ok(preview)); mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" }); });
describe.each(["translations", "home"])("%s 호스트", kind => {
function Host({ count = 1, role = "EDITOR" }: { count?: number; role?: "OWNER" | "EDITOR" }) {
  if (kind === "home") return <HomeActions slug="acme" writeLock={null}><HomeTitle archived={false}>Host</HomeTitle>
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
  const view = await render(<Host />); await click("Publish1"); await click("Open pull request"); await click("Close");
  // D1 (audit-ux #25) — 라벨은 `Publish` 그대로이고 스피너가 아이콘을 교체하며 진행 신호는 `aria-busy`가 든다.
  expect(button("Publish").getAttribute("aria-busy")).toBe("true");
  expect(button("Publish").querySelectorAll("svg")).toHaveLength(1);
  expect(button("Publish").querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
  expect(document.body.textContent).not.toContain("Publishing\u2026");
  await click("Publish"); expect(mocks.pull).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain("Publishing\u2026");
  await click("Close");
  await act(async () => run.resolve({ status: "skipped", reason: "writer-warnings", warnings: [{ surfaceSlug: "web", path: "ko.json", code: "parse-failed", detail: "bad\n ^" }] }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  // 재검증 트리가 커밋되기 전까지는 Publish가 잠긴 채다 (malmoi#103) — 서버 렌더를 흉내 낸다.
  await view.rerender(<Host />);
  // writer 경고는 쓰기 전에 멈춘 결과다(T10) — PR 카드가 없고 "보내지 않았다"가 제목이며 버린 값은 펼친 목록이다.
  await click("View result"); expect(document.body.textContent).toContain("Held back"); expect(document.body.textContent).not.toContain("#12");
  expect(document.querySelector("details")).toBeNull();
  expect(document.body.textContent).toContain("bad\n ^");
});
/**
 * **진행 모달은 일어나지 않은 단계를 주장하지 않는다** (audit-ux #23). 전엔 2.5초·6.5초 타이머가 체크 표시를 넘겨 마지막 단계에서
 * 멈춘 채 돌았다 — 진행 이벤트를 내는 API가 없다. 대신 8초가 지나면 "큰 리포는 오래 걸린다" 한 줄이 선다.
 */
it("진행 모달의 단계 목록은 시간이 흘러도 바뀌지 않고, 8초가 지나면 지연 문구가 선다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const run = deferred<unknown>(); mocks.pull.mockReturnValue(run.promise);
    await render(<Host />); await click("Publish1"); await click("Open pull request");
    // D1 — 누른 확정 버튼의 라벨이 진행 중에도 그대로다(스피너만 선다). 전엔 `Publishing…`으로 바뀌었다.
    const confirm = button("Open pull request") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.querySelector(".animate-spin")).not.toBeNull();
    const steps = () => document.querySelector('[role="dialog"] ol')?.outerHTML;
    const before = steps();
    expect(before).toBeDefined();
    await act(async () => { vi.advanceTimersByTime(7_000); });
    expect(steps()).toBe(before);
    expect(document.body.textContent).not.toContain(en.common.slow);
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(document.body.textContent).toContain(en.common.slow);
    await act(async () => run.resolve({ status: "skipped", reason: "no-edits" }));
    expect(document.body.textContent).not.toContain(en.common.slow);
  } finally { vi.useRealTimers(); }
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
  await click("Try again"); expect(mocks.pull).toHaveBeenCalledTimes(1);
  await click("Open pull request"); expect(mocks.pull).toHaveBeenCalledTimes(2);
});
/**
 * ⚠️ **응답을 잃은 Publish는 서버가 PR을 냈을 수 있다** (malmoi#135 — Sync의 #132와 같은 부류). Action의 재검증 트리가 응답과
 * 함께 사라져 화면이 Publish 전 트리(`To send`·PR 링크)로 남았다. 실패를 단언하지 않고 **한 번** 다시 읽으며, 다시 실행하지 않는다 —
 * 두 번 나갈 수 있다. 잠금은 refresh 트리가 올 때까지 간다.
 */
it("응답을 잃은 Publish는 확인 못 함을 말하고 한 번 다시 읽으며 새 트리까지 잠근다 (malmoi#135)", async () => {
  mocks.pull.mockRejectedValueOnce(new Error("lost"));
  const view = await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(mocks.pull).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain("We couldn't confirm whether your changes were sent.");
  // "GitHub didn't answer"는 사실이 아니다 — 끊긴 것은 Malmoi 응답이고, GitHub 쓰기는 끝났을 수 있다.
  expect(document.body.textContent).not.toContain("GitHub didn't answer");
  expect(document.body.textContent).not.toContain("failed partway");
  // 열린 PR이 있으면 새로 열지 않고 갱신한다 — "opened the pull request"는 그 갈래에서 거짓이다.
  expect(document.body.textContent).toContain("Malmoi may have sent your changes anyway.");
  await click("Close");
  expect(button("Publish").getAttribute("aria-busy")).toBe("true");
  // refresh 트리 — 서버가 보냈다면 건수가 0이다.
  await view.rerender(<Host count={0} />);
  expect(button("Publish").getAttribute("aria-busy")).toBeNull();
  expect(mocks.pull).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
/** ⚠️ **오프라인이면 다시 읽지 않는다** — RSC fetch가 실패하면 Next가 브라우저 내비게이션으로 떨어져 오류 페이지가 결과를 덮는다. */
it("오프라인에서 응답을 잃은 Publish는 refresh를 부르지 않는다", async () => {
  mocks.pull.mockRejectedValueOnce(new Error("offline"));
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  try {
    await render(<Host />); await click("Publish1"); await click("Open pull request");
    expect(document.body.textContent).toContain("We couldn't confirm whether your changes were sent.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  } finally { online.mockRestore(); }
});
/** 응답이 온 결과에는 부르지 않는다 (audit-ux #12) — 서버의 세션 거부 `unavailable`은 트리가 없지만 데이터도 안 바뀌었다. */
it("응답이 온 unavailable 거부에는 refresh를 부르지 않는다", async () => {
  mocks.pull.mockResolvedValueOnce({ status: "failed", error: "unavailable", delivery: "not-started", retryable: true });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(mocks.refresh).not.toHaveBeenCalled();
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
  expect(document.getElementById(publish.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Nothing to send — every edit is already sent.");
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
  mocks.preview.mockResolvedValue(ok({ total: 2, keys: 1, truncated: 0, openPr: null, withoutFile: 0, withoutKey: 0, changedFiles: ["en.json"], sendable: { total: 2, keys: 1 }, groups: [{ surface: "web", path: "en.json", changes: 2, keys: 1, rows: [
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
  // 세션 만료 뒤 재로그인은 새 탭이다(ux-drift-unify 3-Y7) — 이 탭을 떠나면 번역 화면의 draft가 함께 사라진다(Sync 결과·편집 화면과 같다).
  for (const a of document.querySelectorAll('[role="dialog"] a[href="/signin"]')) {
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noreferrer noopener");
  }
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
const committedWith = (withheld?: { file: number; key: number; revertable?: true }) => ({ status: "committed", delivered: 2, pr: "created", commitSha: "c", changed: ["ko.yml"],
  prUrl: "https://github.com/owner/repo/pull/7", ...(withheld === undefined ? {} : { withheld }) });
it.each([
  ["created", committedWith({ file: 1, key: 0 }), en.translations.publish.createdDescription(2)],
  ["updated", { ...committedWith({ file: 1, key: 0 }), pr: "updated" }, en.translations.publish.updatedDescription(7, 2)],
  ["no-changes", { status: "skipped", reason: "no-changes", withheld: { file: 1, key: 0 } }, en.translations.publish.withheldDescription?.noChanges],
  ["withheld", { status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 } }, en.translations.publish.withheldDescription?.withheld],
] as const)("결과 %s는 실린 수로 말하고 보류 한 줄을 붙인다", async (_name, outcome, description) => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 3, withoutFile: 1, sendable: { total: 2, keys: 1 } }));
  mocks.pull.mockResolvedValueOnce(outcome);
  await render(<Host count={3} />); await click("Publish3"); await click("Open pull request");
  const text = document.body.textContent ?? "";
  expect(text).toContain(description);
  expect(text).toContain(`${en.translations.publish.withheld.file(1)} ${en.translations.publish.withheld.editor}`);
  if (_name === "withheld") expect(text).not.toContain(en.translations.publish.noChanges);
});
it("보류가 없으면 결과에 보류 줄이 없다 (짝) · OWNER에게는 Revert를 가리킨다", async () => {
  mocks.pull.mockResolvedValueOnce(committedWith());
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(document.body.textContent).not.toContain("wasn't sent");
  expect(document.body.textContent).toContain(en.translations.publish.createdDescription(2));
});
it("OWNER의 보류 줄은 파일 추가나 Revert to last sent를 가리킨다", async () => {
  mocks.pull.mockResolvedValueOnce(committedWith({ file: 0, key: 1, revertable: true }));
  await render(<Host role="OWNER" />); await click("Publish1"); await click("Open pull request");
  expect(document.body.textContent).toContain(`${en.translations.publish.withheld.key(1)} ${en.translations.publish.withheld.owner.key}`);
  // 코드에서 지운 키(B3.4)도 같은 줄이다 — Revert를 먼저 가리키고, 키를 "다시" 넣는 것을 둘째로 둔다(B3 r3).
  expect(en.translations.publish.withheld.owner.key).toBe("Use Revert to last sent, or add the keys back to the language file.");
});
it("#129 — 보류된 셀에 되돌릴 기준이 없으면 OWNER 줄이 Revert를 가리키지 않는다", async () => {
  mocks.pull.mockResolvedValueOnce(committedWith({ file: 0, key: 1 }));
  await render(<Host role="OWNER" />); await click("Publish1"); await click("Open pull request");
  const w = en.translations.publish.withheld;
  expect(document.body.textContent).toContain(`${w.key(1)} ${w.owner.keyNoRevert}`);
  expect(document.body.textContent).not.toContain(w.owner.key);
});
it("미리보기가 키 자리 없는 셀을 따로 말한다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 2, withoutFile: 0, withoutKey: 1, sendable: { total: 1, keys: 1 } }));
  await render(<Host count={2} />); await click("Publish2");
  expect(document.body.textContent).toContain(en.translations.publish.withoutKey(1));
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
  const r = en.translations.publish.baseFileMissing;
  expect(text).toContain(r.title);
  expect(text).toContain(r.description("config/locales/en.yml", "main"));
  expect(text).toContain(role === "OWNER" ? r.owner : r.editor);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(false);
  const settings = [...document.querySelectorAll('[role="dialog"] a')].filter(a => a.getAttribute("href") === "/projects/acme/settings");
  expect(settings).toHaveLength(role === "OWNER" ? 1 : 0);
  expect(mocks.pull).not.toHaveBeenCalled();
});
/** **base 원본을 못 읽는 것도 전용 거부다** (B3 r3) — 실행이 `write-parse-failed`로 막는 상태라 N건을 약속하지 않는다. Try again이 없다. */
it.each(["OWNER", "EDITOR"] as const)("미리보기 base 파일 읽기 불가(%s)는 경로를 말하는 거부이고 Try again이 없다", async role => {
  mocks.preview.mockResolvedValue({ status: "refused", reason: "base-file-unreadable", path: "en.json", branch: "main" });
  await render(<Host role={role} />);
  await click("Publish1");
  const text = document.body.textContent ?? "";
  const r = en.translations.publish.baseFileUnreadable;
  expect(text).toContain(r.title);
  expect(text).toContain(r.description("en.json", "main"));
  expect(text).toContain(role === "OWNER" ? r.owner : r.editor);
  expect(text).not.toContain(en.translations.publish.baseFileMissing.title);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(false);
  expect(mocks.pull).not.toHaveBeenCalled();
});
/**
 * #84 — 미리보기의 수·약속은 **실제로 나가는** 편집이다(결과 `delivered`·Logs와 같은 모집단, POSTMORTEM 2026-09-17).
 * 전부 보류면 PR을 만들거나 바꾸는 버튼을 두지 않고 이유를 말한다.
 */
it("보류가 섞인 미리보기는 나가는 수로 말하고 '전부 간다'고 하지 않는다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 2, keys: 1, withoutFile: 1, sendable: { total: 1, keys: 1 } }));
  await render(<Host count={2} />); await click("Publish2");
  const p = en.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).toContain(p.previewTitle(1));
  expect(text).not.toContain(p.previewTitle(2));
  expect(text).toContain(p.previewCounts(1, 1));
  expect(text).toContain(p.prNone.body(1));
  expect(text).not.toContain(p.previewIntro("owner/repo"));
  expect(text).toContain(p.previewIntroPartial("owner/repo"));
});
/**
 * **Publish의 블록은 `Alert`의 tone으로 말한다** (ux-drift-unify Q10 · 5-Y16) — 옛 손 조립 무색 `Notice`는 같은 성공을 Home Sync(초록 Alert)와
 * 다르게 그렸고 경고도 무색 글리프였다. 단언은 클래스가 아니라 `data-alert`다.
 */
it.each([
  ["열린 PR 없음", null, "neutral", (p: typeof en.translations.publish): string => p.prNone.title("owner/repo")],
  ["열린 PR", { number: 9, url: "https://github.com/owner/repo/pull/9" }, "neutral", (p: typeof en.translations.publish): string => p.prOpen.title(9)],
  ["PR 조회 실패", undefined, "warning", (p: typeof en.translations.publish): string => p.prUnknown.title],
] as const)("미리보기 PR 줄(%s)은 뜻에 맞는 Alert tone이다", async (_name, openPr, tone, title) => {
  mocks.preview.mockResolvedValue(ok({ ...preview, openPr }));
  await render(<Host />); await click("Publish1");
  const block = [...document.querySelectorAll("[data-alert]")].find(node => node.textContent?.includes(title(en.translations.publish)));
  expect(block?.getAttribute("data-alert")).toBe(tone);
});
it.each([
  ["no-changes", { status: "skipped", reason: "no-changes" }, "success"],
  // 교체는 `updated`의 상시 조건이고 버린 것이 없다 — 미리보기 `prOpen`(neutral)과 같은 사실이라 같은 톤이다(r1).
  ["updated", { ...committedWith(), pr: "updated" }, "neutral"],
] as const)("결과 %s의 블록은 뜻에 맞는 Alert tone이다", async (name, outcome, tone) => {
  mocks.pull.mockResolvedValueOnce(outcome);
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  const blocks = [...document.querySelectorAll('[role="dialog"] [data-alert]')];
  expect(blocks.map(node => node.getAttribute("data-alert"))).toEqual([tone]);
  if (name === "updated") expect(blocks[0]?.textContent).toContain(en.translations.publish.replacedTitle);
});
/**
 * **열린 PR 줄 본문은 한 줄에 선다** (r1) — 본문이 14px `Alert`로 커지며 긴 문장이 1024 모달에서 두 줄로 접히면, 한 줄 골격(`AlertSkeleton`)에서
 * 도착할 때 표가 20px 밀린다(2026-09-17 71 → 76과 같은 부류). 가장 긴 수(큰 changes)에서도 한 줄 길이 안이다.
 */
it("열린 PR 줄 본문은 한 줄 길이다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, openPr: { number: 12345, url: "https://github.com/owner/repo/pull/12345" }, sendable: { total: 123456, keys: 1 } }));
  await render(<Host />); await click("Publish1");
  const block = [...document.querySelectorAll('[data-alert="neutral"]')].find(node => node.textContent?.includes(en.translations.publish.prOpen.title(12345)));
  const body = block?.querySelector("p + div")?.textContent ?? "";
  expect(body.length).toBeGreaterThan(0);
  expect(body.length).toBeLessThanOrEqual(100);
});
/** 4-W2 · 1-Y5 — 버린 값 목록은 카드 규격(radius 12)이고 개수는 배지(`CountBadge`)이며 머리 글리프가 warning 톤이다. */
it("writer 경고 목록은 카드 radius · 개수 배지 · warning 글리프다", async () => {
  mocks.pull.mockResolvedValueOnce({ status: "skipped", reason: "writer-warnings", warnings: [
    { surfaceSlug: "web", path: "ko.json", code: "parse-failed", detail: "bad" }, { surfaceSlug: "web", path: "ko.json", code: "root-not-object" },
  ] });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  const list = document.querySelector('[role="dialog"] section');
  expect(list?.className).toContain("rounded-lg");
  const head = list?.firstElementChild;
  expect(head?.querySelector('[aria-hidden="true"]:not(svg)')?.textContent).toBe("2");
  expect(head?.querySelector(".sr-only")?.textContent).toBe(en.translations.publish.warnings(2));
  expect(head?.querySelector("svg")?.getAttribute("class")).toContain("text-amber-700");
  // 실행은 코드만 싣고 모달이 사전으로 문장을 조립한다(ui-locales B1′) — 표면·파일 한 묶음에 문장 둘.
  expect(list?.textContent).toContain("web: ko.json");
  expect(list?.textContent).toContain(`${en.adapterErrors["parse-failed"]} (bad)`);
  expect(list?.textContent).toContain(en.adapterErrors["root-not-object"]);
});
it("전부 보류면 PR 버튼이 없고 이유를 말한다 · 실행하지 않는다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 1, keys: 1, withoutFile: 1, sendable: { total: 0, keys: 0 }, openPr: { number: 9, url: "https://github.com/owner/repo/pull/9" } }));
  await render(<Host count={1} />); await click("Publish1");
  const p = en.translations.publish;
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
  const p = en.translations.publish;
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
  expect(text).not.toContain(en.translations.publish.notSentDescription);
  expect(text).toContain(en.translations.publish.withheldDescription.withheld);
});
/**
 * B1 r3 — no-changes 실행이 열린 PR을 닫았으면 결과가 그 사실과 이유를 말한다(역할별 — DESIGN §10.1). 전에는 "Nothing was written"만 서고
 * PR은 조용히 닫혀 있었다(QA5 PR #4).
 */
it.each(["OWNER", "EDITOR"] as const)("no-changes가 PR #4를 닫았으면 결과가 그 이유를 말한다(%s)", async role => {
  mocks.pull.mockResolvedValueOnce({ status: "skipped", reason: "no-changes", closedPr: { number: 4, url: "https://github.com/owner/repo/pull/4" } });
  await render(<Host role={role} />); await click("Publish1"); await click("Open pull request");
  const c = en.translations.publish.closedPr;
  const text = document.body.textContent ?? "";
  expect(text).toContain(c.description("main"));
  expect(text).toContain(`${c.line(4, "main")} ${role === "OWNER" ? c.owner : c.editor}`);
  expect(text).not.toContain(en.translations.publish.noChangesDescription);
  expect([...document.querySelectorAll('[role="dialog"] a')].some(a => a.getAttribute("href") === "https://github.com/owner/repo/pull/4")).toBe(true);
});
it("닫은 PR이 없으면 그 줄이 없다 (짝)", async () => {
  mocks.pull.mockResolvedValueOnce({ status: "skipped", reason: "no-changes" });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(document.body.textContent).toContain(en.translations.publish.noChangesDescription);
  expect(document.body.textContent).not.toContain("was closed because");
});
/**
 * B1 r3 — 열린 PR의 변경을 base 값으로 되돌린 행은 양쪽이 같은 "변경"으로 그리지 않는다(QA5). 전부 그렇다면 실행은 no-changes 경로라
 * 열린 PR을 닫는다 — 미리보기가 그렇게 말하고 버튼도 그 일을 이름으로 든다.
 */
const sameRow = { keyId: "k", key: "common.ok", localeCode: "ko", before: "확인", after: "확인", author: "Kim", updatedAt: "", surface: "web", path: "ko.json", keySpan: 1, same: true };
const otherRow = { ...sameRow, keyId: "k2", key: "common.no", before: "아니요", after: "아니", same: false };
// 전부 base와 같으면 실행이 파일을 안 바꾼다 — 그 fixture의 `changedFiles`는 비어 있다(#128 r5: `allSame`이 이 목록으로 판정한다).
const withRows = (rows: object[], openPr: object | null, changedFiles = rows.every(r => (r as { same: boolean }).same) ? [] : ["ko.json"]) => ok({ ...preview, changedFiles, total: rows.length, keys: rows.length, sendable: { total: rows.length, keys: rows.length },
  same: rows.filter(r => (r as { same: boolean }).same).length, openPr, groups: [{ surface: "web", path: "ko.json", changes: rows.length, keys: rows.length, rows }] });
it("열린 PR의 변경을 되돌리는 행은 그렇다고 말한다 · PR이 없으면 이미 리포에 있다고 말한다", async () => {
  mocks.preview.mockResolvedValue(withRows([sameRow, otherRow], { number: 9, url: "https://github.com/owner/repo/pull/9" }));
  await render(<Host count={2} />); await click("Publish2");
  const s = en.translations.publish.same;
  expect(document.body.textContent).toContain(s.undoes(9));
  expect(document.body.textContent).toContain(en.translations.publish.replacePr(9));
});
it("전부 되돌린 편집이고 PR이 열려 있으면 미리보기가 그 PR을 닫는다고 말하고 버튼이 그 일을 든다", async () => {
  mocks.preview.mockResolvedValue(withRows([sameRow], { number: 9, url: "https://github.com/owner/repo/pull/9" }));
  await render(<Host />); await click("Publish1");
  const s = en.translations.publish.same;
  const text = document.body.textContent ?? "";
  expect(text).toContain(s.closesTitle(9));
  expect(text).toContain(s.closesBody(9, "main"));
  expect(text).not.toContain(en.translations.publish.prOpen.title(9));
  await click(s.closeAction(9));
  expect(mocks.pull).toHaveBeenCalledTimes(1);
});
/**
 * #128 r5 — 편집이 전부 base와 같아도 편집 없는 파일(orphan 줄 제거)이 바뀌면 실행은 커밋하고 PR을 연다. 미리보기가 셀 근사로 "PR을 닫는다"를
 * 말하면 결과와 정반대다(POSTMORTEM #84). 판정은 실행과 같은 `changedFiles`다.
 */
it("#128 r5 — 편집은 전부 base와 같지만 다른 파일이 바뀌면 PR을 닫는다고 말하지 않는다", async () => {
  mocks.preview.mockResolvedValue(withRows([sameRow], { number: 9, url: "https://github.com/owner/repo/pull/9" }, ["ja.json"]));
  await render(<Host />); await click("Publish1");
  const p = en.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).not.toContain(p.same.closesTitle(9));
  expect([...document.querySelectorAll("button")].some(b => b.textContent === p.same.closeAction(9))).toBe(false);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === p.replacePr(9))).toBe(true);
  expect(text).toContain("ja.json");
});
it("#128 r5 — 전부 보류면 실행이 아무 파일도 안 바꾸므로 편집 없는 파일 행도 없다", async () => {
  mocks.preview.mockResolvedValue(ok({ ...preview, total: 1, keys: 1, withoutKey: 1, changedFiles: ["ja.json"], sendable: { total: 0, keys: 0 } }));
  await render(<Host count={1} />); await click("Publish1");
  const text = document.body.textContent ?? "";
  expect(text).toContain(en.translations.publish.nothingSendable.title);
  expect(text).not.toContain(en.translations.publish.otherFile.label);
  expect(text).not.toContain("ja.json");
});
it("전부 base와 같고 PR이 없으면 파일이 바뀌지 않는다고 말한다", async () => {
  mocks.preview.mockResolvedValue(withRows([sameRow], null));
  await render(<Host />); await click("Publish1");
  const s = en.translations.publish.same;
  expect(document.body.textContent).toContain(s.nothingTitle("main"));
  expect(document.body.textContent).toContain(s.already);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === en.translations.publish.openPr)).toBe(false);
});
/**
 * #94 — 전부 base와 같으면 실행이 파일을 하나도 안 쓴다(결과·Logs `0 files`). 푸터가 편집이 사는 파일(`groups`)을 세면 한 흐름 안에서 1과 0이 갈린다.
 * 짝: 평소 갈래의 파일 수는 그대로다.
 */
it.each([[{ number: 9, url: "https://github.com/owner/repo/pull/9" }], [null]])("전부 base와 같으면 푸터가 파일 수를 세지 않는다 (PR %#)", async openPr => {
  mocks.preview.mockResolvedValue(withRows([sameRow], openPr));
  await render(<Host />); await click("Publish1");
  const p = en.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).toContain(p.fileSummary(1, 1));
  expect(text).not.toContain(p.previewSummary(1, 1, 1));
});
it("바뀌는 편집이 있으면 푸터가 파일 수를 센다 (짝)", async () => {
  mocks.preview.mockResolvedValue(withRows([otherRow], null));
  await render(<Host />); await click("Publish1");
  expect(document.body.textContent).toContain(en.translations.publish.previewSummary(1, 1, 1));
});
/**
 * #128 — PR이 바꾸는 파일은 편집이 사는 파일보다 많을 수 있다(orphan 줄 제거, 닫힌 PR에 실렸던 값의 재전송). 미리보기가 그 파일을 이름으로 세우고
 * 푸터의 파일 수가 실행(`changedFiles` — 결과의 "N files changed")과 같다.
 */
it("#128 — 편집 없이 바뀌는 파일도 표에 서고, 푸터가 실행의 파일 수를 센다", async () => {
  mocks.preview.mockResolvedValue(withRows([otherRow], null, ["ja.json", "ko.json"]));
  await render(<Host />); await click("Publish1");
  const p = en.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).toContain(p.previewSummary(1, 1, 2));
  expect(text).toContain("ja.json");
  expect(text).toContain(p.otherFile.label);
  expect(text).toContain(p.otherFile.body);
});
it("#128 — 상한 밖 행이 있으면 편집 없는 파일로 단정하지 않는다 · 파일 수는 그대로 실행의 수다 (짝)", async () => {
  mocks.preview.mockResolvedValue(ok({ ...(withRows([otherRow], null, ["ja.json", "ko.json"]).preview as object), total: 3, truncated: 2, sendable: { total: 3, keys: 1 } }));
  await render(<Host count={3} />); await click("Publish3");
  const p = en.translations.publish;
  const text = document.body.textContent ?? "";
  expect(text).toContain(p.previewSummary(3, 1, 2));
  expect(text).not.toContain(p.otherFile.label);
});
/** #96 — 여러 줄 값의 줄바꿈이 공백으로 접히면 PR이 쓰는 개행과 공백을 미리보기가 구별하지 못한다. − 줄과 + 줄 둘 다다. */
it("여러 줄 값의 −/+ 줄은 줄바꿈을 지킨다", async () => {
  mocks.preview.mockResolvedValue(withRows([{ ...otherRow, before: "첫 줄\n둘째", after: "첫 줄\n셋째" }], null));
  await render(<Host />); await click("Publish1");
  const values = [...document.querySelectorAll('[role="dialog"] span.break-words')].filter(s => s.textContent?.includes("\n"));
  expect(values).toHaveLength(2);
  for (const value of values) expect(value.className).toContain("whitespace-pre-wrap");
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
  expect(text).not.toContain(en.errors.access.forbidden);
  expect(text).toContain(en.translations.publish.refused);
});
it("아는 거부는 그 문장이 선다 — 폴백이 모든 거부를 삼키지 않는다", async () => {
  mocks.pull.mockResolvedValue({ status: "failed", error: "not-ready", delivery: "not-started", retryable: false });
  await render(<Host />); await click("Publish1"); await click("Open pull request");
  expect(document.body.textContent).toContain(en.errors.onboarding["not-ready"]);
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
  expect(time?.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4} \d{2}:\d{2} UTC$/);
  expect(new Date(time?.getAttribute("dateTime") ?? "").toISOString()).toBe(time?.getAttribute("dateTime"));
});
/** user-timezone C2 — 보는 사람이 고른 시간대로 말하고 오프셋을 단다. `dateTime`은 그대로 UTC ISO다. */
it("실패 시각은 고른 시간대(Asia/Seoul)로 서고 UTC+9 라벨을 단다", async () => {
  mocks.pull.mockResolvedValueOnce({ status: "failed", error: "unavailable", retryable: true, code: "ref-1" });
  await render(<Host />, { timeZone: "Asia/Seoul" }); await click("Publish1"); await click("Open pull request");
  const time = document.querySelector("time");
  const iso = time?.getAttribute("dateTime") ?? "";
  expect(new Date(iso).toISOString()).toBe(iso);
  expect(time?.textContent).toMatch(/ UTC\+9$/);
  expect(time?.textContent).toBe(formatMinute(new Date(iso), { uiLocale: "en", timeZone: "Asia/Seoul" }));
});

});
/** 내부 이동과 새 탭 외부 링크 모두 ButtonLink가 네이티브 속성과 버튼 폼을 든다. */
it("Publish 모달은 ButtonLink로 내부 이동과 새 탭 외부 링크를 구분한다", () => {
  const source = readFileSync(join(process.cwd(), "components/publish-button.tsx"), "utf8");
  const links = source.match(/<ButtonLink\b[^>]*>/g) ?? [];
  expect(links).toHaveLength(4);
  const external = links.filter((link) => /\bexternal\b/.test(link));
  expect(external).toHaveLength(2);
  for (const link of external) {
    expect(link).toContain(" newTab");
    expect(link).toContain('rel="noreferrer"');
  }
  const internal = links.filter((link) => !/\bexternal\b/.test(link));
  expect(internal).toHaveLength(2);
  for (const link of internal) expect(link).toContain("href={routes.settings(slug)}");
  expect(source).not.toMatch(/<a\b[^>]*buttonClass/);
});
