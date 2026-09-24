// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **이동이 대기 중인 동안 친 입력이 조용히 사라지지 않는다** (audit-ux #1). 확인창 판정은 클릭 시점의 draft로 끝나는데,
 * 응답 전까지 옛 키의 칸이 그대로 서 있어 거기 친 입력이 새 상세가 도착하는 순간 확인 없이 교체됐다.
 * ⚠️ `router.push`는 목이라 응답이 오지 않는다 — 대기 상태가 테스트가 `rerender`할 때까지 유지된다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";

import { props } from "./helpers/workspace-props";

const area = (container: HTMLElement, code: string) => container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`)!;
const row = (container: HTMLElement, key: string) => [...container.querySelectorAll<HTMLElement>("[data-key-row]")].find(el => el.dataset.keyRow === key)!;

function detailOf(keyId: string): NonNullable<WorkspaceProps["detail"]> {
  const base = props().detail as Exclude<WorkspaceProps["detail"], null | { absent: true }>;
  return { ...base, key: { ...base.key, id: keyId, key: `common.${keyId}` }, locales: base.locales.map(l => ({ ...l })) };
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
});

it("다른 키로 가는 동안 옛 키의 칸은 읽기 전용이고, 새 상세가 오면 다시 쓸 수 있다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  // 짝 단언 — 이동 전에는 쓸 수 있다.
  expect(area(container, "zh").readOnly).toBe(false);
  await user.click(row(container, "k2"));
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(area(container, "zh").readOnly).toBe(true);
  await user.type(area(container, "zh"), "空");
  expect(area(container, "zh").value).toBe("");
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, key: "k2" }} detail={detailOf("k2")} />);
  expect(area(container, "zh").readOnly).toBe(false);
  await user.type(area(container, "zh"), "空");
  expect(area(container, "zh").value).toBe("空");
});

it("필터가 선택 키를 결과 밖으로 밀어 후속 replace가 나가면, 그 응답까지 읽기 전용이 이어진다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  // 필터 메뉴를 거치지 않고 검색으로 같은 경로(`filter`)를 탄다 — 메뉴 조작은 이 테스트의 관심사가 아니다.
  const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await user.type(search, "save{Enter}");
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(area(container, "zh").readOnly).toBe(true);
  const filtered = { ...initial.query, q: "save" };
  await rerender(<TranslationWorkspace {...initial} query={filtered} list={{ ...initial.list, rows: [initial.list.rows[1]!], selectedInResult: false }} detail={detailOf("k1")} />);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(area(container, "zh").readOnly).toBe(true);
});

it("트리 전환 중에도 옛 키의 칸은 읽기 전용이다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  const node = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("common") && !b.closest("[data-key-row]"));
  await user.click(node!);
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(area(container, "zh").readOnly).toBe(true);
});
