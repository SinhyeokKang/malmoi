// @vitest-environment jsdom
import { expect, it } from "vitest";

import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";

import { render, find } from "./helpers/dom";

/**
 * 스켈레톤 프리미티브 — 지금까지 `app/(edit)/projects/loading.tsx`의 관용구 하나뿐이었다.
 *
 * ⚠️ **`motion-safe:`가 붙는다** — 움직임을 줄인 사용자에게는 정지한 회색 블록으로 선다
 * (로그인 화면의 점 필드와 같은 판정).
 *
 * ⚠️ **색이 `bg-foreground/5`다** — `EmptyState`의 아이콘 칩과 같은 값이고, 새 raw 색이 아니다.
 * README의 `rgba(10,10,10,0.07)`을 따로 만들면 회색 블록 값이 두 벌로 갈린다.
 */
it("회색 블록 하나를 그리고 스크린리더에서 숨는다", async () => {
  const { container } = await render(<Skeleton className="h-5 w-40" />);
  const block = find<HTMLElement>(container, "div");

  expect(block.className).toContain("bg-foreground/5");
  expect(block.className).toContain("motion-safe:animate-pulse");
  expect(block.className).toContain("h-5");
  expect(block.getAttribute("aria-hidden")).toBe("true");
});

/**
 * **글자 한 줄의 자리** (audit-ux #5). 줄 높이를 px로 적으면 `--text-*` 토큰이 바뀔 때 골격만 떠내려간다 — 그 줄의
 * 글자 크기 클래스와 **보이지 않는 글자 하나**가 실물과 같은 line box를 세우고, 블록은 그 안의 가운데에 선다.
 */
it("SkeletonLine은 글자 크기 클래스로 줄 높이를 세우고 블록을 안에 둔다", async () => {
  const { container } = await render(<SkeletonLine text="text-xs" className="w-24" />);
  const line = find<HTMLElement>(container, "[data-skeleton-line]");
  expect(line.className).toContain("text-xs");
  expect(line.className).toContain("items-center");
  expect(line.textContent).toBe("\u200b");
  const block = find<HTMLElement>(line, "div");
  expect(block.className).toContain("w-24");
  expect(block.getAttribute("aria-hidden")).toBe("true");
});
