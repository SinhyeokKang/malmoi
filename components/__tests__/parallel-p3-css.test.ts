import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { compile } from "tailwindcss";
import { expect, it } from "vitest";

it("border-ring and ring-ring compile to the exact same root ring color", async () => {
  const require = createRequire(import.meta.url);
  const path = `${process.cwd()}/app/globals.css`;
  const compiler = await compile(readFileSync(path, "utf8"), {
    base: dirname(path),
    loadStylesheet: async (id, base) => {
      const imported = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
      return { path: imported, base: dirname(imported), content: readFileSync(imported, "utf8") };
    },
  });
  const css = compiler.build(["border-ring", "ring-ring"]);
  const border = css.match(/\.border-ring\s*\{\s*border-color:\s*([^;]+);/)?.[1];
  const ring = css.match(/\.ring-ring\s*\{\s*--tw-ring-color:\s*([^;]+);/)?.[1];
  expect(border).toBeDefined();
  expect(border).toBe(ring);
  expect(border).toBe("var(--ring)");
  expect(css.match(/--ring:\s*([^;]+);/)?.[1]).toBe("rgb(96 165 250)");
});

it("native search clear is hidden once so the named Input clear is the only affordance", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css.match(/search-cancel-button/g)).toHaveLength(1);
  expect(css).toMatch(/input\[type=["']search["']\]::-webkit-search-cancel-button\s*\{[^}]*-webkit-appearance:\s*none/);
});


it("invalid focus variants compile with higher specificity than ordinary field focus", async () => {
  const require = createRequire(import.meta.url);
  const path = `${process.cwd()}/app/globals.css`;
  const compiler = await compile(readFileSync(path, "utf8"), {
    base: dirname(path),
    loadStylesheet: async (id, base) => {
      const imported = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
      return { path: imported, base: dirname(imported), content: readFileSync(imported, "utf8") };
    },
  });
  const css = compiler.build(["focus-visible:border-ring", "focus-visible:ring-ring", "aria-[invalid=true]:focus-visible:border-destructive", "aria-[invalid=true]:focus-visible:ring-destructive"]);
  // 오류 조합은 aria 속성과 포커스를 함께 요구해 기본 포커스보다 구체적이다.
  expect(css).toMatch(/\[aria-invalid="true"\]:focus-visible\s*\{\s*border-color: var\(--destructive\);/);
  expect(css).toMatch(/\[aria-invalid="true"\]:focus-visible\s*\{\s*--tw-ring-color: var\(--destructive\);/);
  expect(css).toContain("border-color: var(--ring)");
  expect(css).toContain("--tw-ring-color: var(--ring)");
});
