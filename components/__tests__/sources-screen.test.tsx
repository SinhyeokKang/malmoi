// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SourcesScreen } from "@/components/sources/sources-screen";
import { m } from "@/lib/i18n";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";
import { render } from "./helpers/dom";
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), runFirstIngest: vi.fn(), refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: mocks.load, updateBaseLocale: mocks.save }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: mocks.runFirstIngest }));
vi.mock("@/components/sources/add-sources-modal", () => ({ AddSourcesModal: ({ open, onAdded, onClose }: { open: boolean; onAdded: (r: unknown[]) => void; onClose: () => void }) => open ? <button onClick={() => { onAdded([{ surfaceSlug: "mobile", count: 9, failed: 2 }]); onClose(); }}>Finish adding</button> : null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace, push: mocks.push }) }));
const source = { id: "s", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"), lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"), createdAt: new Date("2026-09-19T00:00:00Z"), keys: 248, locales: 1, orphanedLocales: 1, progress: { total: 248, done: 210, review: 12, percent: 84 } };
const data: SourcesData = { installed: true, sources: [source] };
const detail: SourceDetail = { ...source, installed: true, languages: [{ code: "en", isBase: true, orphaned: false, total: 248, translated: 210, needsReview: 12, untranslated: 26, percent: 84 }, { code: "ja", isBase: false, orphaned: true, total: 248, translated: 0, needsReview: 0, untranslated: 248, percent: 0 }] };
const button = (text: string) => [...document.querySelectorAll('button')].find(node => node.textContent === text)!;
const open = async () => { await act(async () => { await userEvent.setup().click(document.querySelector('[data-source-row]')!); }); };
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({ ok: true, detail }); });
it("EDITOR는 연결계·재시도 없이 진행률과 고아 복구 안내를 본다", async () => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  expect(button("Add sources")).toBeUndefined();
  await open();
  expect(document.body.textContent).toContain("84%");
  expect(document.body.textContent).toContain("Synced");
  expect(document.body.textContent).not.toContain("Source commit");
  expect(document.querySelector('time')?.getAttribute('aria-label')).toContain("UTC");
  expect(document.body.textContent).toContain("ja");
  expect(button("Run first sync")).toBeUndefined();
  expect(document.querySelector('[data-source-connection]')).toBeNull();
  expect(document.querySelector('a[href*="settings"]')).toBeNull();
  expect(new URL(document.querySelector('a[href*="language=en"]')!.getAttribute('href')!, 'http://localhost').searchParams.get('ns')).toBe('*');
  expect(document.querySelector('a[href*="language=ja"]')).toBeNull();
  expect(document.querySelector('button button, button a, a button')).toBeNull();
});
it.each([{ rejected: "forbidden" }, { failed: true }])("상세 오류에서 장애만 재시도한다 %j", async result => {
  mocks.load.mockResolvedValue(result);
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  expect(!!button("Try again")).toBe("failed" in result);
  expect(document.querySelector('[data-onboarding-panel]')?.className).toContain("min-h-0");
});
it("늦게 도착한 이전 상세는 닫힌 모달을 다시 열지 않는다", async () => {
  let resolve!: (result: unknown) => void;
  mocks.load.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  expect(document.querySelectorAll('[data-language-skeleton]')).toHaveLength(3);
  await act(async () => { await userEvent.setup().click(button("Close")); });
  await act(async () => { resolve({ ok: true, detail }); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
/**
 * **불러오는 중은 대화상자 설명이 말한다** (audit #89). 골격 묶음에 `aria-label`을 달았지만 역할 없는 `div`의 이름은
 * 보조기기가 읽지 않는다(ARIA가 금지한다) — 이름 없는 골격은 장식으로 숨기고, 상태는 `aria-describedby`가 가리키는 설명이 든다.
 */
it("불러오는 중에는 설명이 로딩을 말하고 골격은 장식이다", async () => {
  mocks.load.mockReturnValue(new Promise(() => {}));
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  const described = (dialog.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent ?? "").join(" ");
  expect(described).toContain(m.sources.loading);
  const skeleton = document.querySelector('[data-language-skeleton]')!.closest("[data-source-loading]");
  expect(skeleton).not.toBeNull();
  expect(skeleton?.getAttribute("aria-label")).toBeNull();
  expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
});
it("추가 결과는 재검증 재렌더와 상세 열기/닫기 뒤에도 같은 소유자에 남는다", async () => {
  const ownerData = { ...data, repository: { repoOwner: "o", repoName: "r", baseBranch: "main" } };
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={ownerData} adapters={[]} now={new Date()} />);
  const owner = view.container.querySelector('[data-sources-screen]');
  await act(async () => { await userEvent.setup().click(button("Add sources")); await userEvent.setup().click(button("Finish adding")); });
  expect(view.container.textContent).toContain("mobile");
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...ownerData }} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Close")); });
  expect(view.container.querySelector('[data-sources-screen]')).toBe(owner);
  expect(view.container.textContent).toContain("mobile");
  expect(view.container.textContent).toContain("Update the workflow");
});
it("첫 적재 성공 뒤 상세 재조회 실패가 성공 결과를 뒤집지 않는다", async () => {
  const first = { ...source, lastCommitSha: null, lastImportError: "partial-import" };
  mocks.load.mockResolvedValueOnce({ ok: true, detail: { ...detail, ...first } }).mockResolvedValue({ failed: true });
  mocks.runFirstIngest.mockResolvedValue({ ok: true, count: 7, failed: 1 });
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={{ ...data, sources: [first] }} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Run first sync")); });
  // 재검증 커밋이 새 `data`를 싣고 온다 — 상세 재조회는 그것을 받는 effect 하나다 (audit-ux #12).
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...data, sources: [{ ...first }] }} adapters={[]} now={new Date()} />);
  expect(document.body.textContent).toContain("7");
  expect(document.body.textContent).toContain("latest");
});
/**
 * ⚠️ **어느 결과에도 `router.refresh()`를 부르지 않는다** (audit-ux #12). 거부 직후의 refresh는 미들웨어에 걸려 로그인 이동이 되고
 * 방금 세운 거부 문구를 씻어 갔다(audit #11 — POSTMORTEM 2026-09-08 재발). 상세 재조회는 **갈래마다 한 경로**다:
 * - 적재를 시작한 성공·실패 — Action의 `finally`가 `revalidatePath`를 부르고, 바뀐 `data`를 받는 effect가 한 번 읽는다.
 * - 조기 거부 — `revalidatePath` 전에 반환하고 서버 상태도 안 바뀌었다. 읽을 것이 없다(0회).
 * - `not-awaiting` — 조기 반환인데 다른 실행이 이미 적재해 상태가 바뀌었다. 직접 한 번 읽는다.
 */
const first = { ...detail, lastCommitSha: null, lastImportError: null };
async function runFirst(outcome: unknown) {
  mocks.load.mockResolvedValue({ ok: true, detail: first });
  mocks.runFirstIngest.mockResolvedValue(outcome);
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Run first sync")); });
  return view;
}
it.each(["unauthorized", "unavailable", "forbidden", "archived"])("조기 거부(%s)는 상세를 다시 읽지 않고 refresh하지 않는다", async error => {
  await runFirst({ ok: false, error });
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
/**
 * ⚠️ **응답을 잃은 첫 적재는 서버가 끝냈을 수 있다** (malmoi#135 — Sync의 #132와 같은 부류). 전엔 *"The sync didn't finish"*를
 * 단언하고 재검증 트리 없이 옛 [Run first sync]에 남았다. 확인 못 함을 말하고 **한 번** refresh한다 — 바뀐 `data`를 받는 effect가
 * 상세를 다시 읽는다. 다시 실행하지 않는다.
 */
it("응답을 잃은 첫 적재는 끝나지 않았다고 단언하지 않고 한 번 refresh한다 (malmoi#135)", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: first });
  mocks.runFirstIngest.mockRejectedValue(new Error("lost"));
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Run first sync")); });
  expect(mocks.runFirstIngest).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain(m.settings.status.unconfirmed);
  expect(document.body.textContent).not.toContain("didn't finish");
});
it("오프라인에서 응답을 잃은 첫 적재는 refresh를 부르지 않는다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: first });
  mocks.runFirstIngest.mockRejectedValue(new Error("offline"));
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  try {
    await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
    await open();
    await act(async () => { await userEvent.setup().click(button("Run first sync")); });
    expect(document.body.textContent).toContain(m.settings.status.unconfirmed);
    expect(mocks.refresh).not.toHaveBeenCalled();
  } finally { online.mockRestore(); }
});
it("첫 적재 성공은 재검증된 data로 상세를 정확히 한 번 다시 읽는다", async () => {
  const view = await runFirst({ ok: true, count: 7, failed: 0 });
  expect(mocks.load).toHaveBeenCalledTimes(1);
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...data }} adapters={[]} now={new Date()} />);
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("not-awaiting은 재검증 없이도 상세를 한 번 직접 다시 읽는다 — 다른 실행이 이미 적재했다", async () => {
  await runFirst({ ok: false, error: "not-awaiting" });
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(mocks.load).toHaveBeenLastCalledWith({ slug: "p", surfaceSlug: "web" });
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("저장 중 닫기와 모든 번역 진입을 잠그고 거부 뒤 다시 연다", async () => {
  let resolve!: (result: unknown) => void;
  mocks.save.mockReturnValue(new Promise(r => { resolve = r; }));
  mocks.load.mockResolvedValue({ ok: true, detail: { ...detail, languages: [...detail.languages, { ...detail.languages[0], code: "ko", isBase: false }] } });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  const user = userEvent.setup();
  await act(async () => { await user.click(document.querySelector('[role="combobox"]')!); });
  await act(async () => { await user.click([...document.querySelectorAll('[role="option"]')].find(n => n.textContent === "ko")!); });
  await act(async () => { await user.click(button("Save")); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('button[aria-label="Close"]')).toHaveProperty('disabled', true);
  expect(button('Close')).toHaveProperty('disabled', true);
  expect(dialog.querySelector('a')).toBeNull();
  expect([...dialog.querySelectorAll('button')].filter(n => n.textContent === 'Open').every(n => n.disabled)).toBe(true);
  await act(async () => { resolve({ ok: false, error: 'orphaned-locale' }); });
  expect(button('Close')).toHaveProperty('disabled', false);
  expect(dialog.querySelector('a[href*="language=en"]')).not.toBeNull();
});
it.each(["OWNER", "EDITOR"] as const)("소스가 없을 때 안내와 추가 권한 %s", async role => {
  await render(<SourcesScreen slug="p" role={role} data={{ installed: true, sources: [] }} adapters={[]} now={new Date()} />);
  expect(document.querySelector('[data-source-row]')).toBeNull();
  expect(!!button('Add sources')).toBe(role === 'OWNER');
  expect(document.body.textContent).toContain('No sources yet');
  expect(document.body.textContent).toContain(role === 'OWNER' ? 'Add the files that hold your strings' : 'A project owner adds the translation files');
});
// 아래 셋은 실브라우저 대조(2026-09-22)에서 시안과 갈린 자리다 — 색·글리프라 값 테스트로는 안 잡힌다.
const failedFirst = { ...source, lastCommitSha: null, lastImportError: "parse-failed", lastImportFailedAt: new Date("2026-09-20T00:00:00Z") };
it.each([
  { state: "imported" as const, row: source, tone: "default", label: "Synced" },
  { state: "failed-first" as const, row: failedFirst, tone: "failed", label: "Sync failed" },
  { state: "failed-after" as const, row: { ...source, lastImportError: "import-failed", lastImportFailedAt: new Date("2026-09-20T00:00:00Z") }, tone: "failed", label: "Sync failed" },
  { state: "importing" as const, row: { ...source, lastCommitSha: null, lastImportStartedAt: new Date() }, tone: "default", label: "Syncing" },
])("목록 행은 적재 상태를 색이 아니라 낱말로도 말한다 $state", async ({ state, row, tone, label }) => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={{ ...data, sources: [row] }} adapters={[]} now={new Date()} />);
  const all = [...document.querySelectorAll(`[data-source-status="${state}"]`)];
  expect(all).toHaveLength(2);
  // 상태는 배지다(2026-09-30 사용자) — 바깥 칸이 표시·표식을, 안의 알약이 글리프와 낱말을 든다.
  const status = all[0]!.firstElementChild!;
  expect(status.className).toContain("rounded-full");
  expect(status.textContent).toContain(label);
  // 배지 안에 글리프를 넣지 않는다(2026-09-30 사용자 — 실패 배지만 아이콘을 들어 튀었다). 낱말이 상태를 든다.
  // `<time>`은 시각이다 — UTC 접근 이름을 든다 (audit #41).
  expect([...status.children].filter(node => node.tagName !== "TIME")).toEqual([]);
  expect(document.querySelector("[data-source-glyph]")?.getAttribute("data-tone")).toBe(tone);
});
it("상세의 적재 상태는 칩 하나와 두 줄로 선다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: { ...detail, ...failedFirst } });
  await render(<SourcesScreen slug="p" role="EDITOR" data={{ ...data, sources: [failedFirst] }} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Sync failed");
  expect(dialog.textContent).toContain("Updated by syncs from your repository.");
  // 목록 줄을 상세에 다시 쓰지 않는다 — 두 벌이 되면 실패 낱말이 화면마다 갈린다.
  expect(dialog.querySelector("[data-source-status]")).toBeNull();
  expect(dialog.querySelector('[role="alert"]')).toBeNull();
});
// 2026-09-30 사용자 — 행의 [Open translations]를 걷고, 상세 모달 바닥에 [Close](보조) [Open translations](primary) 순으로 둔다.
it("목록 행에 Open translations가 없고, 상세 모달 바닥이 Close → Open translations(primary)다", async () => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  expect(document.querySelector("li")?.textContent).not.toContain("Open translations");
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  const footer = [...dialog.querySelectorAll("a, button")].filter((el) => ["Close", "Open translations"].includes(el.textContent?.trim() ?? ""));
  expect(footer.map((el) => el.textContent?.trim())).toEqual(["Close", "Open translations"]);
  expect(footer[1]!.className.split(" ")).toContain("bg-primary");
  expect(footer[0]!.className.split(" ")).not.toContain("bg-primary");
});
it("상세를 읽지 못하면 설명이 로딩 중이라고 말하지 않는다", async () => {
  mocks.load.mockResolvedValue({ failed: true });
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("We couldn't load this source");
  expect(dialog.textContent).not.toContain("Loading source details");
});
it("사라진 언어는 낱말과 색을 함께 든다 — `Removed from repository` 한 낱말(2026-09-30 상태 통일)", async () => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  const row = [...document.querySelectorAll('[role="dialog"] li')].find(node => node.textContent?.startsWith("ja"))!;
  expect(row.textContent).toContain("Removed from repository");
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("was removed from the repository");
  expect(document.body.textContent).not.toContain("File missing");
});
it("적용 대기는 배지·필드 표식·값 두 줄 셋으로 말하고 같은 낱말을 두 번 쓰지 않는다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: { ...detail, declaredBaseLocale: "ja" } });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent!.match(/Waiting to apply/g)).toHaveLength(1);
  expect(dialog.querySelector('[data-base-pending]')).not.toBeNull();
  expect(dialog.textContent).toContain("Applied: en");
  expect(dialog.textContent).toContain("Requested: ja");
});
it("적용 대기가 아니면 배지도 필드 표식도 없다", async () => {
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).not.toContain("Waiting to apply");
  expect(dialog.querySelector('[data-base-pending]')).toBeNull();
});
const dirtyDetail = { ...detail, languages: [...detail.languages, { ...detail.languages[0]!, code: "ko", isBase: false, orphaned: false }] };
const makeDirty = async () => {
  const user = userEvent.setup();
  await act(async () => { await user.click(document.querySelector('[role="combobox"]')!); });
  await act(async () => { await user.click([...document.querySelectorAll('[role="option"]')].find(n => n.textContent === "ko")!); });
};
it("미저장 변경을 두고 닫으면 확인창이 서고 계속 편집할 수 있다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: dirtyDetail });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  await makeDirty();
  await act(async () => { await userEvent.setup().click(button("Close")); });
  expect(document.body.textContent).toContain("Discard the base language change?");
  expect(document.body.textContent).toContain("You picked ko");
  await act(async () => { await userEvent.setup().click(button("Keep editing")); });
  expect(document.body.textContent).not.toContain("Discard the base language change?");
  expect(document.querySelector('[data-onboarding-panel]')).not.toBeNull();
});
it("번역으로 가는 길도 같은 확인창을 지나고 확정해야 이동한다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: dirtyDetail });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  await makeDirty();
  const link = [...document.querySelectorAll('[data-onboarding-panel] a')].find(node => node.textContent?.startsWith("Open translations"))!;
  await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
  expect(document.body.textContent).toContain("Discard the base language change?");
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => { await userEvent.setup().click(button("Discard change")); });
  expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining("/translations"));
});
it("변경이 없으면 확인창 없이 바로 닫는다", async () => {
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Close")); });
  expect(document.body.textContent).not.toContain("Discard the base language change?");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
