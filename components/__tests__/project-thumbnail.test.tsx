// @vitest-environment jsdom
import { expect, it } from "vitest";
import { ProjectThumbnail } from "@/components/projects/project-thumbnail";
import { toneFill } from "@/components/ui/tone";
import { render } from "./helpers/dom";

it.each([undefined, null, ""])("이미지 %s이면 이름 색과 Box 폴백을 표시한다", async (src) => {
  const { container } = await render(<ProjectThumbnail name="Acme" src={src} />);
  expect(container.querySelector("img")).toBeNull();
  const tile = container.querySelector("svg.lucide-box")?.parentElement;
  expect(tile?.classList.contains(toneFill("Acme"))).toBe(true);
  expect(tile?.classList.contains("rounded-sm")).toBe(true);
  expect(tile?.getAttribute("aria-hidden")).toBe("true");
});

it("이미지는 같은 28px 타일 안에서 자르지 않고 장식 이미지로 표시한다", async () => {
  const { container } = await render(<ProjectThumbnail name="Acme" src="/project.webp" />);
  const image = container.querySelector("img");
  expect(image?.getAttribute("src")).toBe("/project.webp");
  expect(image?.getAttribute("alt")).toBe("");
  expect(image?.classList.contains("object-contain")).toBe(true);
  expect(image?.parentElement?.classList.contains("size-7")).toBe(true);
  expect(container.querySelector("svg")).toBeNull();
});
