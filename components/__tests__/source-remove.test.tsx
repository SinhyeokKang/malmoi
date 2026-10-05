// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SourcesScreen } from "@/components/sources/sources-screen";
import { en } from "@/messages/en";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";
import { render } from "./helpers/dom";

/**
 * 소스 제거 UI (sources-add-remove B-T10·B-T11 — 시안 R1–R8). 판정·지문은 서버(B1)가 들고, 여기서는 화면이
 * 그 응답으로 무엇을 세우고 무엇을 막는지만 잰다.
 */
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), preview: vi.fn(), runFirstIngest: vi.fn(), refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: mocks.load, updateBaseLocale: mocks.save, removeSource: mocks.remove, previewSourceRemoval: mocks.preview }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: mocks.runFirstIngest }));
vi.mock("@/components/sources/add-sources-modal", () => ({ AddSourcesModal: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace, push: mocks.push }) }));

const web = { id: "s-web", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"), lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"), createdAt: new Date("2026-09-19T00:00:00Z"), keys: 248, locales: 2, orphanedLocales: 0, progress: { total: 248, done: 210, review: 12, percent: 84 } };
const emails = { ...web, id: "s-emails", slug: "emails" };
const repository = { repoOwner: "o", repoName: "r", baseBranch: "main" };
const two: SourcesData = { installed: true, repository, sources: [emails, web] };
const one: SourcesData = { installed: true, repository, sources: [web] };
const detail = (over: Partial<SourceDetail> = {}): SourceDetail => ({
  ...web, installed: true, importActive: false,
  languages: [
    { code: "en", isBase: true, orphaned: false, total: 248, translated: 248, needsReview: 0, untranslated: 0, percent: 100 },
    { code: "ko", isBase: false, orphaned: false, total: 248, translated: 210, needsReview: 12, untranslated: 26, percent: 84 },
  ],
  ...over,
});
const button = (text: string) => [...document.querySelectorAll("button")].find(node => node.textContent === text);
const removeTrigger = () => [...document.querySelectorAll('[data-source-remove] button')][0] as HTMLButtonElement | undefined;
const confirmDialog = () => [...document.querySelectorAll('[role="dialog"]')].find(node => node.textContent?.includes(en.sources.removal.title("web"))) as HTMLElement | undefined;
const inConfirm = (text: string) => [...(confirmDialog()?.querySelectorAll("button") ?? [])].find(node => node.textContent === text) as HTMLButtonElement | undefined;
const user = () => userEvent.setup();
async function openDetail() { await act(async () => { await user().click([...document.querySelectorAll("[data-source-row]")].find(row => row.textContent?.includes("web"))!); }); }
async function openConfirm() { await act(async () => { await user().click(removeTrigger()!); }); }
const ready = (over: Partial<{ pendingCount: number; approval: string | null; openPr: "open" | "none" | "unknown" }> = {}) => ({ ok: true, pendingCount: 0, approval: null, openPr: "none", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ ok: true, detail: detail() });
  mocks.preview.mockResolvedValue(ready());
});

it("OWNER는 바닥 왼쪽에 [Remove source]를 받고 옛 안내 문구는 없다 — Open 꺼짐 사유는 sr-only로만 남는다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: detail({ lastCommitSha: null }) });
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  const trigger = removeTrigger();
  expect(trigger?.textContent).toBe(en.sources.removal.action);
  expect(trigger?.getAttribute("aria-disabled")).toBeNull();
  expect(document.body.textContent).not.toContain("are read from the repository");
  const reason = document.getElementById("source-open-reason");
  expect(reason?.className).toContain("sr-only");
  expect(reason?.textContent).toBe(en.sources.firstImport);
});

it("EDITOR에게는 제거 버튼이 없다", async () => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(removeTrigger()).toBeUndefined();
  expect(button(en.sources.removal.action)).toBeUndefined();
});

it.each([{ label: "불러오는 중", result: new Promise(() => {}) }, { label: "불러오기 실패", result: Promise.resolve({ failed: true }) }])("$label에는 제거 버튼이 없다", async ({ result }) => {
  mocks.load.mockReturnValue(result);
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  expect(removeTrigger()).toBeUndefined();
});

it("마지막 소스는 꺼진 버튼 옆에 서버와 같은 사유 문장을 세우고 확인 창을 열지 않는다", async () => {
  await render(<SourcesScreen slug="p" role="OWNER" data={one} adapters={[]} now={new Date()} />);
  await openDetail();
  const trigger = removeTrigger()!;
  expect(trigger.getAttribute("aria-disabled")).toBe("true");
  const reason = document.getElementById(trigger.getAttribute("aria-describedby")!);
  expect(reason?.textContent).toBe(en.sources.removal.reasons["last-source"]);
  expect(reason?.className).not.toContain("sr-only");
  await openConfirm();
  expect(confirmDialog()).toBeUndefined();
  expect(mocks.preview).not.toHaveBeenCalled();
});

it("서버가 살아 있는 적재를 알리면 importing 사유로 꺼진다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: detail({ importActive: true, lastImportStartedAt: new Date() }) });
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  const trigger = removeTrigger()!;
  expect(trigger.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(trigger.getAttribute("aria-describedby")!)?.textContent).toBe(en.sources.removal.reasons.importing);
});

it("첫 Sync 중에는 바쁨 문장이 마지막 소스 사유보다 앞선다", async () => {
  let finish: (value: unknown) => void = () => {};
  mocks.load.mockResolvedValue({ ok: true, detail: detail({ lastCommitSha: null }) });
  mocks.runFirstIngest.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(<SourcesScreen slug="p" role="OWNER" data={one} adapters={[]} now={new Date()} />);
  await openDetail();
  await act(async () => { await user().click(button("Run first sync")!); });
  const trigger = removeTrigger()!;
  expect(trigger.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(trigger.getAttribute("aria-describedby")!)?.textContent).toBe(en.settings.sources.importing);
  await act(async () => { finish({ ok: true, count: 1, failed: 0 }); });
});

it("확인 창은 지문을 받는 동안 확정을 busy로 두고, 경고 없는 응답에는 워크플로 줄 하나만 세운다", async () => {
  let resolve!: (value: unknown) => void;
  mocks.preview.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  const dialog = confirmDialog()!;
  expect(mocks.preview).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web" });
  expect(dialog.textContent).toContain(en.sources.removal.body);
  expect(dialog.querySelector("[data-removal-skeleton]")).not.toBeNull();
  const confirm = inConfirm(en.sources.removal.action)!;
  expect(confirm.getAttribute("aria-busy")).toBe("true");
  expect(document.activeElement).toBe(inConfirm(en.common.cancel));
  await act(async () => { await user().click(confirm); });
  expect(mocks.remove).not.toHaveBeenCalled();
  await act(async () => { resolve(ready()); });
  expect(dialog.querySelector("[data-removal-skeleton]")).toBeNull();
  expect(dialog.textContent).toContain(en.sources.removal.workflowLine);
  expect(dialog.textContent).not.toContain(en.sources.removal.openPr);
  expect(dialog.textContent).not.toContain("unsent");
  // 경고 블록이 설명에 이어진다 — 포커스가 [Cancel]에 있어도 무엇이 사라지는지 읽힌다.
  const described = (dialog.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent ?? "").join(" ");
  expect(described).toContain(en.sources.removal.workflowLine);
});

it.each([
  { openPr: "open" as const, line: en.sources.removal.openPr },
  { openPr: "unknown" as const, line: en.sources.removal.prUnknown },
])("미전달 12 + PR $openPr — Alert 하나에 줄 셋", async ({ openPr, line }) => {
  mocks.preview.mockResolvedValue(ready({ pendingCount: 12, approval: "fp", openPr }));
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  const dialog = confirmDialog()!;
  const alerts = dialog.querySelectorAll('[data-removal-warning]');
  expect(alerts).toHaveLength(1);
  expect(alerts[0]!.textContent).toContain(en.repositorySync.unsentCount(12));
  expect(alerts[0]!.textContent).toContain(line);
  expect(alerts[0]!.textContent).toContain(en.sources.removal.workflowLine);
  // 확정 라벨은 트리거와 같은 낱말이다 — Sync처럼 손실로 갈지 않는다.
  expect(inConfirm(en.sources.removal.action)).toBeDefined();
});

it.each([
  { label: "장애 응답", setup: () => mocks.preview.mockResolvedValueOnce({ ok: false, error: "unavailable" }) },
  { label: "throw", setup: () => mocks.preview.mockRejectedValueOnce(new Error("lost")) },
])("지문 발급 실패($label)는 확정을 막고 [Try again]이 다시 받는다", async ({ setup }) => {
  setup();
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  const dialog = confirmDialog()!;
  expect(dialog.textContent).toContain(en.sources.removal.previewFailed);
  const confirm = inConfirm(en.sources.removal.action)!;
  expect(confirm.getAttribute("aria-disabled")).toBe("true");
  await act(async () => { await user().click(confirm); });
  expect(mocks.remove).not.toHaveBeenCalled();
  await act(async () => { await user().click(inConfirm(en.sources.retry)!); });
  expect(mocks.preview).toHaveBeenCalledTimes(2);
  expect(dialog.textContent).not.toContain(en.sources.removal.previewFailed);
  expect(inConfirm(en.sources.removal.action)!.getAttribute("aria-disabled")).toBeNull();
});

it("미리보기가 판정 거부를 내면 그 문장과 [Close]만 남는다", async () => {
  mocks.preview.mockResolvedValue({ ok: false, error: "last-source" });
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  const dialog = confirmDialog()!;
  expect(dialog.textContent).toContain(en.sources.removal.reasons["last-source"]);
  expect(inConfirm(en.sources.removal.action)).toBeUndefined();
  expect(document.activeElement).toBe(inConfirm(en.common.close));
});

it("진행 중에는 닫는 길이 전부 막히고 지문을 그대로 보낸다", async () => {
  let resolve!: (value: unknown) => void;
  mocks.preview.mockResolvedValue(ready({ pendingCount: 3, approval: "fp-3" }));
  mocks.remove.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.sources.removal.action)!); });
  expect(mocks.remove).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", approval: "fp-3" });
  const dialog = confirmDialog()!;
  expect(inConfirm(en.sources.removal.action)!.getAttribute("aria-busy")).toBe("true");
  expect(inConfirm(en.common.cancel)!.getAttribute("aria-disabled")).toBe("true");
  expect((dialog.querySelector(`button[aria-label="${en.common.close}"]`) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { await user().keyboard("{Escape}"); });
  expect(confirmDialog()).toBeDefined();
  await act(async () => { await user().click(inConfirm(en.common.cancel)!); });
  expect(confirmDialog()).toBeDefined();
  await act(async () => { resolve({ ok: false, error: "stale-approval" }); });
});

it("stale-approval은 결과 단계다 — 설명·경고를 걷고 danger 한 장과 [Close]로, 포커스는 [Close]", async () => {
  mocks.preview.mockResolvedValue(ready({ pendingCount: 3, approval: "fp-3" }));
  mocks.remove.mockResolvedValue({ ok: false, error: "stale-approval" });
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.sources.removal.action)!); });
  const dialog = confirmDialog()!;
  expect(dialog.textContent).toContain(en.sources.removal.reasons["stale-approval"]);
  expect(dialog.textContent).not.toContain(en.sources.removal.body);
  expect(dialog.textContent).not.toContain(en.sources.removal.workflowLine);
  expect(inConfirm(en.sources.removal.action)).toBeUndefined();
  expect(document.activeElement).toBe(inConfirm(en.common.close));
  // 다시 열면 새 지문을 받는다 — 같은 창에서 재실행하지 않는다.
  await act(async () => { await user().click(inConfirm(en.common.close)!); });
  await openConfirm();
  expect(mocks.preview).toHaveBeenCalledTimes(2);
  expect(inConfirm(en.sources.removal.action)).toBeDefined();
});

it("응답을 잃은 제거는 확인하지 못했다고 말하고 한 번 refresh한다", async () => {
  mocks.remove.mockRejectedValue(new Error("lost"));
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.sources.removal.action)!); });
  expect(confirmDialog()!.textContent).toContain(en.sources.removal.unconfirmed);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it("성공은 재검증 커밋 뒤에 모달을 닫고 결과 배너를 세우며 포커스는 h1이다", async () => {
  mocks.remove.mockResolvedValue({ ok: true });
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.sources.removal.action)!); });
  // 트리가 오기 전 — 모달이 먼저 닫히고 배너가 선 뒤에야 행이 사라지는 순서를 막는다.
  expect(confirmDialog()).toBeDefined();
  expect(document.body.textContent).not.toContain(en.sources.removal.removed("web"));
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...two, sources: [emails] }} adapters={[]} now={new Date()} />);
  // Radix의 닫힘 포커스 복귀는 다음 태스크에 돈다.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const banner = document.querySelector('[data-sources-screen] [role="status"]');
  expect(banner?.textContent).toContain(en.sources.removal.removed("web"));
  expect(banner?.querySelector('a[href="/projects/p/settings"]')).not.toBeNull();
  expect(document.activeElement?.id).toBe("sources-heading");
  // 열린 상세의 재조회가 제거된 소스를 다시 부르지 않는다.
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it("기준 언어 초안이 있어도 [Remove source]는 제거 확인 창 하나만 연다", async () => {
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await act(async () => { await user().click(document.querySelector('[role="combobox"]')!); });
  await act(async () => { await user().click([...document.querySelectorAll('[role="option"]')].find(n => n.textContent === "ko")!); });
  await openConfirm();
  expect(confirmDialog()).toBeDefined();
  expect(document.body.textContent).not.toContain(en.sources.discardTitle);
});

it("확인 창을 취소하면 포커스가 [Remove source]로 돌아간다", async () => {
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.common.cancel)!); });
  expect(confirmDialog()).toBeUndefined();
  expect(document.activeElement).toBe(removeTrigger());
});
