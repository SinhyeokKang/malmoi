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
async function openDetailOf(slug: string) { await act(async () => { await user().click([...document.querySelectorAll("[data-source-row]")].find(row => row.textContent?.startsWith(slug))!); }); }
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

/**
 * 리뷰 B2 🟡1 — live region은 **내용보다 먼저** 있어야 한다. 지문이 도착한 순간 내용을 든 채 새로 마운트되면 대부분의 스크린 리더가
 * 첫 내용을 읽지 않고, 포커스는 이미 [Cancel]이라 늘어난 `aria-describedby`도 다시 읽히지 않는다 — 손실 줄이 전달되지 않은 채 확정할 수 있다.
 */
/**
 * #192 — 골격이 고정 66px이었고 실제 한 줄짜리 경고 Alert는 `text-xs` 줄높이로 59px라, 지문이 도착하면 창이 줄어 버튼이 위로 튀었다.
 * 골격은 **대체될 가장 짧은 Alert(워크플로 줄만)와 같은 마크업**에서 높이를 얻는다 — 고정 치수가 없다.
 */
let warningAlertClass = "";
it("경고 Alert의 형 — 아래 골격 단언의 기준값", async () => {
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  warningAlertClass = confirmDialog()!.querySelector("[data-removal-warning]")!.closest("[aria-live='polite'] > *")!.className;
  expect(warningAlertClass).not.toBe("");
});
it("지문 대기 골격은 워크플로 줄만 든 경고 Alert와 같은 마크업이라 높이가 같다 (#192)", async () => {
  mocks.preview.mockReturnValue(new Promise(() => {}));
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  const skeleton = confirmDialog()!.querySelector("[data-removal-skeleton]")!;
  expect(skeleton.getAttribute("aria-hidden")).toBe("true");
  expect(skeleton.querySelector("[class*='h-[']")).toBeNull();
  const shape = skeleton.querySelector("[data-removal-skeleton-shape]")!;
  expect(shape.className).toContain("invisible");
  expect(shape.textContent).toBe(en.sources.removal.workflowLine);
  // 실제 경고 Alert와 같은 형(warning · sm)이라 패딩·줄높이·글리프가 같다 — 클래스가 같은지로 잰다.
  expect(shape.firstElementChild?.className).toBe(warningAlertClass);
});

it("경고 줄 묶음의 live region은 지문 대기 중부터 있고 도착한 줄이 같은 노드에 들어간다", async () => {
  let resolve!: (value: unknown) => void;
  mocks.preview.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  const live = confirmDialog()!.querySelector('[aria-live="polite"]');
  expect(live).not.toBeNull();
  expect(live!.querySelector("[data-removal-skeleton]")).not.toBeNull();
  await act(async () => { resolve(ready({ pendingCount: 12, approval: "fp" })); });
  expect(confirmDialog()!.querySelector('[aria-live="polite"]')).toBe(live);
  expect(live!.textContent).toContain(en.repositorySync.unsentCount(12));
  expect(live!.textContent).toContain(en.sources.removal.workflowLine);
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
  // 제거는 편집을 버리지 않는다 — 재추가 첫 적재가 리포에 값이 있는 칸만 덮는다(ARCHITECTURE §5.9 · 사용자 결정 2026-10-06).
  expect(alerts[0]!.textContent).toContain("Re-adding it later replaces 12 unsent edits with the repository's values.");
  expect(alerts[0]!.textContent).not.toMatch(/discard/i);
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

/** #193 — [Try again]이 사라지면 포커스가 `div[role=dialog]`로 떨어졌다. 창의 첫 포커스와 같은 [Cancel]로 옮긴다(POSTMORTEM 2026-09-24). */
it("[Try again]이 지문을 다시 받으면 포커스는 [Cancel]이다 (#193)", async () => {
  mocks.preview.mockResolvedValueOnce({ ok: false, error: "unavailable" });
  await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.sources.retry)!); });
  expect(confirmDialog()!.textContent).toContain(en.sources.removal.workflowLine);
  expect(document.activeElement).toBe(inConfirm(en.common.cancel));
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

/**
 * 응답을 잃은 제거 — 서버가 끝냈을 수 있다. ⚠️ **결과를 확인 창에 두지 않는다**(리뷰 🟡1 · POSTMORTEM 2026-09-07): refresh가 바꾼 `data`가
 * 상세를 다시 읽고, 제거됐으면 `rejected`가 되어 상세째 확인 창이 사라지며 문장을 씻었다. 호스트 배너로 올리고 상세를 닫는다.
 */
it("응답을 잃은 제거는 상세를 닫고 배너로 확인하지 못했다고 말하며 한 번 refresh한다", async () => {
  mocks.remove.mockRejectedValue(new Error("lost"));
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.sources.removal.action)!); });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  // refresh 트리가 와도(제거됐든 아니든) 배너는 남고 상세를 다시 읽지 않는다.
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...two, sources: [emails] }} adapters={[]} now={new Date()} />);
  expect(document.querySelector('[data-sources-screen] [role="status"]')?.textContent).toContain(en.sources.removal.unconfirmed);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  // 상세 모달이 다시 닫힐 수 있다 — 화면이 바쁨에 묶이지 않았다.
  await openDetailOf("emails");
  expect(button(en.common.close)?.disabled).toBe(false);
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

/** 리뷰 🔴1 — 성공 뒤 확인 창 열림 상태가 남아, 다른 소스를 열면 누르지 않은 제거 확인 창이 떴다. */
it("제거 성공 뒤 다른 소스를 열면 확인 창 없이 상세만 열린다", async () => {
  mocks.remove.mockResolvedValue({ ok: true });
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await openConfirm();
  await act(async () => { await user().click(inConfirm(en.sources.removal.action)!); });
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...two, sources: [emails] }} adapters={[]} now={new Date()} />);
  mocks.load.mockResolvedValue({ ok: true, detail: detail({ id: "s-emails", slug: "emails" }) });
  mocks.preview.mockClear();
  await openDetailOf("emails");
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(mocks.preview).not.toHaveBeenCalled();
});

/** 리뷰 🟡2 — 확인 창이 마운트될 때 호스트의 바쁨을 false로 덮었다. 첫 Sync가 도는 동안 상세가 다시 그려지면 닫기가 풀렸다. */
it("확인 창의 마운트는 호스트의 바쁨을 건드리지 않는다", async () => {
  let finish: (value: unknown) => void = () => {};
  mocks.load.mockResolvedValue({ ok: true, detail: detail({ lastCommitSha: null }) });
  mocks.runFirstIngest.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={two} adapters={[]} now={new Date()} />);
  await openDetail();
  await act(async () => { await user().click(button("Run first sync")!); });
  // 상세가 한 번 실패를 거쳐 다시 ready가 된다 — 확인 창이 새로 마운트된다.
  mocks.load.mockResolvedValueOnce({ rejected: "not-found" }).mockResolvedValue({ ok: true, detail: detail({ lastCommitSha: null }) });
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...two }} adapters={[]} now={new Date()} />);
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...two }} adapters={[]} now={new Date()} />);
  expect(button(en.common.close)?.disabled).toBe(true);
  await act(async () => { finish({ ok: true, count: 1, failed: 0 }); });
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
