// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **목록 행은 상세 타이핑에 다시 렌더되지 않는다** (translation-filter-scope design §3.1).
 *
 * 화면 목록이 전량이 되어 수천 행이 한 번에 서는데, draft `useReducer`가 워크스페이스 최상위라 상세에서 한 글자 칠 때마다 워크스페이스가
 * 다시 렌더된다. 행(`KeyRow`)의 `memo`가 그 비용을 막는다 — 호출부가 `onSelect`를 인라인 함수로 바꾸면 memo가 조용히 무력화되므로
 * 행이 그리는 `ListItemButton`의 렌더 수를 센다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), rowRenders: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));
vi.mock("@/components/ui/list-item", async (orig) => {
  const actual = await orig<typeof import("@/components/ui/list-item")>();
  return {
    ...actual,
    ListItemButton: (props: Parameters<typeof actual.ListItemButton>[0] & { "data-key-row"?: string }) => {
      if (props["data-key-row"] !== undefined) mocks.rowRenders.push(props["data-key-row"]);
      return actual.ListItemButton(props);
    },
  };
});

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";

import { props } from "./helpers/workspace-props";

beforeEach(() => {
  mocks.rowRenders.length = 0;
  window.sessionStorage.clear();
});

it("상세에서 한 글자 치면 목록 행은 하나도 다시 렌더되지 않는다 — KeyRow memo + 안정된 onSelect", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  expect(new Set(mocks.rowRenders)).toEqual(new Set(["k1", "k2"]));
  const zh = container.querySelector<HTMLTextAreaElement>('textarea[data-locale="zh"]');
  if (!zh) throw new Error("no zh textarea");
  await user.click(zh);
  mocks.rowRenders.length = 0;
  await user.type(zh, "空");
  expect(zh.value).toBe("空");
  expect(mocks.rowRenders).toEqual([]);
});
