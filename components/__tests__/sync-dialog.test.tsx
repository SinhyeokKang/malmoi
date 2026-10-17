// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncButton as Control } from "@/components/home/sync-button";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import { en } from "@/messages/en";
import { render } from "./helpers/dom";

// user-event의 실시간 지연이 병렬 실행에서 기본 5초를 넘긴다 (POSTMORTEM 2026-09-13).
vi.setConfig({ testTimeout: 20_000 });

/**
 * sync-lock S5 — **확인 → 진행 → 결과가 한 Dialog다** (spec 완료 조건 3 · design §4). 전엔 확정 즉시 Dialog가 닫히고 결과는 화면의 띠
 * Alert로 따로 섰다. 잠금이 생겨 Sync가 도는 동안 같은 프로젝트의 번역 쓰기가 거부되므로, 누른 사람이 "지금 돌고 있다"를 놓치지 않는
 * 자리가 Dialog 하나여야 한다.
 */
const mocks = vi.hoisted(() => ({ run: vi.fn(), pr: vi.fn(), refresh: vi.fn(), prepare: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const surface = { surfaceSlug: "web", status: "imported" as const, count: 3, failed: 0, unmanaged: 0, reason: null, errors: [] };
const success: RepositoryImportOutcome = { ok: true, remainingEdits: 0, surfaces: [surface] };
const props = { slug: "acme", surfaceSlug: "web", name: "malmoi web", branch: "main", role: "OWNER" as const, unsent: 0, onResult: vi.fn() };
function SyncButton(extra: Partial<React.ComponentProps<typeof Control>>) {
  const [open, setOpen] = useState(false);
  return <Control {...props} {...extra} open={open} onOpenChange={setOpen} />;
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!node) throw new Error(`Missing accessible button: ${name}`);
  return node;
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
async function click(name: string) { await act(async () => userEvent.setup().click(button(name))); }

let pending: { resolve: (value: RepositoryImportOutcome) => void } | null = null;
/** Action을 매달아 둔다 — 테스트 끝에서 반드시 푼다 (POSTMORTEM 2026-09-18 — 안 끝나는 async가 다음 테스트를 얽는다). */
function hang() { const run = deferred<RepositoryImportOutcome>(); mocks.run.mockReturnValue(run.promise); pending = run; return run; }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pr.mockResolvedValue(null);
  mocks.run.mockResolvedValue(success);
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 0, languages: [] });
});
afterEach(async () => {
  if (pending !== null) { const run = pending; pending = null; await act(async () => run.resolve(success)); }
  vi.useRealTimers();
});

it("확정해도 Dialog가 닫히지 않고 확정 버튼이 진행을 든 채 포커스를 지킨다", async () => {
  hang();
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  expect(dialog()).not.toBeNull();
  const confirm = button("Sync from repository");
  expect(confirm.disabled).toBe(false);
  expect(confirm.getAttribute("aria-disabled")).toBe("true");
  expect(confirm.getAttribute("aria-busy")).toBe("true");
  expect(document.activeElement).toBe(confirm);
  expect(button("Cancel").getAttribute("aria-disabled")).toBe("true");
  await click("Sync from repository");
  expect(mocks.run).toHaveBeenCalledOnce();
});

it("진행 중에는 Escape·바깥 클릭·X·Cancel 어느 것으로도 닫히지 않는다", async () => {
  hang();
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await act(async () => userEvent.setup().keyboard("{Escape}"));
  expect(dialog()).not.toBeNull();
  // 바깥 클릭 — Radix는 document의 pointerdown으로 판정한다(모달이라 body가 `pointer-events: none`이어서 user-event로는 못 누른다).
  await act(async () => { document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true })); });
  expect(dialog()).not.toBeNull();
  const close = button("Close");
  // X는 숨기지 않고 끈다 — `OnboardingModal`의 `closeDisabled`와 같은 동작이다.
  expect(close.disabled).toBe(true);
  await click("Cancel");
  expect(dialog()).not.toBeNull();
});

it("성공 결과가 같은 Dialog 본문에 서고 [Close] primary 하나로 닫혀 트리거로 돌아간다", async () => {
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.querySelector('[role="status"]')?.textContent).toContain("Synced 3 keys from main"));
  expect(props.onResult).toHaveBeenCalledWith(success);
  const footer = dialog()?.querySelector("footer");
  expect([...footer?.querySelectorAll("button") ?? []].map(b => b.textContent?.trim())).toEqual(["Close"]);
  const close = footer?.querySelector("button");
  expect(close?.className).toContain("bg-primary");
  await vi.waitFor(() => expect(document.activeElement).toBe(close));
  expect(document.body.textContent).not.toContain("Sync from repository");
  await act(async () => userEvent.setup().click(close!));
  expect(dialog()).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(button("Sync")));
});

it("남은 편집이 있으면 결과가 warning이고 남은 사실을 원인 줄로 말한다", async () => {
  mocks.run.mockResolvedValue({ ok: true, remainingEdits: 2, surfaces: [surface] });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("2 unsent edits were kept"));
  expect(dialog()?.textContent).not.toContain("from main");
});

it("reconfirm의 [Try again]은 같은 Dialog를 확인 단계로 되돌리고 지문을 다시 받는다", async () => {
  mocks.run.mockResolvedValueOnce({ ok: false, error: "reconfirm" });
  mocks.prepare.mockResolvedValueOnce({ approval: "digest-1", unsent: 0, languages: [] }).mockResolvedValueOnce({ approval: "digest-2", unsent: 4, languages: [] });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("nothing was discarded"));
  await click("Try again");
  expect(dialog()).not.toBeNull();
  await vi.waitFor(() => expect(button("Discard changes and sync").getAttribute("aria-disabled")).not.toBe("true"));
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.run).toHaveBeenCalledOnce();
  await click("Discard changes and sync");
  expect(mocks.run).toHaveBeenLastCalledWith({ slug: "acme", approval: "digest-2" });
});

it("already-running은 그 문장과 [Try again]이 선다", async () => {
  mocks.run.mockResolvedValue({ ok: false, error: "already-running" });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("A sync is already running"));
  expect(button("Try again")).toBeTruthy();
});

it("unauthorized는 새 탭 [Sign in]을 든다", async () => {
  mocks.run.mockResolvedValue({ ok: false, error: "unauthorized" });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("Your session ended"));
  const link = dialog()?.querySelector<HTMLAnchorElement>('a[href="/signin"]');
  expect(link?.textContent).toBe("Sign in");
  expect(link?.target).toBe("_blank");
  expect(dialog()?.querySelector('[role="alert"]')).not.toBeNull();
});

it("Action이 throw하면 unconfirmed 결과로 바뀌고 닫기가 돌아온다", async () => {
  const run = deferred<RepositoryImportOutcome>(); mocks.run.mockReturnValue(run.promise);
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await act(async () => run.reject(new Error("offline")));
  await vi.waitFor(() => expect(dialog()?.textContent).toContain(en.repositorySync.resultHeadline.unconfirmed));
  expect(props.onResult).toHaveBeenCalledWith({ ok: false, error: "unconfirmed" });
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(button("Close").disabled).toBe(false);
  await act(async () => userEvent.setup().keyboard("{Escape}"));
  expect(dialog()).toBeNull();
});

it("8초 뒤 지연 문구가 Dialog 안에 서고, 응답 없이 70초가 지나면 Logs 안내와 [Close]가 돌아온다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const run = hang();
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  expect(dialog()?.textContent).not.toContain("Still working");
  await act(async () => { vi.advanceTimersByTime(8_000); });
  expect(dialog()?.textContent).toContain("Still working");
  expect(dialog()?.textContent).not.toContain("The result will be in Logs.");
  await act(async () => { vi.advanceTimersByTime(62_000); });
  expect(dialog()?.textContent).toContain("The result will be in Logs.");
  // 판정을 바꾸는 타이머가 아니다 — 결과 문장을 세우지 않고 확정 버튼은 여전히 진행이다.
  expect(dialog()?.querySelector('[role="alert"]')).toBeNull();
  expect(button("Close").disabled).toBe(false);
  await click("Close");
  expect(dialog()).toBeNull();
  // 늦게 온 응답은 닫힌 Dialog를 다시 열지 않는다 — 호스트에는 알린다(교차 잠금 대기).
  pending = null;
  await act(async () => run.resolve(success));
  expect(dialog()).toBeNull();
  expect(props.onResult).toHaveBeenCalledWith(success);
});

const heading = () => dialog()?.querySelector("h2")?.textContent;

it("결과 단계 제목은 결과별이다 (R6) — 확인 질문을 그대로 두지 않는다", async () => {
  await render(<SyncButton />);
  await click("Sync");
  expect(heading()).toBe("Sync malmoi web from the repository?");
  await click("Sync from repository");
  await vi.waitFor(() => expect(heading()).toBe("Sync complete"));
});

it("[Try again]으로 확인 단계에 돌아오면 포커스가 Cancel이다 — 누른 버튼이 사라져 컨테이너로 빠지지 않는다", async () => {
  mocks.run.mockResolvedValueOnce({ ok: false, error: "already-running" });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(button("Try again")).toBeTruthy());
  await click("Try again");
  await vi.waitFor(() => expect(document.activeElement).toBe(button("Cancel")));
});

it("70초 출구 안내는 status로 알려지고, 그때 닫으면 아직 도는 트리거 대신 화면 제목으로 간다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  hang();
  const fallback = { current: document.createElement("h1") };
  fallback.current.tabIndex = -1; document.body.append(fallback.current);
  try {
    await render(<SyncButton fallbackFocusRef={fallback} />);
    await click("Sync"); await click("Sync from repository");
    await act(async () => { vi.advanceTimersByTime(70_000); });
    const line = [...dialog()?.querySelectorAll('[role="status"]') ?? []].find(node => node.textContent === "The result will be in Logs.");
    expect(line).toBeTruthy();
    await click("Close");
    await vi.waitFor(() => expect(document.activeElement).toBe(fallback.current));
  } finally { fallback.current.remove(); }
});

/**
 * **수동 Sync 확인의 언어 변경 구획** (locale-add 시안 P4) — 셀 편집은 "값이 바뀐다", 언어 변경은 "요청이 없어진다"라 한 수로 합치지 않는다.
 * 블록은 손실이 큰 것부터(편집 → 언어 변경)이고, 언어마다 Sync 뒤 결과 한 줄을 말한다. `Send changes first` 권유는 편집이 있을 때만이다.
 * 언어 목록은 지문과 같은 응답에서만 온다 — 화면 값으로 세우면 동료가 방금 낸 요청을 못 본 채 승인한다(`unsent`와 같은 규칙).
 */
type Language = { surfaceSlug: string; localeCode: string; operation: "ADD" | "REMOVE"; translations: number };
const lang = (localeCode: string, operation: "ADD" | "REMOVE", translations = 0, surfaceSlug = "web"): Language => ({ surfaceSlug, localeCode, operation, translations });
async function openWith(unsent: number, languages: Language[]) {
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent, languages });
  await render(<SyncButton unsent={unsent} />);
  await click("Sync");
  // 지문 응답이 커밋될 때까지 기다린다 — 그 전엔 확정 버튼이 busy다.
  await act(async () => {});
  return dialog()!;
}
const languageBlock = () => document.querySelector<HTMLElement>("[data-sync-languages]");

it("편집과 언어 변경이 함께면 블록이 둘이고 편집 블록이 먼저다", async () => {
  const node = await openWith(12, [lang("fr", "ADD", 9), lang("de", "REMOVE")]);
  const block = languageBlock()!;
  expect(block.textContent).toBe("2 language changes will be dropped.fr won't be added. Its 9 translations are kept in Malmoi.de won't be removed. It stays in this source.");
  // 같은 amber 형의 블록 둘이다 — 편집 경고 · 언어 변경.
  expect(node.querySelectorAll('[data-alert="warning"]')).toHaveLength(2);
  const editLine = [...node.querySelectorAll("p")].find(p => p.textContent?.includes("12 unsent edits"))!;
  expect(editLine.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(node.textContent).toContain(en.repositorySync.sendFirst);
  // 시안 P4 순서 — 편집 → 언어 → 권유. 권유는 두 블록을 다 읽은 뒤의 다음 행동이다(R-E3 Y2).
  const hint = [...node.querySelectorAll("a")].find(a => a.textContent === en.repositorySync.sendFirst)!;
  expect(block.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // 블록은 Dialog 설명에 묶인다 — 무엇이 없어지는지가 열릴 때 읽혀야 한다.
  expect(node.getAttribute("aria-describedby")?.split(" ")).toContain(block.id);
});

it("언어 변경만 있으면 그 블록 하나이고 Send changes first 줄이 없다", async () => {
  const node = await openWith(0, [lang("de", "REMOVE")]);
  expect(languageBlock()!.textContent).toBe("1 language change will be dropped.de won't be removed. It stays in this source.");
  expect(node.textContent).not.toContain(en.repositorySync.sendFirst);
  expect(node.textContent).not.toContain("unsent edit");
});

it("값 없는 추가는 번역 수를 말하지 않는다", async () => {
  await openWith(0, [lang("fr", "ADD", 0)]);
  expect(languageBlock()!.textContent).toBe("1 language change will be dropped.fr won't be added.");
});

it("다섯 개를 넘으면 앞 넷과 and N more로 접는다", async () => {
  await openWith(0, ["ja", "ko", "fr", "de", "es", "it", "pt"].map(code => lang(code, "REMOVE")));
  const lines = [...languageBlock()!.querySelectorAll("li")].map(li => li.textContent);
  expect(lines).toEqual([
    "ja won't be removed. It stays in this source.",
    "ko won't be removed. It stays in this source.",
    "fr won't be removed. It stays in this source.",
    "de won't be removed. It stays in this source.",
    "and 3 more",
  ]);
});

it("다섯 개면 접지 않는다", async () => {
  await openWith(0, ["ja", "ko", "fr", "de", "es"].map(code => lang(code, "REMOVE")));
  expect(languageBlock()!.querySelectorAll("li")).toHaveLength(5);
});

it("소스가 둘 이상이면 언어 줄이 소스를 함께 말한다", async () => {
  await openWith(0, [lang("de", "REMOVE", 0, "web"), lang("fr", "ADD", 2, "emails")]);
  const lines = [...languageBlock()!.querySelectorAll("li")].map(li => li.textContent);
  expect(lines).toEqual(["de (web) won't be removed. It stays in this source.", "fr (emails) won't be added. Its 2 translations are kept in Malmoi."]);
});

it("언어 변경이 없으면 블록이 없다", async () => {
  await openWith(3, []);
  expect(languageBlock()).toBeNull();
});
