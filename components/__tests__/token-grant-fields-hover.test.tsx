// @vitest-environment jsdom
import { expect, it } from "vitest";

import { initialGrantFields, TokenGrantFields } from "@/components/mcp/token-grant-fields";

import { render } from "./helpers/dom";

/**
 * 같은 Dialog의 선택 행 셋(Allowed actions · Scope 라디오 · 고른 프로젝트 체크)은 같은 hover 면 3%를 든다(#166).
 * disabled(제출 중)에는 어느 행도 hover가 없다 — 눌러도 안 되는 행이 반응하면 거짓 어포던스다.
 */
const HOVER = "hover:bg-foreground/[0.03]";
const projects = [{ id: "p1", name: "Web", repo: "acme/web" }];
const value = initialGrantFields({ grants: [], scope: "projects", projectIds: [] }, projects);
const rows = () => ({
  grant: document.querySelector('[data-grant]')!.closest("label")!,
  scope: [...document.querySelectorAll('[data-scope]')].map((node) => node.closest("label")!),
  project: document.querySelector('[data-scope-project]')!.closest("label")!,
});

it("Allowed actions · Scope · 고른 프로젝트 행이 모두 3% hover를 든다", async () => {
  await render(<TokenGrantFields value={value} onChange={() => {}} projects={projects} disabled={false} />);
  const { grant, scope, project } = rows();
  expect(scope).toHaveLength(2);
  for (const label of [grant, ...scope, project]) expect(label.className).toContain(HOVER);
});

it("disabled면 세 종류 행 모두 hover가 없다", async () => {
  await render(<TokenGrantFields value={value} onChange={() => {}} projects={projects} disabled />);
  const { grant, scope, project } = rows();
  for (const label of [grant, ...scope, project]) expect(label.className).not.toContain(HOVER);
});
