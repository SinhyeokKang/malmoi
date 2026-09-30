// @vitest-environment jsdom
import { expect, it } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";

import ProjectNotFound from "../projects/[slug]/not-found";
import SurfaceNotFound from "../projects/[slug]/surfaces/[surfaceSlug]/not-found";

/**
 * **셸 안 404도 칸 글리프를 든다** (ux-drift-unify 4-W6) — 셸 안 다른 `EmptyState`는 전부 아이콘이 있어, 글리프 없는 404만
 * 칸 자리가 비어 다른 화면으로 읽혔다. 두 경계가 같은 글리프다(무엇을 잃었는지 단정하지 않는다 — 프로젝트 경계 주석).
 */
it.each([
  ["프로젝트", ProjectNotFound],
  ["표면", SurfaceNotFound],
] as const)("%s 404는 EmptyState 칸 글리프를 든다", async (_name, NotFound) => {
  const { container } = await render(<NotFound />);
  expect(container.querySelector("svg")?.getAttribute("class")).toContain("lucide-file-question-mark");
});
