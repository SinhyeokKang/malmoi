// @vitest-environment jsdom
import { act, useRef } from "react";
import { describe, expect, it } from "vitest";

import { OnboardingModal } from "@/components/ui/modal";

import { render } from "./helpers/dom";

/**
 * **`initialFocusRef`는 Radix의 열림 자동 포커스 자리에서 옮긴다** (2026-09-23 초대 모달 실측).
 *
 * ⚠️ 소비자 effect로 첫 입력에 포커스를 주면 jsdom에서는 green인데 **Chrome에서는 패널이 가져갔다** — Radix의
 * 열림 포커스가 effect보다 늦게 돈다. 그래서 방어선은 "소비자가 effect를 쓰지 않는다"가 아니라 이 prop이 열림
 * 포커스 **그 자체**를 대신한다는 것이다: 핸들러를 걷으면 포커스가 패널(transitionKey 갈래)로 가서 red가 된다.
 */
function Harness() {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <OnboardingModal open onClose={() => {}} title="t" transitionKey="form" initialFocusRef={ref} actions={<span />}>
      <input data-target ref={ref} />
    </OnboardingModal>
  );
}

describe("OnboardingModal initialFocusRef", () => {
  it("열리면 그 요소에 포커스가 선다 — 패널이 아니다", async () => {
    await render(<Harness />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.activeElement?.hasAttribute("data-target")).toBe(true);
  });
});
