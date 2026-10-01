// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { render } from "./helpers/dom";

/**
 * **배너 반전** (sync-edit-protection T13 · 완료 조건 11). 보호가 켜진 뒤의 배너는 손실을 예고하지 않고 **리포 갱신이 멈췄다는
 * 상시 사실**을 말한다 — 닫기가 없고(상시 조건이다) pending 0이면 사라진다. 전에는 `lastPulledAt` 닫기 키의 warning이었다.
 */
function View({ count }: { count: number }) {
  return <>
    <button id="publish-trigger">Publish</button>
    <EditLossBanner count={count} publishButtonId="publish-trigger" />
  </>;
}

/** ux-drift-unify D3① — 이 화면의 `pending-edits` 보류 배너만 neutral이다(DESIGN §2.4 예외 1 — 편집 한 건마다 상시로 선다). */
it("[C11] 미전달 편집이 있으면 neutral 보류 배너가 멈춘 이유를 말하고 손실을 예고하지 않는다", async () => {
  const { container } = await render(<View count={3} />);
  expect(container.textContent).toContain("Repository updates are held until 3 unsent edits are sent.");
  expect(container.textContent).not.toMatch(/can be lost|automatically/);
  expect(container.querySelector('[data-alert="neutral"]')).not.toBeNull();
  expect(container.querySelector('[data-alert="warning"]')).toBeNull();
});

it("[C11] 닫기가 없다 — 상시 조건이라 숨길 지역 상태를 만들지 않는다", async () => {
  const { container } = await render(<View count={1} />);
  expect([...container.querySelectorAll("button")].map(b => b.getAttribute("aria-label") ?? b.textContent)).not.toContain("Dismiss");
  expect(container.textContent).toContain("until 1 unsent edit is sent.");
});

it("[C11] 미전달 편집이 0이면 렌더하지 않는다 (1 → 렌더 대조는 위)", async () => {
  const { container } = await render(<View count={0} />);
  expect(container.querySelector('[role="status"], [role="alert"]')).toBeNull();
  expect(container.textContent).toBe("Publish");
});

it("[C11] 액션은 헤더 Publish 버튼으로 포커스를 옮길 뿐 둘째 Dialog 트리거가 아니다", async () => {
  await render(<View count={2} />);
  const action = [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Send with Publish"));
  expect(action).toBeDefined();
  await act(async () => userEvent.setup().click(action!));
  expect(document.activeElement?.id).toBe("publish-trigger");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
