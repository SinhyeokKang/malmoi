// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SyncButton as Control } from "@/components/home/sync-button";
import { SyncResult } from "@/components/home/sync-result";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import { render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ run: vi.fn(), pr: vi.fn(), refresh: vi.fn(), prepare: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const success: RepositoryImportOutcome = { ok: true, remainingEdits: 0, surfaces: [{ surfaceSlug: "web", status: "imported", count: 0, failed: 0, unmanaged: 0, reason: null, errors: [] }] };
const props = { slug: "acme", surfaceSlug: "web", name: "malmoi web", branch: "main", role: "OWNER" as const, unsent: 0, onResult: vi.fn() };
function SyncButton(props: Omit<React.ComponentProps<typeof Control>, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return <Control {...props} open={open} onOpenChange={setOpen} />;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!node) throw new Error(`Missing accessible button: ${name}`);
  return node;
}
function dialog() { return document.querySelector('[role="dialog"]'); }
async function click(name: string) { await act(async () => userEvent.setup().click(button(name))); }
beforeEach(() => { vi.clearAllMocks(); mocks.pr.mockResolvedValue(null); mocks.run.mockResolvedValue(success); mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 0 }); });

it("EDITOR에게는 없고 위험이 없는 OWNER도 별도 이름의 danger 확인을 거친다", async () => {
  const view = await render(<SyncButton {...props} role="EDITOR" />);
  expect(document.querySelector("button")).toBeNull();
  await view.rerender(<SyncButton {...props} />);
  await click("Sync");
  expect(button("Sync")).not.toBe(button("Sync from repository"));
  expect(button("Sync from repository").className).toContain("text-destructive");
  expect(mocks.run).not.toHaveBeenCalled();
  await click("Sync from repository");
  expect(mocks.run).toHaveBeenCalledWith({ slug: "acme", approval: "digest-1" });
  expect(props.onResult).toHaveBeenCalledWith(success);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

/**
 * 시안 `4a` — 지울 것이 없으면 **본문 자체가 없다**. "없음"을 한 줄로 세우면 부재가 정보라는 규칙이
 * 깨지고, 빈 본문 블록은 설명문과 푸터 사이에 죽은 공간을 만든다.
 */
it("조용한 갈래는 제목과 설명문뿐이고 포커스가 Cancel에 선다", async () => {
  await render(<SyncButton {...props} />);
  await click("Sync");
  await vi.waitFor(() => expect(document.activeElement).toBe(button("Cancel")));
  expect(dialog()?.textContent).toContain("Sync malmoi web from the repository?");
  expect(dialog()?.textContent).toContain("translation files on main");
  expect(dialog()?.querySelector('[aria-live="polite"]')).toBeNull();
  expect(button("Sync from repository").className).toContain("text-destructive");
});

/**
 * ⚠️ **열릴 때 읽히는 것에 경고가 들어 있어야 한다.** Radix는 `aria-describedby`를 설명문 하나에만
 * 걸어서, 이 Dialog가 유일한 방어선인데도 "무엇이 지워지는지"가 자동 낭독에서 빠져 있었다.
 */
it("확인 Dialog의 접근 가능한 설명이 경고 블록까지 든다", async () => {
  mocks.pr.mockResolvedValue({ number: 42, url: "https://github.com/o/r/pull/42" });
  const view = await render(<SyncButton {...props} unsent={7} />);
  await click("Sync");
  const described = (dialog()?.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  expect(described).toHaveLength(2);
  const text = described.map(id => document.getElementById(id)?.textContent ?? "").join(" ");
  expect(text).toContain("replace what's in the app with them");
  expect(text).toContain("7 unsent translation changes");
  expect(text).toContain("pull request #42");

  // 조용한 갈래에는 경고 블록이 없으므로 설명문 하나만 남는다.
  await click("Cancel");
  await view.rerender(<SyncButton {...props} unsent={0} />);
  mocks.pr.mockResolvedValue(null);
  await click("Sync");
  await vi.waitFor(() => expect((dialog()?.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean)).toHaveLength(1));
  const only = dialog()?.getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(only)?.textContent).toContain("translation files on main");
});

it("실행 중 트리거는 포커스를 받고 클릭과 Enter 연타를 막는다", async () => {
  const run = deferred<RepositoryImportOutcome>(); mocks.run.mockReturnValue(run.promise);
  await render(<SyncButton {...props} />); await click("Sync"); await click("Sync from repository");
  const trigger = button("Syncing…");
  expect(trigger.disabled).toBe(false); expect(trigger.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(trigger);
  await click("Syncing…"); await act(async () => userEvent.setup().keyboard("{Enter}{Enter}"));
  expect(dialog()).toBeNull(); expect(mocks.run).toHaveBeenCalledOnce();
  await act(async () => run.resolve(success));
  expect(trigger.getAttribute("aria-disabled")).toBe("false"); expect(document.activeElement).toBe(trigger);
  expect(trigger.textContent?.trim()).toBe("Sync");
});

/**
 * ⚠️ **조회 중을 실패 문장으로 말하지 않는다** (malmoi#75). 블록은 조회 시작부터 서지만 그 줄은
 * "확인 중"이고, "couldn't check"는 조회가 실제로 실패했을 때만 선다.
 */
it("PR 조회 중에는 확인 중 줄이 서고 성공 null만 경고를 지운다", async () => {
  const pr = deferred<null>(); mocks.pr.mockReturnValue(pr.promise);
  await render(<SyncButton {...props} />); expect(mocks.pr).not.toHaveBeenCalled(); await click("Sync");
  const live = document.querySelector('[aria-live="polite"]')?.textContent ?? "";
  expect(live).toContain("Checking whether anything is still waiting");
  expect(live).not.toContain("couldn't check");
  await act(async () => pr.resolve(null));
  expect(dialog()?.textContent).not.toContain("couldn't check");
  expect(dialog()?.querySelector('[aria-live="polite"]')).toBeNull();
  await click("Cancel"); expect(document.activeElement).toBe(button("Sync"));
});

it("PR 실패도 미확인이고 닫기→재열기에서는 늦은 이전 응답을 무시한다", async () => {
  const old = deferred<{ number: number; url: string }>();
  mocks.pr.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error("offline"));
  await render(<SyncButton {...props} />); await click("Sync"); await click("Cancel"); await click("Sync");
  await act(async () => old.resolve({ number: 42, url: "https://github.com/o/r/pull/42" }));
  expect(dialog()?.textContent).toContain("couldn't check");
  expect(document.querySelector('a[href*="pull/42"]')).toBeNull();
});

/**
 * 시안 `4b`·`4c` 왼쪽 — 미발송과 열린 PR은 **한 블록 안의 두 줄**이고 각각 서거나 빠진다. 수 하나로
 * 요약하면 거짓이 된다: 앱은 "보냈다"까지만 알고 "머지됐다"를 저장하지 않는다.
 */
it("미발송과 열린 PR을 각각의 줄로 말하고 권유는 번역 화면 링크다", async () => {
  mocks.pr.mockResolvedValue({ number: 42, url: "https://github.com/o/r/pull/42" });
  await render(<SyncButton {...props} unsent={7} />); await click("Sync");
  const lines = [...document.querySelectorAll('[aria-live="polite"] p')].map(p => p.textContent ?? "");
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain("Sync will discard 7 unsent translation changes");
  expect(lines[1]).toContain("pull request #42 are not in main yet");
  // audit #28 — 링크가 도착 화면에 실제로 있는 버튼 이름(`Publish`)을 부른다 (POSTMORTEM 2026-09-14).
  // audit-ux #4b — 공가 redirect를 거치지 않고 기본 표면으로 바로 간다.
  expect(document.querySelector('a[href="/projects/acme/surfaces/web/translations"]')?.textContent).toBe("Publish first");
});

/** 번역 화면 안의 [Sync]는 표면을 넘기지 않는다 — 그때는 옛 경로(기본 표면 redirect)로 남는다. */
it("표면을 모르면 권유 링크가 옛 번역 경로다", async () => {
  const { surfaceSlug: _, ...rest } = props;
  await render(<SyncButton {...rest} unsent={7} />); await click("Sync");
  expect(document.querySelector('a[href="/projects/acme/translations"]')?.textContent).toBe("Publish first");
});

/**
 * 시안 `4c` 오른쪽 — **미발송 0 ∧ 열린 PR이 함정이다.** 셀 수 있는 것이 0이라는 말이 위험이 0이라는
 * 말로 읽히므로 `0 edits …` 줄을 세우지 않고, `Send changes first`가 거짓이라 권유가 갈린다.
 */
it("미발송 0이어도 열린 PR이 있으면 경고가 서고 권유가 외부 링크로 갈린다", async () => {
  mocks.pr.mockResolvedValue({ number: 42, url: "https://github.com/o/r/pull/42" });
  await render(<SyncButton {...props} unsent={0} />); await click("Sync");
  const lines = [...document.querySelectorAll('[aria-live="polite"] p')].map(p => p.textContent ?? "");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("pull request #42");
  expect(dialog()?.textContent).not.toContain("0 unsent");
  expect(document.querySelector('a[href="/projects/acme/surfaces/web/translations"]')).toBeNull();
  const link = document.querySelector('a[href*="pull/42"]');
  expect(link?.textContent).toContain("See what's open");
  expect(link?.getAttribute("target")).toBe("_blank");
});

it("Home 호스트는 원결과를 소유해 refresh 후 재렌더에서도 보존한다", async () => {
  function Host({ refreshed }: { refreshed: number }) {
    const [outcome, setOutcome] = useState<RepositoryImportOutcome | null>(null);
    return <div data-refreshed={refreshed}><SyncButton {...props} onResult={setOutcome} /><SyncResult slug="acme" branch="main" outcome={outcome} /></div>;
  }
  const view = await render(<Host refreshed={0} />); await click("Sync"); await click("Sync from repository");
  await view.rerender(<Host refreshed={1} />);
  expect(document.querySelector('[role="status"]')?.textContent).toContain("Synced 0 keys from main");
});

/**
 * ⚠️ **통신 실패에 온보딩 코드를 쓰지 않는다** (2026-09-15 재리뷰 🔴3). `ingest-failed`는 `PLANS`에도
 * `m.repositorySync.errors`에도 없어 **두 폴백을 동시에 탄다**: 계획은 `{warning, 닫기 없음, 액션
 * 없음}`이고 문구는 `onboardErrorMessage`의 *"The first import failed. You can try again from
 * settings."*가 된다 — 첫 적재가 아닌데 그렇게 말하고, **존재하지 않는 버튼**(설정 화면의 옛 재시도 컨트롤,
 * 2026-09-24 삭제)을 가리킨 채 굳는다.
 * 캔버스 §6 `4f`의 tone 표가 이 부류에 `unavailable`을 배정했다(danger · 기존 `errors.access.*`).
 */
it("Action 통신 실패는 렌더 가능한 거부로 떨어지고 다시 실행할 수 있다", async () => {
  mocks.run.mockRejectedValue(new Error("offline"));
  await render(<SyncButton {...props} />); await click("Sync"); await click("Sync from repository");
  expect(props.onResult).toHaveBeenCalledWith({ ok: false, error: "unavailable" });
  expect(button("Sync").getAttribute("aria-disabled")).toBe("false");
});

/**
 * ⚠️ **거부 문구가 이 화면에 없는 컨트롤을 가리키면 안 된다.** `SyncResult`까지 먹여 봐야 드러나는
 * 층이다 — `onResult`의 인자만 보는 테스트는 그 값이 화면에서 무엇이 되는지 모른다.
 */
/**
 * ⚠️ **생산자가 둘이고 서버 쪽이 더 흔하다** (2026-09-15 라운드 3 🔴1). 클라이언트 `catch`는 **Action
 * 호출 자체가 못 간 경우**만 잡고, `runRepositoryImport`의 서버 `catch`는 `openRepoReader`·적재 안에서
 * **던지는 모든 것**(GitHub 5xx · blob 다운로드 throw · pooler 끊김 · 어댑터 예외)을 잡는다.
 * 그래서 **둘 다** 이 화면이 그릴 수 있는 값이어야 한다 — 한쪽만 고치면 증상이 그대로 재생된다.
 *
 * ⚠️ **빌려 온 문장이 이 화면에서 거짓이 되는 자리를 센다**: `onboardErrorMessage`의 "first import"·
 * "from settings"(가리키는 재시도 컨트롤이 이 화면에 없다) · `accessErrorMessage`의 "your text is
 * kept"(`[Sync]`에는 입력이 없고, 하필 이 동작은 **리포 값으로 번역을 덮고 저자까지 비운다** — 그
 * 절이 "내 번역은 안전하다"로 읽히면 불변식이 말하는 것의 정반대다).
 */
it.each(["unavailable", "ingest-failed"] as const)("요청이 못 간 거부(%s)가 닫히고 거짓 문장을 안 쓴다", async (error) => {
  await render(<SyncResult slug="acme" branch="main" outcome={{ ok: false, error }} onDismiss={() => {}} />);
  const alert = document.querySelector('[role="status"], [role="alert"]');
  const text = alert?.textContent ?? "";
  expect(text).not.toContain("first import");
  expect(text).not.toContain("from settings");
  expect(text).not.toContain("your text is kept");
  // 닫을 수 있어야 한다 — 일시적 실패는 "닫아도 같은 거부가 반복된다"에 해당하지 않는다.
  expect(alert?.querySelector('button[aria-label="Dismiss"]')).not.toBeNull();
});

/**
 * ⚠️ **실패에는 `router.refresh()`를 부르지 않는다** (POSTMORTEM 2026-09-08 재발 — 2026-09-15 재리뷰
 * 🔴2). 그 항목의 증상은 *"버튼을 눌렀더니 로그아웃됐고 왜 실패했는지는 어디에도 없다"*였다:
 * `unauthorized`로 거부된 직후의 refresh가 미들웨어의 렌더 차단에 걸려 **네비게이션**이 되고, 방금
 * 세운 거부 Alert를 그대로 씻어 간다. 성공에만 필요하다 — 갱신할 값이 거기에만 있다.
 */
it("거부·실패 결과에는 refresh를 부르지 않고 성공에만 부른다", async () => {
  mocks.run.mockResolvedValue({ ok: false, error: "unauthorized" });
  const view = await render(<SyncButton {...props} />);
  await click("Sync"); await click("Sync from repository");
  expect(props.onResult).toHaveBeenCalledWith({ ok: false, error: "unauthorized" });
  expect(mocks.refresh).not.toHaveBeenCalled();

  mocks.run.mockRejectedValue(new Error("offline"));
  await click("Sync"); await click("Sync from repository");
  expect(mocks.refresh).not.toHaveBeenCalled();

  mocks.run.mockResolvedValue(success);
  await view.rerender(<SyncButton {...props} />);
  await click("Sync"); await click("Sync from repository");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("결과 재시도는 같은 확인 Dialog를 열고 확인 전에는 Action을 호출하지 않는다", async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return <><Control {...props} open={open} onOpenChange={setOpen} /><SyncResult slug="acme" branch="main" onRetry={() => setOpen(true)} outcome={{ ok: true, remainingEdits: 0, surfaces: [{ surfaceSlug: "web", status: "superseded", count: 0, failed: 0, unmanaged: 0, reason: "superseded", errors: [] }] }} /></>;
  }
  await render(<Host />); await click("Try again");
  expect(dialog()).not.toBeNull();
  expect(mocks.pr).toHaveBeenCalledOnce(); expect(mocks.run).not.toHaveBeenCalled();
  await click("Sync from repository"); expect(mocks.run).toHaveBeenCalledOnce();
});

it("권한 변경으로 트리거가 사라지면 Home의 대체 포커스로 복귀한다", async () => {
  const fallback = { current: document.createElement("h2") };
  fallback.current.tabIndex = -1; document.body.append(fallback.current);
  const view = await render(<SyncButton {...props} fallbackFocusRef={fallback} />);
  await click("Sync"); await view.rerender(<SyncButton {...props} role="EDITOR" fallbackFocusRef={fallback} />);
  // Radix restores focus in its deferred unmount callback.
  await vi.waitFor(() => expect(document.activeElement).toBe(fallback.current));
  fallback.current.remove();
});

/**
 * **폐기 승인은 서버가 Dialog를 열 때 발급한 지문이다** (sync-edit-protection T9 — ARCHITECTURE §5.5.2). `discard: true` 같은 boolean을 보내지 않는다 —
 * 서버가 잠금 뒤 재계산해 대조하므로 Dialog 뒤 새 편집·설정 변경이 있으면 거기서 reconfirm이 된다.
 */
it("[C4] Dialog를 열 때 받은 지문을 확정에 싣는다 — 발급 실패면 null을 보내 서버가 재확인을 요구하게 둔다", async () => {
  await render(<SyncButton {...props} unsent={2} />);
  await click("Sync");
  await vi.waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith({ slug: "acme" }));
  await click("Discard changes and sync");
  expect(mocks.run).toHaveBeenCalledWith({ slug: "acme", approval: "digest-1" });

  mocks.prepare.mockRejectedValue(new Error("offline"));
  await click("Sync");
  await vi.waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(2));
  await click("Discard changes and sync");
  expect(mocks.run).toHaveBeenLastCalledWith({ slug: "acme", approval: null });
});

/**
 * **문장을 늘리지 않고 교체한다** (sync-edit-protection T13 — DESIGN §6.2). 경고 블록이 폐기를 한 번 말하고, 같은 사실을 두 번 말하지 않는다.
 */
it("[C4] 미전달 편집의 경고 줄은 discard와 replace를 한 번씩만 말한다 — 취소하면 아무것도 안 부른다", async () => {
  await render(<SyncButton {...props} unsent={3} />);
  await click("Sync");
  const warning = document.querySelector('[aria-live="polite"]')?.textContent ?? "";
  expect(warning).toContain("Sync will discard 3 unsent translation changes and replace them with repository values.");
  expect(warning.match(/discard/g)).toHaveLength(1);
  expect(warning.match(/replace/g)).toHaveLength(1);
  await click("Cancel");
  expect(mocks.run).not.toHaveBeenCalled();
});

/**
 * **지문이 오기 전에는 확정할 수 없다** (audit #14). 전엔 `prepareRepositorySync`가 돌아오기 전에 누르면 `approval: null`이
 * 나가 서버가 reconfirm을 냈고, 화면은 *"Translations changed after you opened Sync"* 라는 **사실과 다른** 문장을 띄웠다.
 * 발급 **실패**는 다르다 — 그때는 확정이 풀리고 `null`을 보내 서버가 재확인을 요구한다(위 [C4]).
 */
it("지문 도착 전 확정은 aria-disabled + 스피너이고 눌러도 Action을 부르지 않는다 — 도착하면 풀린다", async () => {
  const issued = deferred<{ approval: string; unsent: number }>();
  mocks.prepare.mockReturnValue(issued.promise);
  await render(<SyncButton {...props} unsent={2} />);
  await click("Sync");
  const confirm = button("Discard changes and sync");
  expect(confirm.getAttribute("aria-disabled")).toBe("true");
  expect(confirm.querySelector(".animate-spin")).not.toBeNull();
  await click("Discard changes and sync");
  expect(mocks.run).not.toHaveBeenCalled();
  expect(dialog()).not.toBeNull();
  await act(async () => issued.resolve({ approval: "digest-late", unsent: 2 }));
  expect(button("Discard changes and sync").getAttribute("aria-disabled")).not.toBe("true");
  await click("Discard changes and sync");
  expect(mocks.run).toHaveBeenCalledWith({ slug: "acme", approval: "digest-late" });
});
