// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "./helpers/dom";
import { useLeaveGuard } from "@/components/translations/workspace/use-leave-guard";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const approved = vi.fn();
const blocked = vi.fn<(proceed: () => void) => void>();
function Guard({ dirty = false }: { dirty?: boolean }) {
  useLeaveGuard(dirty, blocked, approved);
  return <a href="/next?key=k2">Next</a>;
}
const click = async (init: MouseEventInit = {}) => {
  // 네이티브 이동만 막는다. document capture 가드는 실제 클릭으로 실행한다.
  const link = document.querySelector("a")!;
  link.addEventListener("click", event => event.preventDefault(), { once: true });
  await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init })); });
};
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/current"); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("승인된 링크만 알리고 dirty 취소는 의도를 바꾸지 않는다", async () => {
  await render(<Guard dirty />);
  await click();
  expect(blocked).toHaveBeenCalledOnce();
  expect(approved).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  await act(async () => { blocked.mock.calls[0]![0](); });
  expect(approved).toHaveBeenCalledOnce();
  expect(push).toHaveBeenCalledWith("/next?key=k2");
  expect(approved.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]!);
});

it.each(["meta", "ctrl", "shift", "alt", "middle", "download", "blank", "origin", "hash"])("새 창/문서 밖 이동은 선택 의도를 바꾸지 않는다: %s", async kind => {
  await render(<Guard />);
  const link = document.querySelector("a")!;
  if (kind === "download") link.setAttribute("download", "file");
  if (kind === "blank") link.target = "_blank";
  if (kind === "origin") link.href = "https://elsewhere.example/next";
  if (kind === "hash") link.href = "/current#anchor";
  await click({ metaKey: kind === "meta", ctrlKey: kind === "ctrl", shiftKey: kind === "shift", altKey: kind === "alt", button: kind === "middle" ? 1 : 0 });
  expect(approved).not.toHaveBeenCalled();
  expect(blocked).not.toHaveBeenCalled();
});

it("clean 링크는 한 번 승인된다", async () => {
  await render(<Guard />);
  await click();
  expect(approved).toHaveBeenCalledOnce();
  expect(blocked).not.toHaveBeenCalled();
});

it.each([false, true])("history 복원 이벤트는 승인되지 않고 확인 후 재이동만 승인된다: dirty=%s", async dirty => {
  const navigation = { currentEntry: { index: 2 } };
  vi.stubGlobal("navigation", navigation);
  const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
  await render(<Guard dirty={dirty} />);
  navigation.currentEntry.index = 1;
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
  if (!dirty) {
    expect(approved).toHaveBeenCalledOnce();
    expect(go).not.toHaveBeenCalled();
    return;
  }
  expect(approved).not.toHaveBeenCalled();
  expect(go).toHaveBeenCalledWith(1);
  navigation.currentEntry.index = 2;
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(approved).not.toHaveBeenCalled();
  await act(async () => { blocked.mock.calls[0]![0](); });
  expect(go).toHaveBeenLastCalledWith(-1);
  navigation.currentEntry.index = 1;
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(approved).toHaveBeenCalledOnce();
});

it("Navigation API가 없는 history는 기존처럼 막지 않고 이동을 알린다", async () => {
  vi.stubGlobal("navigation", undefined);
  await render(<Guard dirty />);
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(approved).toHaveBeenCalledOnce();
  expect(blocked).not.toHaveBeenCalled();
});
