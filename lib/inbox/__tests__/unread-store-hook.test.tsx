// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { setUnread, useInboxUnread } from "../unread-store";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const renders = vi.fn();
function Probe() {
  const unread = useInboxUnread();
  renders(unread);
  return <span>{unread}</span>;
}

afterEach(() => { setUnread(0); renders.mockClear(); vi.restoreAllMocks(); });

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<Probe />));
  return {
    container,
    unmount: async () => { await act(async () => root.unmount()); container.remove(); },
  };
}

it("store 값을 읽고 바뀌면 다시 그린다", async () => {
  setUnread(4);
  const view = await mount();
  expect(view.container.textContent).toBe("4");
  await act(async () => setUnread(11));
  expect(view.container.textContent).toBe("11");
  await act(async () => setUnread(0));
  expect(view.container.textContent).toBe("0");
  await view.unmount();
});

it("해제한 뒤에는 store가 바뀌어도 그리지 않는다", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const view = await mount();
  await view.unmount();
  const before = renders.mock.calls.length;
  await act(async () => setUnread(9));
  expect(renders.mock.calls.length).toBe(before);
  expect(errors).not.toHaveBeenCalled();
});

it("서버 렌더 스냅샷은 store 값과 무관하게 0이다", () => {
  setUnread(5);
  expect(renderToString(<Probe />)).toBe("<span>0</span>");
});

it("하이드레이션 전 서버 스냅샷 0을 쓰고 마운트 뒤 store 값으로 바뀐다", async () => {
  setUnread(3);
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Probe />);
  document.body.append(container);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => { root = hydrateRoot(container, <Probe />, { onRecoverableError: error => errors.push(error) }); });
  // 하이드레이션 렌더가 store 값을 썼다면 텍스트 불일치가 복구 오류로 잡힌다.
  expect(errors).toEqual([]);
  expect(container.textContent).toBe("3");
  await act(async () => root?.unmount());
  container.remove();
});
