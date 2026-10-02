// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { compile } from "tailwindcss";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { initialGrantFields, TokenGrantFields } from "@/components/mcp/token-grant-fields";
import { render } from "./helpers/dom";

const HOVER = "hover:bg-foreground/[0.03]";
const SCOPE_HOVER = `[&>div>label]:${HOVER}`;
const projects = [{ id: "p1", name: "Web", repo: "acme/web" }];
const value = initialGrantFields({ grants: [], scope: "projects", projectIds: [] }, projects);
const row = (node: Element) => node.closest<HTMLElement>("[data-select-row]")!;

it.each(["all", "projects"] as const)("selected and unselected %s scope retain hover on only the radio label", async scope => {
  const { container } = await render(<TokenGrantFields value={{...value, scope}} onChange={() => {}} projects={projects} disabled={false} />);
  const scopes = [...container.querySelectorAll("[data-scope]")];
  expect(scopes).toHaveLength(2);
  for (const control of scopes) {
    const scopeRow = row(control);
    expect(scopeRow.classList.contains(SCOPE_HOVER)).toBe(true);
    const selected = control.getAttribute("aria-checked") === "true";
    const chosen = control.getAttribute("data-scope") === "projects";
    expect(scopeRow.classList.contains(HOVER)).toBe(false);
    expect(scopeRow.classList.contains("bg-muted")).toBe(selected && chosen);
    expect(scopeRow.classList.contains("[&>div>label]:bg-muted")).toBe(selected && !chosen);
    expect(scopeRow.querySelector(":scope > div > label")?.contains(control)).toBe(true);
  }
  const expanded = container.querySelector("[data-scope-projects]");
  expect(expanded !== null).toBe(scope === "projects");
  if (expanded) {
    expect(expanded.closest("[data-select-row]")?.querySelector(":scope > div > label")?.contains(expanded)).toBe(false);
    expect(expanded.className).not.toContain(HOVER);
  }
  for (const control of container.querySelectorAll("[data-grant], [data-scope-project]")) expect(row(control).classList.contains(HOVER)).toBe(true);
});

it("disabled and unavailable scope do not acquire label or expanded-area hover", async () => {
  const { container, rerender } = await render(<TokenGrantFields value={value} onChange={() => {}} projects={projects} disabled />);
  for (const control of container.querySelectorAll("[data-grant], [data-scope], [data-scope-project]")) {
    expect(row(control).className).not.toContain(HOVER);
  }
  await rerender(<TokenGrantFields value={{...value, scope:"all"}} onChange={() => {}} projects={[]} disabled={false} />);
  expect(row(container.querySelector('[data-scope="projects"]')!).className).not.toContain(HOVER);
});

it("scope label and expanded project checkbox keep their separate activation", async () => {
  const change = vi.fn();
  const { container } = await render(<TokenGrantFields value={value} onChange={change} projects={projects} disabled={false} />);
  await userEvent.setup().click(container.querySelector('[data-scope="all"]')!.closest("label")!);
  expect(change).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({scope:"all"}));
  change.mockClear();
  await userEvent.setup().click(container.querySelector('[data-scope-project="p1"]')!.closest("label")!);
  expect(change).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({scope:"projects", chosen:new Set(["p1"])}));
});


it("actual scope CSS paints exactly one 3% label layer and keeps All background on that same label", async () => {
  const { container } = await render(<TokenGrantFields value={{...value, scope:"all"}} onChange={() => {}} projects={projects} disabled={false} />);
  const classes = [...container.querySelectorAll("[data-scope]")].flatMap(control => [...row(control).classList]);
  expect(classes).not.toContain(HOVER);
  expect(classes).toContain("[&>div>label]:bg-muted");
  const require = createRequire(import.meta.url);
  const path = `${process.cwd()}/app/globals.css`;
  const compiler = await compile(readFileSync(path, "utf8"), {
    base: dirname(path),
    loadStylesheet: async (id, base) => {
      const imported = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
      return { path: imported, base: dirname(imported), content: readFileSync(imported, "utf8") };
    },
  });
  const css = compiler.build([...new Set(classes)]);
  expect(css).toContain("3%, transparent");
  // 직접 자식 라벨만 칠한다. 펼쳐진 ul은 이 선택자 밖이다.
  expect(css.replace(/\s/g, "")).toContain(">div>label:hover");
  expect(css.replace(/\s/g, "")).toContain(">div>label{background-color:var(--muted)");
  expect(css).not.toContain(".hover\\:bg-foreground");
});
