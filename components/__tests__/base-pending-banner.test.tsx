// @vitest-environment jsdom
import { expect, it } from "vitest";
import { BasePendingBanner } from "@/components/translations/base-pending-banner";
import { render } from "./helpers/dom";

/**
 * [malmoi#127] 번역 화면 배너는 EDITOR도 읽는다 — **해제하지 못하는 행동을 권하지 않는다.** 앱의 [Sync]는 선언을 적용하지 않고, 적용하는
 * 워크플로의 Sync는 미전달 편집이 있으면 보류된다. 그래서 "Publish first"는 참이고 "the next sync from the repository"는 [Sync]로 읽혀 거짓이 됐다.
 */
it("배너는 GitHub Actions 워크플로의 Sync를 트리거로 대고 먼저 Publish하라고 말한다", async () => {
  const { container } = await render(<BasePendingBanner baseLocale="en" declaredBaseLocale="ko" />);
  const text = container.textContent ?? "";
  expect(text).toContain("The base language is changing to ko.");
  expect(text).toContain("GitHub Actions workflow");
  expect(text).toContain("the Sync button doesn't apply it");
  expect(text).toContain("publish them first");
  expect(text).not.toContain("next sync from the repository");
});
