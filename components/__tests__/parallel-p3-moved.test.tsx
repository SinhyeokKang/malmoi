// @vitest-environment jsdom
import { act } from "react";
import { expect, it } from "vitest";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { render, find } from "./helpers/dom";

it.each([["xs", "size-4", "rounded", "size-3"], ["sm", "size-7", "rounded-sm", "size-4"], ["md", "size-8", "rounded-sm", "size-4"], ["lg", "size-14", "rounded-sm", "size-5"]] as const)("ProjectThumbnail %s keeps real tile geometry and image failure fallback", async (size, tile, radius, glyph) => {
  const { container, rerender } = await render(<ProjectThumbnail name="Fixture project" src="/fixture.webp" size={size} />);
  const image = find<HTMLImageElement>(container, "img");
  expect(image.classList.contains("object-contain")).toBe(true);
  expect(image.parentElement?.classList.contains(tile)).toBe(true);
  expect(image.parentElement?.classList.contains(radius)).toBe(true);
  expect(image.parentElement?.className).not.toMatch(/bg-/);
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(find(container, "svg").classList.contains(glyph)).toBe(true);
  await rerender(<ProjectThumbnail name="Fixture project" src="/new-fixture.webp" size={size} />);
  expect(find(container, "img").getAttribute("src")).toBe("/new-fixture.webp");
});
