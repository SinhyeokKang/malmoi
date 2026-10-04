// @vitest-environment jsdom
import { globSync } from "node:fs";
import { join } from "node:path";
import type { ComponentType } from "react";
import { expect, it, vi } from "vitest";
import { render } from "./helpers/dom";

vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

const ROOT = join(__dirname, "../..");
// 배열 수동 등록은 새 라우트를 검사 밖에 두므로 실제 파일을 전수 발견한다.
const loadingPaths = [...globSync("app/**/loading.tsx", { cwd: ROOT })].sort();

function assertLoadingStatus(container: HTMLElement) {
  const statuses = container.querySelectorAll<HTMLElement>('[role="status"]');
  expect(statuses).toHaveLength(1);
  const status = statuses[0]!;
  expect(status.classList.contains("sr-only")).toBe(true);
  expect(status.textContent?.trim()).not.toBe("");
  expect(status.closest('[aria-hidden="true"], [hidden]')).toBeNull();
}

it("discovers all loading routes rather than a manually selected subset", () => {
  expect(loadingPaths.length).toBeGreaterThanOrEqual(8);
});

it.each(loadingPaths)("%s exposes one named screen-reader loading status", async path => {
  const { default: Loading } = await import(join(ROOT, path)) as { default: ComponentType };
  const { container } = await render(<Loading />);
  assertLoadingStatus(container);
  // 실제 렌더한 낭독 역할을 지우면 같은 판정이 실패해야 한다.
  const status = container.querySelector('[role="status"]')!;
  status.removeAttribute("role");
  expect(() => assertLoadingStatus(container)).toThrow();
  status.setAttribute("role", "status");
  assertLoadingStatus(container);
});

it.each([
  <span key="missing" className="sr-only">Loading fixture</span>,
  <span key="empty" className="sr-only" role="status" />,
  <span key="visible" role="status">Loading fixture</span>,
  <div key="hidden" aria-hidden><span className="sr-only" role="status">Loading fixture</span></div>,
])("rejects missing, unnamed, visible or hidden loading status", async fixture => {
  const { container } = await render(fixture);
  expect(() => assertLoadingStatus(container)).toThrow();
});
