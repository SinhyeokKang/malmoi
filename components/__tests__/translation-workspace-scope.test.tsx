// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **트리는 위치이고, 필터가 트리를 좁힌다** (translation-filter-scope T7 — spec 조건 1·6·10 · design §1·§4).
 *
 * - 최초 진입은 All sources이고 Scope 트리거는 꺼진 표시다. 트리 강조는 위치(`ns`)다 — 범위 필터가 아니다.
 * - `surface · key` 접두는 **원본** 트리의 소스가 둘 이상일 때만 선다 — 좁힌 트리로 판정하면 필터마다 접두가 붙었다 떨어진다.
 * - 조건이 켜지면 트리는 일치 키가 있는 노드 + 위치 노드만 보인다. 같은 세대의 Save 재검증으로 0이 된 노드는 숫자만 0이 된다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";

import { props } from "./helpers/workspace-props";

const w = m.translations.workspace;
const rowOf = (keyId: string, surfaceSlug: string, namespace: string): TranslationListRow => ({
  keyId, surfaceSlug, namespace, key: `${namespace}.${keyId}`, sourceText: keyId, missingCount: 1, totalLocales: 3, hasPending: false, hasReview: true, isNew: false,
});
const TREE2: WorkspaceProps["tree"] = {
  projectKeyCount: 4,
  surfaces: [
    { id: "s2", slug: "app", baseLocale: "en", locales: ["en", "ko"], keyCount: 1, namespaces: [{ name: "app", keyCount: 1 }] },
    { id: "s1", slug: "web", baseLocale: "en", locales: ["en", "ko", "zh"], keyCount: 3, namespaces: [{ name: "auth", keyCount: 1 }, { name: "common", keyCount: 2 }] },
  ],
};
function withList(base: WorkspaceProps, rows: TranslationListRow[]): WorkspaceProps["list"] {
  return { ...base.list, rows, matchedKeyCount: rows.length, incompleteKeyCount: rows.length };
}
const treePanel = (container: HTMLElement) => container.querySelector<HTMLElement>("h2")!.closest<HTMLElement>("div.flex.min-h-0.flex-col")!;
const treeButtons = (container: HTMLElement) => [...treePanel(container).querySelectorAll<HTMLButtonElement>("button")];
const treeNode = (container: HTMLElement, label: string) => treeButtons(container).find(b => b.querySelector("span.min-w-0")?.textContent === label);
const scopeTrigger = (container: HTMLElement) => container.querySelector<HTMLButtonElement>(`button[aria-label^="${w.filters.scope.axis}:"]`)!;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
});

it("최초 진입: Scope 트리거는 All sources에 꺼진 표시다 (조건 1)", async () => {
  const { container } = await render(<TranslationWorkspace {...props()} />);
  expect(scopeTrigger(container).getAttribute("aria-label")).toBe(`${w.filters.scope.axis}: ${w.filters.scope.project}`);
  expect(scopeTrigger(container).className).not.toContain("border-foreground");
});

it("This source를 고르면 Scope 트리거가 켜진 표시다 — 짝 단언", async () => {
  const base = props();
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, scope: "source" }} />);
  expect(scopeTrigger(container).className).toContain("border-foreground");
  expect(container.textContent).toContain(w.filters.clear);
});

it("트리 강조는 위치(ns)다 — 범위가 All sources여도 그 네임스페이스가 선택이다", async () => {
  const base = props();
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "common" }} />);
  expect(treeNode(container, "common")?.getAttribute("aria-current")).toBe("true");
  expect(treeNode(container, w.tree.allNamespaces)?.getAttribute("aria-current")).not.toBe("true");
});

it("소스가 하나인 프로젝트는 All sources여도 `surface · key` 접두가 없다", async () => {
  const { container } = await render(<TranslationWorkspace {...props()} />);
  const text = container.querySelector('[data-key-row="k1"]')?.textContent ?? "";
  expect(text).toContain("common.empty");
  expect(text).not.toContain("web · ");
});

it("소스가 둘 이상이면 필터로 한 소스만 남아도 접두가 유지된다 — 원본 트리로 판정한다", async () => {
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, state: "review" }} list={withList(base, [rowOf("k1", "web", "common")])} />);
  expect(container.querySelector('[data-key-row="k1"]')?.textContent).toContain("web · common.k1");
});

it("머리 배지는 원본 활성 소스 수다 — 조건이 트리를 좁혀도 같다", async () => {
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, q: "k1" }} list={withList(base, [rowOf("k1", "web", "common")])} />);
  expect(treePanel(container).querySelector("h2")?.nextElementSibling?.textContent).toBe("2");
});

it("조건이 켜지면 일치 0인 노드를 숨기고, 위치 소스는 0이어도 흐린 행으로 남는다 (조건 2·6)", async () => {
  const base = props({ tree: TREE2, query: { ...props().query, key: undefined, keySurface: undefined }, detail: null });
  // web 경로에서 app에만 있는 값을 검색한 경우.
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, q: "only-in-app" }} list={withList(base, [rowOf("a1", "app", "app")])} />);
  const labels = treeButtons(container).map(b => b.querySelector("span.min-w-0")?.textContent);
  expect(labels).toContain("app");
  expect(labels).toContain("web");
  expect(labels).not.toContain("auth");
  expect(labels).not.toContain("common");
  const web = treeNode(container, "web")!;
  expect(web.textContent).toContain("0");
  expect(web.className).toContain("text-muted-foreground");
  expect(treeNode(container, "app")?.textContent).toContain("1");
  expect(treeNode(container, "app")?.className).not.toContain("text-muted-foreground");
});

it("조건이 없으면 트리는 원본 숫자다 — 목록과 무관한 활성 키 수", async () => {
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} list={withList(base, [rowOf("k1", "web", "common")])} />);
  expect(treeNode(container, "common")?.textContent).toContain("2");
  expect(treeNode(container, "auth")?.textContent).toContain("1");
});

it("같은 세대의 Save 재검증으로 0이 된 노드는 남고 숫자만 0이 된다 — 새 조건(새 세대)에서는 빠진다 (조건 6)", async () => {
  const base = props({ tree: TREE2 });
  const review = { ...base.query, state: "review" as const };
  const { container, rerender } = await render(<TranslationWorkspace {...base} query={review} list={withList(base, [rowOf("k1", "web", "common"), rowOf("k3", "web", "auth")])} />);
  expect(treeNode(container, "auth")?.textContent).toContain("1");
  await rerender(<TranslationWorkspace {...base} query={review} list={withList(base, [rowOf("k1", "web", "common")])} />);
  expect(treeNode(container, "auth")?.textContent).toContain("0");
  expect(treeNode(container, "auth")?.className).toContain("text-muted-foreground");
  await rerender(<TranslationWorkspace {...base} query={{ ...base.query, state: "unsent" }} list={withList(base, [rowOf("k1", "web", "common")])} />);
  expect(treeNode(container, "auth")).toBeUndefined();
});

it("`Filter namespaces` 입력은 조건이 트리를 13개 미만으로 줄여도 남는다 — 원본 트리로 임계를 판정한다", async () => {
  const names = Array.from({ length: 14 }, (_, i) => `ns${String(i).padStart(2, "0")}`);
  const tree: WorkspaceProps["tree"] = { projectKeyCount: 14, surfaces: [{ id: "s1", slug: "web", baseLocale: "en", locales: ["en", "ko", "zh"], keyCount: 14, namespaces: names.map(name => ({ name, keyCount: 1 })) }] };
  const base = props({ tree });
  const { container, rerender } = await render(<TranslationWorkspace {...base} list={withList(base, names.map((name, i) => rowOf(`k${i}`, "web", name)))} />);
  const input = () => container.querySelector<HTMLInputElement>(`input[aria-label="${w.tree.filter}"]`);
  await userEvent.setup().type(input()!, "ns0");
  await rerender(<TranslationWorkspace {...base} query={{ ...base.query, state: "review" }} list={withList(base, [rowOf("k1", "web", "ns01")])} />);
  expect(input()).not.toBeNull();
  expect(input()?.value).toBe("ns0");
});

it("상세의 링크 복사는 필터를 켜지 않은 채 그 키를 선택한 주소다 — scope를 싣지 않는다 (조건 10)", async () => {
  // user-event가 `navigator.clipboard`를 자기 스텁으로 바꾼다 — 거기서 읽는다.
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.click(container.querySelector<HTMLButtonElement>(`button[aria-label="${w.detail.copyLink}"]`)!);
  const url = new URL(await navigator.clipboard.readText());
  expect(url.pathname).toBe("/projects/acme/surfaces/web/translations");
  expect(url.searchParams.get("scope")).toBeNull();
  expect(Object.fromEntries(url.searchParams)).toEqual({ ns: "common", key: "k1", keySurface: "web" });
});
