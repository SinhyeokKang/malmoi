// @vitest-environment jsdom
import { createElement, type ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **드롭다운이 화면 밖으로 나가지 않는다** (2026-10-02 사용자 — 번역 값 패널 머리의 언어 메뉴가 오른쪽 화면 밖으로 일부 열렸다).
 *
 * jsdom은 레이아웃을 재지 못한다 — 계약을 잰다: ① 프리미티브가 Radix에 뷰포트 여백(`collisionPadding` 8)을 넘긴다(Radix가 그 안으로 밀고 뒤집는다),
 * ② 오른쪽 끝에 선 트리거의 메뉴는 끝 정렬(`data-align="end"` — Radix가 세운다)이다. 실제 위치는 런타임 목록이 잰다.
 */
const captured = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("radix-ui", async (orig) => {
  const actual = await orig<typeof import("radix-ui")>();
  const Content = (props: ComponentProps<typeof actual.DropdownMenu.Content>) => {
    captured.props.push(props as Record<string, unknown>);
    return createElement(actual.DropdownMenu.Content, props);
  };
  return { ...actual, DropdownMenu: { ...actual.DropdownMenu, Content } };
});
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks, useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { en } from "@/messages/en";

import { props } from "./helpers/workspace-props";

const w = en.translations.workspace;

beforeEach(() => {
  captured.props.length = 0;
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?key=k1&keySurface=web");
});

it("프리미티브는 메뉴를 뷰포트에서 8px 안쪽에 둔다 — 호출부가 덮을 수 있다", async () => {
  const user = userEvent.setup();
  await render(
    <>
      <DropdownMenu><DropdownMenuTrigger>A</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>a</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger>B</DropdownMenuTrigger><DropdownMenuContent collisionPadding={16}><DropdownMenuItem>b</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </>,
  );
  await user.click([...document.querySelectorAll("button")].find(b => b.textContent === "A")!);
  expect(captured.props.at(-1)?.collisionPadding).toBe(8);
  await user.keyboard("{Escape}");
  await user.click([...document.querySelectorAll("button")].find(b => b.textContent === "B")!);
  expect(captured.props.at(-1)?.collisionPadding).toBe(16);
});

it.each([
  ["키 목록 머리의 Status", `${w.filters.state.axis}:`],
  ["번역값 패널 머리의 언어", `${w.detail.languagesGroup}:`],
])("%s 메뉴는 오른쪽 끝 트리거라 끝 정렬로 열린다", async (_name, prefix) => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.click(container.querySelector<HTMLButtonElement>(`button[aria-label^="${prefix}"]`)!);
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.getAttribute("data-align")).toBe("end");
  expect(captured.props.at(-1)?.align).toBe("end");
});
