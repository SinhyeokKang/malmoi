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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/(edit)/actions", () => ({
  saveTranslationKey: mocks.save, previewTranslationRevert: mocks.preview, revertTranslationKey: mocks.revert, triggerPullAction: mocks.pull,
}));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.publishPreview }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { DEFAULT_TRANSLATION_QUERY } from "@/lib/translations/query";

import { props } from "./helpers/workspace-props";


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

it("미저장이 없으면 다른 키로 바로 간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.click(row(container, "k2"));
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(mocks.push.mock.calls[0]?.[0]).toContain("key=k2");
});

it("미저장이 있으면 확인창이 서고, 취소는 URL·draft 불변, 확인은 한 번만 간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(row(container, "k2"));
  expect(mocks.push).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Discard your changes?");
  expect(document.body.textContent).toContain("zh");
  await user.click(button("Keep editing"));
  expect(mocks.push).not.toHaveBeenCalled();
  expect(area(container, "zh").value).toBe("空");
  await user.click(row(container, "k2"));
  await user.click(button("Discard changes"));
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(mocks.push.mock.calls[0]?.[0]).toContain("key=k2");
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
  expect(container.textContent).toContain("Only the project owner can revert to a sent version.");
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
  expect(container.textContent).toContain("We couldn't confirm the save.");
  expect(area(container, "zh").value).toBe("空");
});

it("선택 키가 없으면 키를 고르라는 빈 상태다 — 다른 키를 자동으로 열지 않는다", async () => {
  const { container } = await render(<TranslationWorkspace {...props({ detail: null, query: DEFAULT_TRANSLATION_QUERY })} />);
  expect(container.textContent).toContain("Select a key to translate");
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
