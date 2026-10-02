// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { NoMatch } from "@/components/ui/empty-state";

import { find, render } from "./helpers/dom";

// 출구 없음을 타입으로 허용하고 전달한 출구는 기존처럼 ReactElement로 제한한다.
const noExit = { title: "No results for “query”" } satisfies ComponentProps<typeof NoMatch>;
const textExit = { title: "No results", action: "Clear search" };
// @ts-expect-error an action is an element, never a text-only exit
const invalidExit: ComponentProps<typeof NoMatch> = textExit;
void invalidExit;

it.each(["page", "card", "inset"] as const)("출구 없는 %s형에 빈 액션 영역이나 버튼을 남기지 않는다", async placement => {
  const { container } = await render(<NoMatch {...noExit} placement={placement} />);
  const root = find<HTMLElement>(container, "div");
  expect(root.querySelector("button, a, [role='status'], [role='alert']")).toBeNull();
  expect(root.textContent).toBe(noExit.title);
  expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(root.querySelector(".mt-4")).toBeNull();
});

it("기존 검색 지우기 출구와 목록 형을 유지한다", async () => {
  const { container } = await render(<NoMatch title="No results" layout="list" action={<Button>Clear search</Button>} />);
  const root = find<HTMLElement>(container, "div");
  expect(root.className).toBe("flex flex-col items-center gap-2 px-4 py-10 text-center");
  const button = find<HTMLButtonElement>(root, "button");
  expect(button.textContent).toBe("Clear search");
  expect(button.parentElement?.className).toBe("flex flex-wrap items-center justify-center gap-2");
});
