import { expect, vi } from "vitest";

/**
 * **모달 레이어가 클릭을 받을 준비가 될 때까지 기다린다** (POSTMORTEM 2026-10-08 `:2829`). Radix는 DOM을 먼저 붙이고, 레이어 갱신 렌더에서야
 * 그 Content의 `pointer-events`를 연다 — DOM 존재를 준비 완료로 보고 곧바로 user-event로 누르면 CI에서만 `pointer-events: none`으로 깨진다.
 * user-event의 포인터 검사는 끄지 않는다 — 이것은 진짜 준비 신호를 기다리는 것이다.
 */
export async function waitForLayer(content: () => HTMLElement | null | undefined) {
  await vi.waitFor(() => {
    const node = content();
    expect(node).toBeTruthy();
    expect(node!.style.pointerEvents).toBe("auto");
    expect(getComputedStyle(node!).pointerEvents).toBe("auto");
  });
}
