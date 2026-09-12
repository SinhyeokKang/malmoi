// @vitest-environment jsdom
import { expect, it } from "vitest";

import { Skeleton } from "@/components/ui/skeleton";

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
