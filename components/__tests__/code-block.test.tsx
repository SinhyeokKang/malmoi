// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeBlock } from "@/components/ui/code-block";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

/**
 * 코드 블록 (DESIGN §6.4 · §6.61) — `/docs` 원고와 앱의 워크플로 YAML이 같은 프리미티브를 쓴다(2026-10-01 사용자 — docs 형으로 맞춘다).
 * Copy는 2초간 `Copied` · visually-hidden live region · 실패는 라벨로 말한다.
 */
const writeText = vi.fn<(value: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const button = (container: HTMLElement) => container.querySelector("button")!;
const live = (container: HTMLElement) => container.querySelector('[role="status"][aria-live="polite"]')!;
const click = async (container: HTMLElement) => {
  await act(async () => {
    button(container).click();
  });
};

describe("CodeBlock — Copy", () => {
  it("누르면 코드 원문을 복사하고 `Copied` + live region이 알린다", async () => {
    const { container } = await render(<CodeBlock code="on: push" filename={null} />);
    expect(live(container).textContent).toBe("");
    await click(container);
    expect(writeText).toHaveBeenCalledWith("on: push");
    expect(button(container).textContent).toBe(m.common.copied);
    expect(live(container).textContent).toBe(m.common.copied);
  });

  it("2초 뒤 `Copy`로 돌아온다", async () => {
    const { container } = await render(<CodeBlock code="x" filename="a.yml" />);
    await click(container);
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(button(container).textContent).toBe(m.common.copied);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(button(container).textContent).toBe(m.common.copy);
    expect(live(container).textContent).toBe("");
  });

  it("2초 안에 다시 누르면 live region을 비웠다가 다시 채운다 — 같은 글자로 바뀌지 않으면 다시 읽히지 않는다", async () => {
    const { container } = await render(<CodeBlock code="x" filename={null} />);
    await click(container);
    let resolve: () => void = () => {};
    writeText.mockImplementationOnce(() => new Promise<void>((done) => (resolve = done)));
    await act(async () => {
      button(container).click();
    });
    expect(live(container).textContent).toBe("");
    await act(async () => {
      resolve();
    });
    expect(live(container).textContent).toBe(m.common.copied);
    // 되돌림 타이머도 다시 선다 — 첫 클릭의 타이머가 둘째 `Copied`를 일찍 걷지 않는다
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(button(container).textContent).toBe(m.common.copied);
  });

  it("복사가 거부되면 실패 라벨 — 조용히 삼키지 않는다", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const { container } = await render(<CodeBlock code="x" filename={null} />);
    await click(container);
    expect(button(container).textContent).toBe(m.common.copyFailed);
    expect(live(container).textContent).toBe(m.common.copyFailed);
  });

  it("`navigator.clipboard`가 없으면(비보안 컨텍스트) 던지지 않고 실패 라벨이다", async () => {
    vi.stubGlobal("navigator", {});
    const { container } = await render(<CodeBlock code="x" filename={null} />);
    await click(container);
    expect(button(container).textContent).toBe(m.common.copyFailed);
  });
});

describe("CodeBlock — 배치", () => {
  const root = (container: HTMLElement) => container.firstElementChild as HTMLElement;
  const pre = (container: HTMLElement) => container.querySelector("pre")!;

  it("기본형은 가로만 스크롤하고 바깥 여백을 갖지 않는다 — 여백은 소비자가 `className`으로 준다", async () => {
    const { container } = await render(<CodeBlock code="x" filename="a.yml" className="mt-6" />);
    expect(pre(container).className).toMatch(/\boverflow-x-auto\b/);
    expect(root(container).className).toMatch(/\bmt-6\b/);
    const bare = await render(<CodeBlock code="x" filename={null} />);
    expect(root(bare.container).className).not.toMatch(/\bmt-\d/);
  });

  it("`fill`은 남은 높이를 먹고 블록 자신이 두 축으로 스크롤한다 — 온보딩 ④의 토큰 칩이 화면에 남는 근거다", async () => {
    const { container } = await render(<CodeBlock code="x" filename="a.yml" fill />);
    expect(root(container).className).toMatch(/\bflex-1\b/);
    expect(root(container).className).toMatch(/\bmin-h-0\b/);
    expect(pre(container).className).toMatch(/\bflex-1\b/);
    expect(pre(container).className).toMatch(/\boverflow-auto\b/);
    expect(pre(container).className).not.toMatch(/\boverflow-x-auto\b/);
  });
});
