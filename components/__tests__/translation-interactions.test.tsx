// @vitest-environment jsdom
import { act, Component, type ReactNode } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, find, input } from "./helpers/dom";

const actions = vi.hoisted(() => ({ save: vi.fn(), publish: vi.fn() }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslation: actions.save, triggerPullAction: actions.publish }));
import { TranslationInput } from "@/components/translation-input";
import { PublishButton } from "@/components/publish-button";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Page failed</p> : this.props.children; }
}
const props = { surfaceSlug: "default", slug: "demo", keyId: "k", keyName: "title", localeCode: "ko", initialValue: "original" };
beforeEach(() => { actions.save.mockReset(); actions.publish.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

it("저장 요청이 reject해도 작성값과 재시도 버튼이 남는다", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  actions.save.mockRejectedValue(new Error("private transport details"));
  const { container } = await render(<Boundary><TranslationInput {...props} /></Boundary>);
  const area = find<HTMLTextAreaElement>(container, "textarea");
  await input(area, "draft");
  await act(async () => { area.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  expect(container.textContent).not.toContain("Page failed");
  expect(find<HTMLTextAreaElement>(container, "textarea").value).toBe("draft");
  expect(find<HTMLButtonElement>(container, "button").disabled).toBe(false);
  expect(container.textContent).not.toContain("private transport details");
  actions.save.mockResolvedValue({ ok: true, value: "draft" });
  await act(async () => find<HTMLButtonElement>(container, "button").click());
  expect(find<HTMLTextAreaElement>(container, "textarea").getAttribute("aria-invalid")).toBe("false");
});

it("Publish 요청이 reject하면 결과 슬롯으로 실패를 돌려준다", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  actions.publish.mockRejectedValue(new Error("private transport details"));
  const onResult = vi.fn();
  const { container } = await render(<Boundary><PublishButton slug="demo" count={1} onResult={onResult} /></Boundary>);
  await act(async () => find<HTMLButtonElement>(container, "button").click());
  expect(onResult).toHaveBeenCalledWith({ status: "failed", error: "unavailable" });
  expect(container.textContent).not.toContain("Page failed");
  expect(find<HTMLButtonElement>(container, "button").disabled).toBe(false);
});

it("미편집 셀은 재검증된 서버 값을 표시한다", async () => {
  const { container, rerender } = await render(<TranslationInput {...props} />);
  await rerender(<TranslationInput {...props} initialValue="from repository" />);
  expect(find<HTMLTextAreaElement>(container, "textarea").value).toBe("from repository");
});

it("서버 값이 바뀌어도 작성 중인 값은 보존하고 취소 기준만 갱신한다", async () => {
  const { container, rerender } = await render(<TranslationInput {...props} />);
  const area = find<HTMLTextAreaElement>(container, "textarea");
  await input(area, "local draft");
  await rerender(<TranslationInput {...props} initialValue="from repository" />);
  expect(area.value).toBe("local draft");
  await act(async () => { area.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(area.value).toBe("from repository");
});

it("저장 중 재검증이 도착해도 입력을 덮지 않고 저장 응답으로 확정한다", async () => {
  let finish: (value: { ok: true; value: string }) => void = () => {};
  actions.save.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { container, rerender } = await render(<TranslationInput {...props} />);
  const area = find<HTMLTextAreaElement>(container, "textarea");
  await input(area, "local draft");
  await act(async () => { area.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  await rerender(<TranslationInput {...props} initialValue="other edit" />);
  expect(area.value).toBe("local draft");
  await act(async () => { finish({ ok: true, value: "local draft" }); });
  expect(area.value).toBe("local draft");
});

it.each(["returned", "rejected"])("pending server updates remain the cancel baseline after a %s failure", async (failure) => {
  let finish = () => {};
  actions.save.mockImplementationOnce(() => new Promise((resolve, reject) => {
    finish = () => failure === "rejected"
      ? reject(new Error("transport failure"))
      : resolve({ ok: false, error: "unavailable" });
  }));
  const { container, rerender } = await render(<TranslationInput {...props} />);
  const area = find<HTMLTextAreaElement>(container, "textarea");
  await input(area, "local draft");
  await act(async () => { area.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  expect(area.disabled).toBe(true);
  await rerender(<TranslationInput {...props} initialValue="other edit" />);
  await rerender(<TranslationInput {...props} initialValue="latest edit" />);
  expect(area.value).toBe("local draft");
  await act(async () => finish());
  expect(area.value).toBe("local draft");
  expect(area.getAttribute("aria-invalid")).toBe("true");
  expect(find<HTMLButtonElement>(container, "button").disabled).toBe(false);
  await act(async () => { area.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(area.value).toBe("latest edit");
  // 옛 값으로 되돌리는 편집도 최신 서버 값과 다르면 실제 저장해야 한다.
  await input(area, "original");
  actions.save.mockResolvedValueOnce({ ok: true, value: "original" });
  await act(async () => find<HTMLButtonElement>(container, "button").click());
  expect(actions.save).toHaveBeenCalledTimes(2);
  expect(area.getAttribute("aria-invalid")).toBe("false");
});
