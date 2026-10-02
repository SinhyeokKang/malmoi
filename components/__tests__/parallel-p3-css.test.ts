import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("native search clear is hidden once so the named Input clear is the only affordance", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css.match(/search-cancel-button/g)).toHaveLength(1);
  expect(css).toMatch(/input\[type=["']search["']\]::-webkit-search-cancel-button\s*\{[^}]*-webkit-appearance:\s*none/);
});
