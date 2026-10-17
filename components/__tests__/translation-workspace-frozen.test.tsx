// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **제거 예정 언어의 셀 얼리기 — 화면** (locale-add tasks §6 · design §6 · 시안 T1). 서버 상세가 그 언어를 `readOnly`로 싣거나, 렌더와 저장 사이에
 * 제거가 도착해 서버가 키 저장을 `locale-removal-pending`으로 거부하면 그 칸의 입력을 버리지 않고 읽기 전용으로 얼린다. 다른 언어는 그대로 저장한다.
 * ⚠️ 끝나지 않는 저장 promise를 남기지 않는다 (POSTMORTEM 2026-09-18 — 안 끝난 async transition이 뒤 테스트를 붙잡았다). 모든 mock은 곧바로 푼다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: mocks.save, previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import { en } from "@/messages/en";

import { props } from "./helpers/workspace-props";

const w = en.translations.workspace;
const area = (container: HTMLElement, code: string) => container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`)!;
const footer = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-footer-result]")?.textContent ?? "";
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === name);
const saveButton = () => button(w.footer.save)!;
/** 클릭할 수 있을 때까지 기다린다 — 저장 응답 뒤 `loading`이 풀리는 커밋을 지나야 한다. */
async function clickable(name: string): Promise<HTMLButtonElement> {
  for (let i = 0; i < 20; i += 1) {
    const found = button(name);
    if (found !== undefined && !found.disabled) return found;
    await act(async () => { await Promise.resolve(); });
  }
  throw new Error(`${name} never became clickable`);
}

type Detail = Exclude<WorkspaceProps["detail"], null | { absent: true }>;
/** 같은 키의 서버 갱신 — `readOnly`에 든 언어가 제거 예정이다. */
function detailWith(readOnly: readonly string[], values: Partial<Record<string, string | null>> = {}): Detail {
  const base = props().detail as Detail;
  return { ...base, locales: base.locales.map(l => ({ ...l, readOnly: readOnly.includes(l.code), value: Object.hasOwn(values, l.code) ? values[l.code] ?? null : l.value })) };
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => { window.sessionStorage.clear(); });

it("서버 갱신이 제거를 알리면 그 칸의 입력을 남기고 얼린다 — 이유 문장 · Discard change · 다른 언어만 저장", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  await user.clear(area(container, "ko"));
  await user.type(area(container, "ko"), "없음");
  await rerender(<TranslationWorkspace {...initial} detail={detailWith(["zh"])} />);

  expect(area(container, "zh").value).toBe("空");
  expect(area(container, "zh").readOnly).toBe(true);
  expect(area(container, "ko").readOnly).toBe(false);
  expect(container.textContent).toContain(w.detail.frozenReason("zh"));
  expect(button(w.detail.discardChange)).toBeDefined();
  expect(footer(container)).toBe(w.footer.frozen("ko", "zh"));
  // 분모는 작업 언어만 — 제거 예정 칸은 빠진다(시안 T1 "2 of 2 languages").
  expect(container.textContent).toContain(w.detail.languages(2, 2));

  // 얼린 칸은 타이핑을 받지 않는다.
  await user.type(area(container, "zh"), "!");
  expect(area(container, "zh").value).toBe("空");

  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "ko", value: "없음" }] });
  await user.click(saveButton());
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({ changes: [{ localeCode: "ko", value: "없음" }] });
  // 저장 뒤에도 얼린 입력은 남고, 보낼 것이 없어 Save가 꺼진다.
  expect(area(container, "zh").value).toBe("空");
  expect(footer(container)).toBe(w.footer.frozen("", "zh"));
  expect(saveButton().disabled).toBe(true);
});

it("얼린 칸만 미저장이면 Save가 꺼지고, Discard change가 그 입력을 버린다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  await rerender(<TranslationWorkspace {...initial} detail={detailWith(["zh"])} />);
  expect(saveButton().disabled).toBe(true);
  expect(footer(container)).toBe(w.footer.frozen("", "zh"));

  await user.click(await clickable(w.detail.discardChange));
  expect(area(container, "zh").value).toBe("");
  // 누른 버튼이 사라진다 — 포커스가 body로 빠지지 않고 그 칸에 선다.
  expect(document.activeElement).toBe(area(container, "zh"));
  expect(area(container, "zh").readOnly).toBe(true);
  expect(button(w.detail.discardChange)).toBeUndefined();
  expect(container.textContent).not.toContain(w.detail.frozenReason("zh"));
  expect(footer(container)).toBe("");
});

it("이탈 확인이 얼린 입력을 센다 — 버린 적 없는 입력이다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  await rerender(<TranslationWorkspace {...initial} detail={detailWith(["zh"])} />);
  const target = [...container.querySelectorAll<HTMLElement>("[data-key-row]")].find(el => el.dataset.keyRow === "k2")!;
  await user.click(target);
  expect(document.body.textContent).toContain(w.discard.title);
  expect(document.body.textContent).toContain(w.discard.body("common.empty", "zh", 1));
});

it("저장이 제거로 거부되면 입력을 남기고 그 칸을 곧바로 얼리며, 전용 문장이 키 전체가 저장되지 않았음을 말한다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  await user.clear(area(container, "ko"));
  await user.type(area(container, "ko"), "없음");
  mocks.save.mockResolvedValue({ ok: false, error: "locale-removal-pending", localeCodes: ["zh"] });
  await user.click(saveButton());

  expect(area(container, "zh").value).toBe("空");
  expect(area(container, "ko").value).toBe("없음");
  expect(container.textContent).toContain(w.footer.removalPending.title("zh", 1));
  expect(container.textContent).toContain(w.footer.removalPending.body);
  expect(container.textContent).not.toContain(w.footer.saveFailed.title);
  // 다시 누를 필요 없이 ①의 형이다 — 서버 상세를 기다리지 않고 얼리고, 서버 상태를 다시 읽는다.
  expect(area(container, "zh").readOnly).toBe(true);
  expect(container.textContent).toContain(w.detail.frozenReason("zh"));
  expect(area(container, "zh").getAttribute("aria-invalid")).toBe("true");
  expect(mocks.refresh).toHaveBeenCalled();

  // 다음 Save는 다른 언어만 보내고, 성공하면 거부 문장이 상태 문장으로 바뀐다.
  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "ko", value: "없음" }] });
  await user.click(await clickable(w.footer.save));
  expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({ changes: [{ localeCode: "ko", value: "없음" }] });
  expect(container.textContent).not.toContain(w.footer.removalPending.body);
  expect(footer(container)).toBe(w.footer.frozen("", "zh"));
});

it("거부 뒤 도착한 서버 상세가 같은 언어를 읽기 전용으로 실어도 거부 문장은 남는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  mocks.save.mockResolvedValue({ ok: false, error: "locale-removal-pending", localeCodes: ["zh"] });
  await user.click(saveButton());
  await rerender(<TranslationWorkspace {...initial} detail={detailWith(["zh"])} />);
  expect(area(container, "zh").value).toBe("空");
  expect(area(container, "zh").readOnly).toBe(true);
  expect(container.textContent).toContain(w.footer.removalPending.title("zh", 1));
});

it("세션 만료 중 저장이 거부돼도 얼린 입력과 다른 언어 입력이 남는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  await user.clear(area(container, "ko"));
  await user.type(area(container, "ko"), "없음");
  await rerender(<TranslationWorkspace {...initial} detail={detailWith(["zh"])} />);
  mocks.save.mockResolvedValue({ ok: false, error: "unauthorized" });
  await user.click(saveButton());
  expect(container.textContent).toContain(w.footer.session.title);
  expect(area(container, "zh").value).toBe("空");
  expect(area(container, "ko").value).toBe("없음");
  // 복구 사본에도 얼린 입력이 실린다 — 다시 로그인한 탭이 되살린다.
  expect(JSON.parse(window.sessionStorage.getItem("malmoi.translation-draft.u1.acme") ?? "null")).toMatchObject({ keyId: "k1", draft: { zh: "空", ko: "없음" } });
});

it("다시 로그인한 탭은 얼린 칸의 입력도 복구 사본에서 되살린다", async () => {
  window.sessionStorage.setItem("malmoi.translation-draft.u1.acme", JSON.stringify({
    surfaceSlug: "web", keyId: "k1", saved: { en: "Nothing here", ko: "비어 있음", zh: "" }, draft: { en: "Nothing here", ko: "비어 있음", zh: "空" },
  }));
  const { container } = await render(<TranslationWorkspace {...props({ detail: detailWith(["zh"]) })} />);
  expect(area(container, "zh").value).toBe("空");
  expect(area(container, "zh").readOnly).toBe(true);
  expect(container.textContent).toContain(w.detail.frozenReason("zh"));
});

it("제거가 취소되면 얼린 입력을 그대로 편집·저장한다 — 복구 동작 없음", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  await rerender(<TranslationWorkspace {...initial} detail={detailWith(["zh"])} />);
  await rerender(<TranslationWorkspace {...initial} detail={detailWith([])} />);
  expect(area(container, "zh").readOnly).toBe(false);
  expect(area(container, "zh").value).toBe("空");
  expect(button(w.detail.discardChange)).toBeUndefined();
  expect(footer(container)).toBe(w.footer.unsaved(1));
  expect(container.textContent).toContain(w.detail.languages(2, 3));
  await user.type(area(container, "zh"), "!");
  expect(area(container, "zh").value).toBe("空!");
  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空!" }] });
  await user.click(await clickable(w.footer.save));
  expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({ changes: [{ localeCode: "zh", value: "空!" }] });
});

it("거부 뒤 제거가 취소되면 거부 문장을 걷는다 — 더는 참이 아니다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh"), "空");
  mocks.save.mockResolvedValue({ ok: false, error: "locale-removal-pending", localeCodes: ["zh"] });
  await user.click(saveButton());
  expect(container.textContent).toContain(w.footer.removalPending.body);
  await rerender(<TranslationWorkspace {...initial} detail={detailWith([])} />);
  expect(container.textContent).not.toContain(w.footer.removalPending.body);
  expect(area(container, "zh").readOnly).toBe(false);
  expect(area(container, "zh").value).toBe("空");
  expect(footer(container)).toBe(w.footer.unsaved(1));
});
