// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **번역 작업 화면 — 한 소유자가 draft와 이동을 든다** (translation-rework T13–T15 — spec §3.4·§3.5·§3.6).
 *
 * - blur·Tab은 저장하지 않는다. Save 한 번이 그 키의 바뀐 로케일 전부를 보낸다. Ctrl/Cmd+Enter는 키 저장, Escape는 그 입력만 취소.
 * - 미저장이 있으면 다른 키·트리·필터로 가기 전에 440 확인창이 선다. 취소는 URL·draft 불변, 확인은 목적지로 **한 번만** 간다.
 * - Publish는 draft를 버리지 않고 기존 미리보기로 간다. Revert는 OWNER만 실행하고 EDITOR에게는 꺼진 버튼 + 사유다.
 * ⚠️ 실제 사용자 이벤트로 잰다 — 판정 함수가 green인 것과 화면이 그것을 쓰는 것은 다른 사실이다.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  save: vi.fn(), preview: vi.fn(), revert: vi.fn(), pull: vi.fn(), publishPreview: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({
  saveTranslationKey: mocks.save, previewTranslationRevert: mocks.preview, revertTranslationKey: mocks.revert, triggerPullAction: mocks.pull,
}));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.publishPreview }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { DEFAULT_TRANSLATION_QUERY } from "@/lib/translations/query";

import { props } from "./helpers/workspace-props";
import { m } from "@/lib/i18n";


const area = (container: HTMLElement, code: string) => {
  const node = container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`);
  if (!node) throw new Error(`no textarea ${code}`);
  return node;
};
const button = (label: string | RegExp) => {
  const all = [...document.querySelectorAll<HTMLButtonElement>("button")];
  const found = all.find(b => typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? ""));
  if (!found) throw new Error(`no button ${label}`);
  return found;
};
const row = (container: HTMLElement, key: string) => {
  const node = [...container.querySelectorAll<HTMLElement>("[data-key-row]")].find(el => el.dataset.keyRow === key);
  if (!node) throw new Error(`no row ${key}`);
  return node;
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  // 세션 복구 사본이 테스트 사이에 남으면 앞 테스트의 draft가 복원된다 — 복구가 동작한다는 뜻이지만 격리가 먼저다.
  window.sessionStorage.clear();
  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }] });
});

it("선택 키의 활성 언어를 base 우선으로 그리고, 빈 칸에는 원문 도움말을 형제로 묶는다", async () => {
  const { container } = await render(<TranslationWorkspace {...props()} />);
  expect([...container.querySelectorAll("textarea")].map(t => t.dataset.locale)).toEqual(["en", "ko", "zh"]);
  const zh = area(container, "zh");
  expect(zh.value).toBe("");
  expect(zh.placeholder).toBe("");
  const help = document.getElementById(zh.getAttribute("aria-describedby") ?? "");
  expect(help?.textContent).toBe("Nothing here");
  expect(container.textContent).toContain("1 missing");
});

it("blur·Tab은 저장하지 않는다 — Save가 바뀐 로케일만 한 번에 보낸다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  expect(button("Save").disabled).toBe(true);
  await user.type(area(container, "zh"), "空");
  await user.tab();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(container.textContent).toContain("1 unsaved change");
  await user.click(button("Save"));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledWith({ slug: "acme", surfaceSlug: "web", keyId: "k1", changes: [{ localeCode: "zh", value: "空" }] });
  expect(container.textContent).not.toContain("unsaved change");
});

it("Ctrl/Cmd+Enter는 키 저장, Escape는 그 입력만 되돌린다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "ko"), "!");
  await user.type(area(container, "zh"), "空");
  await user.keyboard("{Escape}");
  expect(area(container, "zh").value).toBe("");
  expect(area(container, "ko").value).toBe("비어 있음!");
  await user.click(area(container, "ko"));
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ changes: [{ localeCode: "ko", value: "비어 있음!" }] }));
});

// 키 선택은 `replace`다 (audit-ux #33 · D2) — 뒤로가기가 키 한 칸씩 거슬러 가지 않는다.
it("미저장이 없으면 다른 키로 바로 간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.click(row(container, "k2"));
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(mocks.replace.mock.calls[0]?.[0]).toContain("key=k2");
});

it("미저장이 있으면 확인창이 서고, 취소는 URL·draft 불변, 확인은 한 번만 간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(row(container, "k2"));
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Discard your changes?");
  expect(document.body.textContent).toContain("zh");
  await user.click(button("Keep editing"));
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(area(container, "zh").value).toBe("空");
  await user.click(row(container, "k2"));
  await user.click(button("Discard changes"));
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(mocks.replace.mock.calls[0]?.[0]).toContain("key=k2");
});

it("저장 중에는 Save를 다시 보내지 않고, 보낸 뒤 친 입력은 Not saved로 남는다", async () => {
  const user = userEvent.setup();
  let finish: (value: unknown) => void = () => {};
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  await user.click(button("Save"));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await user.type(area(container, "zh"), "!");
  await act(async () => { finish({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }] }); });
  expect(area(container, "zh").value).toBe("空!");
  expect(container.textContent).toContain("Not saved");
});

it("Publish는 미저장을 버리지 않는다 — 확인창에서 Keep editing이면 입력으로 돌아간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button(/^Publish/));
  expect(document.body.textContent).toContain("Publish without saving your changes?");
  await user.click(button("Keep editing"));
  expect(area(container, "zh").value).toBe("空");
  expect(mocks.publishPreview).not.toHaveBeenCalled();
});

it("EDITOR에게 Revert와 Sync는 숨기지 않고 꺼진 채 사유를 붙인다", async () => {
  const { container } = await render(<TranslationWorkspace {...props({ role: "EDITOR" })} />);
  const revert = button("Revert to last sent");
  expect(revert.getAttribute("aria-disabled")).toBe("true");
  expect(container.textContent).toContain("Only project owners can revert to a sent version.");
  expect(button("Sync").getAttribute("aria-disabled")).toBe("true");
});

it("OWNER의 Revert는 미리보기 확인창을 거쳐 발급된 지문으로 실행하고, 결과 영역으로 포커스를 옮긴다", async () => {
  const user = userEvent.setup();
  mocks.preview.mockResolvedValue({ status: "ready", locales: [{ code: "ko", before: "비어 있음", after: "없음" }], confirmation: "f".repeat(64) });
  mocks.revert.mockResolvedValue({ status: "reverted", cells: [{ localeCode: "ko", value: "없음" }] });
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.click(button("Revert to last sent"));
  expect(mocks.preview).toHaveBeenCalledWith({ slug: "acme", surfaceSlug: "web", keyId: "k1" });
  expect(document.body.textContent).toContain("Revert to the last confirmed version?");
  await user.click(button("Revert"));
  expect(mocks.revert).toHaveBeenCalledWith({ slug: "acme", surfaceSlug: "web", keyId: "k1", confirmation: "f".repeat(64) });
  expect(area(container, "ko").value).toBe("없음");
  expect(document.activeElement?.getAttribute("data-footer-result")).toBe("true");
});

/**
 * ⚠️ **사유는 결과 줄(`aria-live`) 밖이다** — 안에 두면 사유가 바뀔 때마다 결과처럼 다시 낭독된다.
 * 사유의 전달 경로는 `aria-describedby` 하나다.
 */
it("Revert 사유는 describedby로만 닿고 결과 줄의 낭독에 섞이지 않는다", async () => {
  await render(<TranslationWorkspace {...props({ role: "EDITOR" })} />);
  const reason = document.getElementById(button("Revert to last sent").getAttribute("aria-describedby") ?? "");
  expect(reason?.textContent).toBe("Only project owners can revert to a sent version.");
  expect(reason?.closest("[aria-live]")).toBeNull();
});

/** ⚠️ **처리 중에도 `aria-disabled`다** — `loading`은 진짜 `disabled`를 걸어 방금 누른 버튼이 포커스를 잃는다 (DESIGN §6.65). */
it("Revert 미리보기를 기다리는 동안 버튼은 포커스를 지키고 busy 사유를 든다", async () => {
  const user = userEvent.setup();
  mocks.preview.mockReturnValue(new Promise(() => {}));
  await render(<TranslationWorkspace {...props()} />);
  await user.click(button("Revert to last sent"));
  const revert = button("Revert to last sent");
  expect(revert.hasAttribute("disabled")).toBe(false);
  expect(revert.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(revert);
  expect(document.getElementById(revert.getAttribute("aria-describedby") ?? "")?.textContent).toBe("This stays off while a save, publish, or sync is running.");
});

/** ⚠️ 꺼진 Publish는 `aria-disabled`라 클릭 이벤트가 온다 — 미저장 가로채기가 그것을 보내기로 읽으면 확인창이 뜬다. */
it("보낼 것이 없는 Publish는 미저장이 있어도 확인창을 열지 않는다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props({ unpublished: 0 })} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Publish"));
  expect(document.body.textContent).not.toContain("Publish without saving your changes?");
  expect(mocks.publishPreview).not.toHaveBeenCalled();
});

it("미저장이 있으면 Revert를 실행하지 않고 사유를 보인다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  expect(button("Revert to last sent").getAttribute("aria-disabled")).toBe("true");
  expect(container.textContent).toContain("Save or discard your changes first.");
});

it("저장 응답이 유실되면 '확인 불가'로 말하고 draft를 지키며 전혀 저장 안 됐다고 단정하지 않는다", async () => {
  const user = userEvent.setup();
  mocks.save.mockRejectedValue(new Error("network"));
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  expect(container.textContent).toContain("We couldn't confirm the save");
  expect(area(container, "zh").value).toBe("空");
});

it("선택 키가 없으면 키를 고르라는 빈 상태다 — 다른 키를 자동으로 열지 않는다", async () => {
  const { container } = await render(<TranslationWorkspace {...props({ detail: null, query: DEFAULT_TRANSLATION_QUERY })} />);
  expect(container.textContent).toContain("Select a key to translate");
  // 캔버스 2h의 본문 한 줄 — 제목만 두면 무엇이 여기 열리는지 말하지 않는다.
  expect(container.textContent).toContain("Its translations in every language open here.");
  expect(mocks.push).not.toHaveBeenCalled();
});

it("확인창에서 버린 draft는 세션 복구 사본에서도 지운다 — 돌아와도 되살아나지 않는다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  expect(window.sessionStorage.length).toBe(1);
  await user.click(row(container, "k2"));
  await user.click(button("Discard changes"));
  expect(window.sessionStorage.length).toBe(0);
});

it("패널 구분선은 이름을 갖는다 — 이름 없는 separator는 스크린리더가 '구분선'만 읽는다", async () => {
  // design-sync 실측(CDP)에서 aria-label 없이 나간 것을 잡았다. jsdom 렌더에도 시각에도 안 드러나는 부류다.
  const { container } = await render(<TranslationWorkspace {...props()} />);
  const separators = [...container.querySelectorAll<HTMLElement>('[role="separator"]')];
  expect(separators.length).toBeGreaterThan(0);
  for (const node of separators) expect(node.getAttribute("aria-label")?.trim()).toBeTruthy();
});

function stubArea(width: number) {
  // jsdom에는 ResizeObserver가 없어 폭 계획이 null로 남는다 — 핸들 동작을 재려면 영역 폭을 준다.
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    disconnect() {}
    unobserve() {}
  });
}

const workspaceHandle = () => {
  const node = document.querySelector<HTMLElement>('[role="separator"][aria-label="Resize key list"]');
  if (!node) throw new Error("no workspace separator");
  return node;
};

it("포인터가 취소되면 드래그가 끝난다 — 버튼 없이 지나가는 포인터가 폭을 바꾸지 않는다", async () => {
  stubArea(1200);
  try {
    await render(<TranslationWorkspace {...props()} />);
    const handle = workspaceHandle();
    const before = handle.getAttribute("aria-valuenow");
    await act(async () => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 600, pointerId: 1 }));
      handle.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
      handle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 560, pointerId: 1 }));
    });
    expect(handle.getAttribute("aria-valuenow")).toBe(before);
    expect(handle.dataset.state).toBeUndefined();
  } finally { vi.unstubAllGlobals(); }
});

it("움직일 범위가 없으면 핸들은 Tab이 들르지 않고 꺼졌다고 말한다", async () => {
  stubArea(700);
  try {
    await render(<TranslationWorkspace {...props()} />);
    const handle = workspaceHandle();
    expect(handle.getAttribute("aria-valuemin")).toBe(handle.getAttribute("aria-valuemax"));
    expect(handle.tabIndex).toBe(-1);
    expect(handle.getAttribute("aria-disabled")).toBe("true");
  } finally { vi.unstubAllGlobals(); }
});

it("키 목록은 목록 의미를 갖는다 — 스크린리더가 몇 개 중 몇 번째인지 읽는다", async () => {
  const { container } = await render(<TranslationWorkspace {...props()} />);
  const items = [...container.querySelectorAll("[data-key-row]")].map(node => node.closest("li")?.parentElement?.tagName);
  expect(items).toEqual(["UL", "UL"]);
});

/**
 * ⚠️ **접힌 트리 오버레이는 DOM상 키 목록 뒤에 붙는다** (T19 실브라우저 1280×LNB 320에서 잡았다). 포커스를 옮기지 않으면 키보드 사용자는
 * 목록 전체를 Tab으로 지나야 트리에 닿는다 — 키 100개면 100번이다. 열면 선택된 항목으로, 닫으면 토글로 돌아온다.
 */
it("접힌 트리를 열면 포커스가 오버레이의 선택 항목으로 가고, Escape는 토글로 돌려준다", async () => {
  stubArea(700);
  try {
    const user = userEvent.setup();
    await render(<TranslationWorkspace {...props()} />);
    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Show sources"]');
    if (!toggle) throw new Error("no tree toggle");
    await user.click(toggle);
    const overlay = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(overlay).not.toBeNull();
    expect(overlay?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("aria-current")).toBe("true");
    await user.keyboard("{Escape}");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")).toBeNull();
    expect(document.activeElement).toBe(toggle);
  } finally { vi.unstubAllGlobals(); }
});

it("접힌 트리에서 항목을 고르면 오버레이가 닫히고 포커스가 토글로 돌아온다 — body로 떨어지지 않는다", async () => {
  stubArea(700);
  try {
    const user = userEvent.setup();
    await render(<TranslationWorkspace {...props()} />);
    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Show sources"]');
    if (!toggle) throw new Error("no tree toggle");
    await user.click(toggle);
    const common = [...(document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.querySelectorAll("button") ?? [])].find(node => node.textContent?.startsWith("common"));
    if (!common) throw new Error("no namespace item");
    await user.click(common);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

it("셸의 내부 링크도 미저장 확인을 거친다 — 취소 후 유지하고 승인할 때 한 번만 이동한다", async () => {
  const user = userEvent.setup();
  const navigate = vi.fn((event: React.MouseEvent) => event.preventDefault());
  const { container } = await render(<><a href="/projects/acme" onClick={navigate}>Home</a><TranslationWorkspace {...props()} /></>);
  const home = container.querySelector<HTMLAnchorElement>("a")!;
  await user.type(area(container, "zh"), "draft");
  await user.click(home);
  expect(navigate).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Discard your changes?");
  await user.click(button("Keep editing"));
  expect(area(container, "zh").value).toBe("draft");
  expect(mocks.push).not.toHaveBeenCalled();
  await user.click(home);
  await user.click(button("Discard changes"));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/projects/acme");
});

it("새 탭 링크와 수정키 클릭은 현재 draft를 떠나지 않아 가로채지 않는다", async () => {
  const user = userEvent.setup();
  const navigate = vi.fn((event: React.MouseEvent) => event.preventDefault());
  const { container } = await render(<><a href="/projects/acme" onClick={navigate}>Home</a><a href="/account" target="_blank" onClick={navigate}>Account</a><TranslationWorkspace {...props()} /></>);
  await user.type(area(container, "zh"), "draft");
  await user.keyboard("{Control>}");
  await user.click(container.querySelector("a")!);
  await user.keyboard("{/Control}");
  await user.click(container.querySelector('a[target="_blank"]')!);
  expect(navigate).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).not.toContain("Discard your changes?");
});

it("필터 변경 뒤 같은 키가 남아도 Discard는 메모리의 입력까지 버린다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "draft");
  await user.click(container.querySelector<HTMLButtonElement>('button[aria-label^="Completeness:"]')!);
  const option = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(el => el.textContent?.includes("Incomplete"));
  if (!option) throw new Error("no Incomplete option");
  await user.click(option);
  await user.click(button("Discard changes"));
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, completion: "incomplete" }} list={{ ...initial.list, rows: [initial.list.rows[0]!] }} />);
  expect(area(container, "zh").value).toBe("");
  expect(button("Save").disabled).toBe(true);
  expect(window.sessionStorage.length).toBe(0);
});

it("Revert 뒤 같은 셀을 저장하면 Not sent와 Revert가 다시 나타난다", async () => {
  const user = userEvent.setup();
  const initial = props();
  if (initial.detail === null || "absent" in initial.detail) throw new Error("missing fixture detail");
  mocks.preview.mockResolvedValue({ status: "ready", locales: [{ code: "ko", before: "비어 있음", after: "없음" }], confirmation: "f".repeat(64) });
  mocks.revert.mockResolvedValue({ status: "reverted", cells: [{ localeCode: "ko", value: "없음" }] });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.click(button("Revert to last sent"));
  await user.click(button("Revert"));
  const restored = { ...initial.detail, locales: initial.detail.locales.map(l => l.code === "ko" ? { ...l, value: "없음", pending: false } : l) };
  await rerender(<TranslationWorkspace {...initial} detail={restored} />);
  await user.type(area(container, "ko"), "!");
  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "ko", value: "없음!" }] });
  await user.click(button("Save"));
  await rerender(<TranslationWorkspace {...initial} detail={{ ...restored, locales: restored.locales.map(l => l.code === "ko" ? { ...l, value: "없음!", pending: true } : l) }} />);
  expect(button("Revert to last sent").getAttribute("aria-disabled")).toBeNull();
  expect(container.textContent).toContain("Not sent");
});

// 페이지 추가·재검증의 두 회귀(POSTMORTEM 2026-09-23)는 cursor 없는 More로 옮겨 `translation-workspace-transition.test.tsx`가 든다 (audit-ux #19).

/**
 * ⚠️ **세션 만료 Alert는 복구 사본이 실제로 쓰였을 때만 "이 탭에서 다시 로그인하라"고 말한다** (malmoi#76 —
 * ARCHITECTURE §6.04). 저장소가 막힌 브라우저에서 같은 문장을 세우면 로그인 이동이 입력을 지운다.
 */
it("세션이 끝나면 복구 사본이 있는 동안 이 탭에서 다시 로그인하라고 말한다", async () => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: false, error: "unauthorized" });
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  expect(container.textContent).toContain("Your session ended");
  expect(container.textContent).toContain("Sign in again in this tab.");
  expect(container.textContent).not.toContain("this browser isn't keeping it for you");
});

it("저장소가 막힌 브라우저에서는 보존을 약속하지 않고 먼저 복사하라고 말한다", async () => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: false, error: "unauthorized" });
  // 막힌 브라우저는 `window.sessionStorage` 접근 자체가 던진다(SecurityError).
  const original = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => { throw new DOMException("blocked", "SecurityError"); } });
  try {
    const { container } = await render(<TranslationWorkspace {...props()} />);
    await user.type(area(container, "zh"), "空");
    await user.click(button("Save"));
    expect(container.textContent).toContain("Your session ended");
    expect(container.textContent).toContain("Copy your text before you sign in — this browser isn't keeping it for you.");
    expect(container.textContent).not.toContain("Sign in again in this tab.");
    expect(area(container, "zh").value).toBe("空");
  } finally {
    Object.defineProperty(window, "sessionStorage", original);
  }
});

/**
 * audit #23 — 다시 해도 안 풀리는 저장 거부 둘을 "Try again"으로 접지 않는다. 짝: 장애(`unavailable`)는 여전히 재시도 문장이다.
 */
it.each([
  ["key-unavailable", m.translations.workspace.footer.keyGone],
  ["not-ready", m.translations.workspace.footer.notReady],
  ["unavailable", m.translations.workspace.footer.saveFailed.body],
] as const)("저장 거부 %s는 그 사유의 문장이다", async (error, expected) => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: false, error });
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  expect(container.textContent).toContain(expected);
  if (error !== "unavailable") expect(container.textContent).not.toContain(m.translations.workspace.footer.saveFailed.body);
});

/**
 * delivery-invariants D2 — 수술적 표면의 비-base 비우기 거부. 푸터 Alert(제목에 로케일) + 그 셀만 `aria-invalid`·`aria-describedby`로
 * Alert를 가리키고, 입력은 그대로 남는다. 짝: 다른 거부는 기존 `saveFailed` Alert이고 셀에 invalid가 붙지 않는다.
 */
it("cannot-clear 거부는 로케일을 제목에 든 푸터 Alert이고 그 셀만 invalid로 Alert를 가리킨다 · 입력은 남는다", async () => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: false, error: "cannot-clear", localeCodes: ["zh"] });
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  const alert = [...container.querySelectorAll('[role="alert"]')].find(node => node.textContent?.includes(m.translations.workspace.footer.cannotClear.title("zh")));
  expect(alert?.textContent).toContain(m.translations.workspace.footer.cannotClear.body);
  const cell = area(container, "zh");
  expect(cell.getAttribute("aria-invalid")).toBe("true");
  const described = (cell.getAttribute("aria-describedby") ?? "").split(" ");
  expect(described.some(id => id !== "" && document.getElementById(id)?.contains(alert ?? null))).toBe(true);
  expect(cell.value).toBe("空");
  expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1);
});

it("다른 저장 거부에는 셀 invalid가 붙지 않는다 (짝)", async () => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: false, error: "unavailable" });
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  expect(container.textContent).toContain(m.translations.workspace.footer.saveFailed.body);
  expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
});

/** audit #31 — 활성 키가 0인 프로젝트의 빈 목록이 다음 일을 말한다. */
it("활성 키가 없으면 빈 목록이 안내를 든다", async () => {
  const { container } = await render(<TranslationWorkspace {...props({
    detail: null, query: DEFAULT_TRANSLATION_QUERY,
    tree: { projectKeyCount: 0, surfaces: [{ id: "s1", slug: "web", baseLocale: "en", locales: ["en"], keyCount: 0, namespaces: [] }] },
    list: { rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, nextCursor: null, effective: { completion: "all", substituted: false, excludedSurfaceIds: [] }, selectedInResult: false },
  })} />);
  expect(container.textContent).toContain(m.translations.workspace.empty.noActive);
  expect(container.textContent).toContain(m.translations.empty.noKeys.description);
});

/**
 * malmoi#91 — RTL 로케일 셀이 페이지의 `ltr`·`lang="en"`을 상속해 `.(…` 가 반대 끝으로 튀었다. 셀이 자기 방향과 언어를 든다.
 * 짝: LTR 셀은 `ltr` 그대로다(레이아웃 이동 없음). 빈 칸에 겹친 원문은 **base**의 방향·언어를 든다.
 */
it("RTL 로케일 셀은 dir=rtl·lang을 들고 LTR 셀은 ltr이다", async () => {
  const base = props();
  const { container } = await render(<TranslationWorkspace {...props({
    tree: { ...base.tree, surfaces: base.tree.surfaces.map(surface => ({ ...surface, locales: ["en", "ar-SA", "ku-TR"] })) },
    detail: base.detail && {
      ...base.detail,
      locales: [
        { code: "en", isBase: true, value: "Nothing here", needsReview: false, pending: false, actorLabel: null },
        { code: "ar-SA", isBase: false, value: "لا شيء هنا.", needsReview: false, pending: false, actorLabel: null },
        { code: "ku-TR", isBase: false, value: null, needsReview: false, pending: false, actorLabel: null },
      ],
    },
  })} />);
  expect(area(container, "ar-SA").getAttribute("dir")).toBe("rtl");
  expect(area(container, "ar-SA").getAttribute("lang")).toBe("ar-SA");
  expect(area(container, "en").getAttribute("dir")).toBe("ltr");
  expect(area(container, "en").getAttribute("lang")).toBe("en");
  expect(area(container, "ku-TR").getAttribute("dir")).toBe("auto");
  // 빈 ku-TR 칸에 겹친 원문은 en이다 — 셀의 방향을 따르면 영어 원문이 오른쪽에 붙는다.
  const hint = area(container, "ku-TR").parentElement?.querySelector("span[id]");
  expect(hint?.textContent).toBe("Nothing here");
  expect(hint?.getAttribute("dir")).toBe("ltr");
  expect(hint?.getAttribute("lang")).toBe("en");
});
