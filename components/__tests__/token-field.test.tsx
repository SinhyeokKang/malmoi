// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rotatePushToken: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => mocks);

import { ResultStep } from "@/components/onboarding/steps/result";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

/**
 * **같은 push 토큰의 값 칸이 온보딩 ④와 Settings에서 한 형이다** (ux-drift-unify 5-Y13) — Settings만 테두리·높이 없이 radius 4였다.
 * 두 자리가 같은 컴포넌트(`SecretField`)를 쓰므로 렌더된 칸의 클래스가 글자까지 같다.
 */
it("온보딩 ④와 Settings 회전 결과의 토큰 칸이 같은 형이다", async () => {
  const onboarding = await render(<ResultStep pushToken="tok-a" yaml="on: push" />);
  const a = onboarding.container.querySelector<HTMLInputElement>("[data-secret-field]")!;

  mocks.rotatePushToken.mockResolvedValue({ ok: true, pushToken: "tok-b" });
  const settings = await render(<PushTokenPanel slug="acme" />);
  const click = async (label: string) => {
    const node = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label).at(-1)!;
    await act(async () => { await userEvent.setup().click(node); });
  };
  await click(m.settings.token.rotate);
  await click(m.settings.token.confirmAction);
  const b = settings.container.querySelector<HTMLInputElement>("[data-secret-field]")!;

  expect(a.value).toBe("tok-a");
  expect(b.value).toBe("tok-b");
  expect(b.className).toBe(a.className);
  expect(a.className).toContain("h-9");
  expect(a.readOnly && b.readOnly).toBe(true);
  expect(a.getAttribute("aria-label")).toBe(m.newProject.result.token.title);
  expect(b.getAttribute("aria-label")).toBe(m.settings.token.title);
});
