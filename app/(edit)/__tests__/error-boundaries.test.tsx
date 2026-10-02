// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { m } from "@/lib/i18n";

import EditError from "../error";
import LogsError from "../projects/[slug]/logs/error";

/**
 * **셸 안 오류 경계의 재시도는 다시 가져온다** (audit-ux #11). `reset`은 다시 그리기만 해서 서버 렌더에서 난 오류가
 * 같은 오류로 다시 났다 — `[slug]` 아래 Members·Sources·Settings·Translations의 실패가 전부 `(edit)/error`로 모인다.
 * 루트 `app/error.tsx`와 같은 `retry` 형이다(Next 16.3).
 */
async function clickRetry(ui: React.ReactElement, label: string) {
  const { container } = await render(ui);
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

it("(edit) error의 재시도는 retry를 부른다", async () => {
  const retry = vi.fn();
  await clickRetry(<EditError error={new Error("boom")} retry={retry} />, m.common.retry);
  expect(retry).toHaveBeenCalledOnce();
});

it("Logs error의 재시도는 retry를 부른다", async () => {
  const retry = vi.fn();
  await clickRetry(<LogsError error={new Error("boom")} retry={retry} />, m.logs.queryError.retry);
  expect(retry).toHaveBeenCalledOnce();
});

/**
 * **셸 안 "불러오지 못했다" 경계는 한 형이다** (ux-drift-unify 4-Y18) — 칸 글리프 + 제목 + 설명 + primary Retry. 옛 `(edit)/error`는
 * 제목·글리프 없는 danger Alert라 Logs 경계와 같은 사건이 두 모양이었다. 글리프는 §2.4 글리프 열의 실패 `CircleX`(`CircleAlert`는 필드 오류 전용).
 */
it.each([
  ["(edit)", EditError, m.crash.title],
  ["Logs", LogsError, m.logs.queryError.title],
] as const)("%s 경계는 실패 글리프 칸 + 제목 + 설명 + primary Retry다", async (_name, Boundary, title) => {
  const { container } = await render(<Boundary error={new Error("boom")} retry={vi.fn()} />);
  const glyph = container.querySelector("svg");
  expect(glyph?.getAttribute("class")).toContain("lucide-circle-x");
  expect(container.textContent).toContain(title);
  expect(container.querySelectorAll("p")).toHaveLength(2);
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(title);
});
