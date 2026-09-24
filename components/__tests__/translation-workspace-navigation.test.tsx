// @vitest-environment jsdom
import { act, Suspense, use, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **이동이 대기 중인 동안 친 입력이 조용히 사라지지 않는다** (audit-ux #1). 확인창 판정은 클릭 시점의 draft로 끝나는데,
 * 응답 전까지 옛 키의 칸이 그대로 서 있어 거기 친 입력이 새 상세가 도착하는 순간 확인 없이 교체됐다.
 *
 * ⚠️ **`router.push`를 Next처럼 흉내 낸다** — 목이 하네스의 상태를 바꾸고 그 렌더가 `gate`에서 suspend한다. 이동이
 * transition 안에서 불렸으면 옛 화면이 그대로 서고(`isPending`), 아니면 Suspense 폴백이 화면을 치운다. 응답 도착은 `gate`를 푸는 것이다.
 * ⚠️ **gate는 테스트 끝에서 전부 푼다** (POSTMORTEM 2026-09-18 — 안 끝난 대기가 뒤 테스트의 transition을 붙잡았다).
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";

import { props } from "./helpers/workspace-props";

const area = (container: HTMLElement, code: string) => container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`);
const row = (container: HTMLElement, key: string) => [...container.querySelectorAll<HTMLElement>("[data-key-row]")].find(el => el.dataset.keyRow === key)!;

function detailOf(keyId: string): NonNullable<WorkspaceProps["detail"]> {
  const base = props().detail as Exclude<WorkspaceProps["detail"], null | { absent: true }>;
  return { ...base, key: { ...base.key, id: keyId, key: `common.${keyId}` }, locales: base.locales.map(l => ({ ...l })) };
}

type Gate = { promise: Promise<void>; open: () => void };
const gates: Gate[] = [];
function gate(): Gate {
  let open = () => {};
  const promise = new Promise<void>(resolve => { open = resolve; });
  const entry = { promise, open };
  gates.push(entry);
  return entry;
}
function Wait({ on }: { on: Promise<void> | null }) { if (on !== null) use(on); return null; }

/** 이동 목이 넘기는 다음 화면 — `null`이면 응답이 곧바로 온다(gate 없음). */
let respond: (href: string) => { next: WorkspaceProps; gate: Gate | null } = () => { throw new Error("no route"); };
function Harness({ initial }: { initial: WorkspaceProps }) {
  const [state, setState] = useState<{ props: WorkspaceProps; wait: Promise<void> | null }>({ props: initial, wait: null });
  const move = (href: string) => { const { next, gate } = respond(href); setState({ props: next, wait: gate?.promise ?? null }); };
  mocks.push.mockImplementation(move);
  mocks.replace.mockImplementation(move);
  return (
    <Suspense fallback={<p data-fallback="true" />}>
      <Wait on={state.wait} />
      <TranslationWorkspace {...state.props} />
    </Suspense>
  );
}
const arrive = async (entry: Gate) => { await act(async () => { entry.open(); await entry.promise; }); };

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
});
afterEach(async () => { for (const entry of gates.splice(0)) await act(async () => entry.open()); });

it("다른 키로 가는 동안 옛 키의 칸은 읽기 전용이고, 새 상세가 오면 다시 쓸 수 있다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, key: "k2" }, detail: detailOf("k2") }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  // 짝 단언 — 이동 전에는 쓸 수 있다.
  expect(area(container, "zh")?.readOnly).toBe(false);
  await user.click(row(container, "k2"));
  expect(mocks.push).toHaveBeenCalledTimes(1);
  // 옛 화면이 그대로 선다 — 폴백으로 치우지 않는다.
  expect(container.querySelector("[data-fallback]")).toBeNull();
  expect(area(container, "zh")?.readOnly).toBe(true);
  await user.type(area(container, "zh")!, "空");
  expect(area(container, "zh")?.value).toBe("");
  await arrive(b);
  expect(container.textContent).toContain("common.k2");
  expect(area(container, "zh")?.readOnly).toBe(false);
  await user.type(area(container, "zh")!, "空");
  expect(area(container, "zh")?.value).toBe("空");
});

it("필터가 선택 키를 결과 밖으로 밀면 후속 replace의 응답까지 읽기 전용이고, 그 뒤 풀린다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const filtered: WorkspaceProps = { ...initial, query: { ...initial.query, q: "save" }, list: { ...initial.list, rows: [initial.list.rows[1]!], selectedInResult: false }, detail: detailOf("k1") };
  const first = gate();
  const second = gate();
  respond = href => href.includes("key=")
    ? { next: filtered, gate: first }
    : { next: { ...filtered, query: { ...filtered.query, key: undefined, keySurface: undefined }, detail: null }, gate: second };
  const { container } = await render(<Harness initial={initial} />);
  // 필터 메뉴를 거치지 않고 검색으로 같은 경로(`filter`)를 탄다 — 메뉴 조작은 이 테스트의 관심사가 아니다.
  await user.type(container.querySelector<HTMLInputElement>('input[type="search"]')!, "save{Enter}");
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(area(container, "zh")?.readOnly).toBe(true);
  await arrive(first);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(area(container, "zh")?.readOnly).toBe(true);
  await arrive(second);
  expect(area(container, "zh")).toBeNull();
  expect(container.textContent).toContain("Select a key");
});

it("트리 전환 중에도 옛 키의 칸은 읽기 전용이고, 첫 키가 열리면 풀린다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const first = gate();
  const second = gate();
  respond = href => href.includes("key=")
    ? { next: { ...initial, query: { ...initial.query, key: "k2" }, detail: detailOf("k2") }, gate: second }
    // 목록은 응답마다 새 객체다(서버 렌더) — 같은 객체를 넘기면 후속 선택 effect가 안 돈다.
    : { next: { ...initial, query: { ...initial.query, key: undefined, keySurface: undefined }, list: { ...initial.list }, detail: null }, gate: first };
  const { container } = await render(<Harness initial={initial} />);
  const node = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("common") && !b.closest("[data-key-row]"));
  await user.click(node!);
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(area(container, "zh")?.readOnly).toBe(true);
  await arrive(first);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  await arrive(second);
  expect(area(container, "zh")?.readOnly).toBe(false);
});

it("응답 전에 원래 조건으로 되돌리면 편집기가 다시 쓸 수 있다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const slow = gate();
  // 되돌리는 이동은 지금 화면과 같은 조건이다 — 응답이 곧바로 오고 상세 객체도 그대로다.
  respond = href => href.includes("q=save")
    ? { next: { ...initial, query: { ...initial.query, q: "save" } }, gate: slow }
    : { next: initial, gate: null };
  const { container } = await render(<Harness initial={initial} />);
  const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await user.type(search, "save{Enter}");
  expect(area(container, "zh")?.readOnly).toBe(true);
  await user.clear(search);
  await user.type(search, "{Enter}");
  await act(async () => {});
  expect(mocks.push).toHaveBeenCalledTimes(2);
  expect(area(container, "zh")?.readOnly).toBe(false);
});

it("보호되지 않은 교체로 다른 키가 와도 옛 키의 복구 사본은 남고, 돌아오면 되살아난다", async () => {
  // 우리 `navigate`를 지나지 않는 교체(예: draft가 깨끗할 때 누른 뒤로가기 뒤의 입력)는 잠금이 못 막는다 — 복구 사본이 마지막 그물이다 (D-U1a).
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh")!, "空");
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, key: "k2" }} detail={detailOf("k2")} />);
  expect(area(container, "zh")?.value).toBe("");
  await rerender(<TranslationWorkspace {...initial} detail={detailOf("k1")} />);
  expect(area(container, "zh")?.value).toBe("空");
  expect(container.textContent).toContain("1 unsaved change");
});

it("확인창에서 버린 draft는 복구 사본에서도 지운다 — 짝 단언", async () => {
  const user = userEvent.setup();
  const initial = props();
  mocks.push.mockImplementation(() => {});
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(area(container, "zh")!, "空");
  await user.click(row(container, "k2"));
  await user.click([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === "Discard changes")!);
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, key: "k2" }} detail={detailOf("k2")} />);
  await rerender(<TranslationWorkspace {...initial} detail={detailOf("k1")} />);
  expect(area(container, "zh")?.value).toBe("");
  expect(container.textContent).not.toContain("unsaved change");
});
