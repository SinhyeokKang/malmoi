// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

import { SearchInput } from "@/components/search-input";

/**
 * **제출 뒤 이어 친 글자를 응답이 되돌리지 않는다** (audit-ux #15). 전엔 `value`가 바뀔 때마다 입력을 URL 값으로 덮어,
 * Enter 뒤 응답을 기다리며 친 글자가 응답 도착과 함께 사라졌다. 번역 화면·Logs·프로젝트 목록이 같은 컴포넌트다.
 */
const field = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="search"]')!;

it("Enter 뒤 이어 친 입력은 제출한 값의 응답이 와도 남는다", async () => {
  const user = userEvent.setup();
  const onSearch = vi.fn();
  const { container, rerender } = await render(<SearchInput value={undefined} label="Search" onSearch={onSearch} />);
  await user.type(field(container), "ab{Enter}");
  expect(onSearch).toHaveBeenCalledWith("ab");
  await user.type(field(container), "c");
  await rerender(<SearchInput value="ab" label="Search" onSearch={onSearch} />);
  expect(field(container).value).toBe("abc");
});

it("제출 뒤 더 치지 않았으면 응답 값으로 맞춘다 — 짝 단언", async () => {
  const user = userEvent.setup();
  const { container, rerender } = await render(<SearchInput value={undefined} label="Search" onSearch={vi.fn()} />);
  await user.type(field(container), "  ab {Enter}");
  await rerender(<SearchInput value="ab" label="Search" onSearch={vi.fn()} />);
  expect(field(container).value).toBe("ab");
});

it("제출하지 않은 바깥 변경(검색 지우기·뒤로가기)은 입력을 URL 값으로 맞춘다", async () => {
  const user = userEvent.setup();
  const { container, rerender } = await render(<SearchInput value="ab" label="Search" onSearch={vi.fn()} />);
  expect(field(container).value).toBe("ab");
  await rerender(<SearchInput value={undefined} label="Search" onSearch={vi.fn()} />);
  expect(field(container).value).toBe("");
  // 제출이 응답을 받은 뒤의 바깥 변경도 같다 — 제출 기억이 다음 변경까지 남아 입력을 붙잡지 않는다.
  await user.type(field(container), "x{Enter}");
  await rerender(<SearchInput value="x" label="Search" onSearch={vi.fn()} />);
  await user.type(field(container), "y");
  await rerender(<SearchInput value={undefined} label="Search" onSearch={vi.fn()} />);
  expect(field(container).value).toBe("");
});

it("width320 preserves trimmed Enter submission and both IME guards", async () => {
  const onSearch = vi.fn();
  const { container } = await render(<SearchInput width={320} value={undefined} label="Search" onSearch={onSearch} />);
  const user = userEvent.setup();
  await act(async () => { await user.type(field(container), "  hello  "); });
  for (const options of [{ isComposing: true }, { keyCode: 229 }]) {
    await act(async () => { field(container).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...options })); });
  }
  expect(onSearch).not.toHaveBeenCalled();
  await act(async () => { await user.keyboard("{Enter}"); });
  expect(onSearch).toHaveBeenCalledExactlyOnceWith("hello");
  expect(field(container).classList.contains("w-80")).toBe(true);
});
