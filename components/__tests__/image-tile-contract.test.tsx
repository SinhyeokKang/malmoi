// @vitest-environment jsdom
import { act } from "react";
import type { ReactElement } from "react";
import { expect, it, vi } from "vitest";
import { ImageTile } from "@/components/ui/image-tile";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { InviteProjectCard } from "@/components/invite/project-card";
import { GeneralCard } from "@/components/settings/general-card";
import { hueFill } from "@/components/ui/tone";
import { find, render } from "./helpers/dom";

vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ updateProjectName: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn() }));

it.each([undefined, null, ""])("fallback %s uses the same single span with merged root and fallback classes", async (src) => {
  const { container } = await render(<ImageTile src={src} className="size-7 rounded-sm" fallback={<span className="text-white bg-sky-600"><svg className="size-4" /></span>} />);
  const tile = find(container, "span");
  expect(container.querySelectorAll("span")).toHaveLength(1);
  expect(tile.parentElement).toBe(container);
  expect(tile.getAttribute("aria-hidden")).toBe("true");
  expect(tile.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  expect(tile.children).toHaveLength(1);
  for (const token of ["size-7", "rounded-sm", "text-white", "bg-sky-600"]) expect(tile.classList.contains(token), token).toBe(true);
});

const boxes: [string, (src: string | null) => ReactElement, string, string, string][] = [
  ["project28", src => <ProjectThumbnail name="Acme" src={src} />, "size-7", "rounded-sm", "size-4"],
  ["project16", src => <ProjectThumbnail name="Acme" src={src} size="xs" />, "size-4", "rounded", "size-3"],
  ["invite32", image => <InviteProjectCard name="Acme" image={image} role="Translator" locales={[]} />, "size-8", "rounded-sm", "size-4"],
  ["settings56", image => <GeneralCard slug="acme" name="Acme" image={image} archived={false} />, "size-14", "rounded-sm", "size-5"],
];

it.each(boxes)("%s preserves normal transparent, missing, broken and src retry boxes", async (_name, view, size, radius, glyph) => {
  const { container, rerender } = await render(view("/transparent.png"));
  const image = find<HTMLImageElement>(container, "img");
  const tile = image.parentElement!;
  expect(tile.tagName).toBe("SPAN");
  expect(tile.children).toHaveLength(1);
  expect(tile.classList.contains(size)).toBe(true);
  expect(tile.classList.contains(radius)).toBe(true);
  expect([...tile.classList].some(token => token.startsWith("bg-"))).toBe(false);
  expect(tile.getAttribute("aria-hidden")).toBe("true");
  expect(image.getAttribute("alt")).toBe("");
  expect(image.className).toBe("size-full object-contain");
  await act(async () => { image.dispatchEvent(new Event("error")); });
  expect(container.querySelector("img")).toBeNull();
  const box = find(container, "svg.lucide-box");
  const fallback = box.parentElement!;
  expect(fallback.tagName).toBe("SPAN");
  expect(fallback.children).toHaveLength(1);
  expect(fallback.parentElement?.tagName).not.toBe("SPAN");
  expect(fallback.getAttribute("aria-hidden")).toBe("true");
  for (const token of [size, radius, "text-white", hueFill("Acme")]) expect(fallback.classList.contains(token), token).toBe(true);
  expect(box.classList.contains(glyph)).toBe(true);
  const brokenMarkup = fallback.outerHTML;
  await rerender(view(null));
  expect(find(container, "svg.lucide-box").parentElement!.outerHTML).toBe(brokenMarkup);
  await rerender(view("https://store.public.blob.vercel-storage.com/projects/p1/new.webp"));
  const retried = find<HTMLImageElement>(container, "img");
  expect(retried.getAttribute("src")).toBe("/api/images/projects/p1/new.webp");
  expect(retried.classList.contains("object-contain")).toBe(true);
  expect([...retried.parentElement!.classList].some(token => token.startsWith("bg-"))).toBe(false);
  expect(container.querySelector("svg.lucide-box")).toBeNull();
});

it("an already complete broken image uses the fallback slot immediately", async () => {
  const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete")!;
  const natural = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth")!;
  Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 0 });
  try {
    const { container } = await render(<ImageTile src="/cached-broken.png" className="size-7" fallback={<span className="bg-sky-600">Fallback</span>} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("SPAN");
    expect(container.firstElementChild?.textContent).toBe("Fallback");
    expect(container.querySelectorAll("span")).toHaveLength(1);
  } finally {
    Object.defineProperty(HTMLImageElement.prototype, "complete", complete);
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", natural);
  }
});
