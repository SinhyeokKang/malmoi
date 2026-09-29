// @vitest-environment jsdom
import { act, startTransition, useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **오래 도는 Action을 `startTransition(async …)`로 감싸지 않는다** (ARCHITECTURE §3 · malmoi#107 ②). React 19는 열린 async
 * action 스코프에 그 뒤의 모든 transition을 얽는다 — Link 내비게이션도 transition이라, 감싸면 Action이 끝날 때까지 화면
 * 이동이 커밋되지 않는다. 대신 수동 대기 + `useCommitWait`(서버 트리가 커밋될 때까지 잠금)이다.
 *
 * 내비게이션은 옆 컴포넌트의 `startTransition(() => set…)`으로 흉내 낸다 — 얽히면 Action이 풀릴 때까지 커밋되지 않는다.
 */
const mocks = vi.hoisted(() => ({
  connectRepository: vi.fn(), startGithubConnect: vi.fn(),
  addSurfaces: vi.fn(), confirmManualFormat: vi.fn(), detectRepoFormats: vi.fn(), loadCandidateSample: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: mocks.connectRepository, startGithubConnect: mocks.startGithubConnect }));
vi.mock("@/app/(edit)/projects/actions", () => ({
  addSurfaces: mocks.addSurfaces, confirmManualFormat: mocks.confirmManualFormat,
  detectRepoFormats: mocks.detectRepoFormats, loadCandidateSample: mocks.loadCandidateSample,
}));

import { ReconnectButton } from "@/components/reconnect-button";
import { AddSourcesModal } from "@/components/sources/add-sources-modal";
import type { CandidateSummary } from "@/lib/onboarding/detect";

beforeEach(() => { vi.clearAllMocks(); });

async function click(node: HTMLElement) { await act(async () => { await userEvent.setup().click(node); }); }
const byText = (text: string) => {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text);
  if (!node) throw new Error(`Missing ${text}`);
  return node;
};
const spinning = (node: Element) => node.querySelector(".animate-spin") !== null;
/** 풀리지 않은 Action 응답 — 테스트가 손으로 푼다. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

/** 내비게이션 대역 — 누르면 transition 안에서 상태를 바꾼다. */
function Navigate() {
  const [moved, setMoved] = useState(false);
  return <><button type="button" onClick={() => startTransition(() => setMoved(true))}>Navigate</button><output data-moved={moved} /></>;
}
/** ⚠️ 모달이 열리면 Radix가 바깥에 `pointer-events: none`을 건다 — 대역은 DOM 클릭으로 누른다. */
async function navigate() { await act(async () => { byText("Navigate").click(); }); }
const moved = () => document.querySelector("output[data-moved]")?.getAttribute("data-moved") === "true";

describe("ReconnectButton", () => {
  it("연결이 도는 동안의 내비게이션이 얽히지 않는다", async () => {
    const call = deferred<{ ok: true }>();
    mocks.connectRepository.mockReturnValue(call.promise);
    await render(<><ReconnectButton slug="acme" label="Reconnect" server={{}} /><Navigate /></>);
    await click(byText("Reconnect"));
    await navigate();
    expect(moved()).toBe(true);
    await act(async () => { call.resolve({ ok: true }); });
  });

  it("성공 뒤 대기는 새 서버 트리가 올 때까지 잇는다", async () => {
    mocks.connectRepository.mockResolvedValue({ ok: true });
    const view = await render(<ReconnectButton slug="acme" label="Reconnect" server={{ revision: 1 }} />);
    await click(byText("Reconnect"));
    expect(spinning(byText("Reconnect"))).toBe(true);
    await view.rerender(<ReconnectButton slug="acme" label="Reconnect" server={{ revision: 2 }} />);
    expect(spinning(byText("Reconnect"))).toBe(false);
  });

  it("거부는 트리를 기다리지 않고 곧장 문구를 보인다", async () => {
    mocks.connectRepository.mockResolvedValue({ ok: false, error: "unavailable" });
    await render(<ReconnectButton slug="acme" label="Reconnect" server={{}} />);
    await click(byText("Reconnect"));
    expect(spinning(byText("Reconnect"))).toBe(false);
    expect(document.querySelector('[role="alert"], [data-slot="alert"]')).not.toBeNull();
  });
});

describe("AddSourcesModal", () => {
  const candidate: CandidateSummary = {
    adapter: "json-catalog", label: "JSON", pathTemplate: "i18n/{locale}.json", locales: ["en"], outputPaths: ["i18n/en.json"],
    baseLocale: "en", keys: { status: "counted", count: 2 }, samples: [{ locale: "en", rows: [{ key: "hello", value: "Hi" }], total: 2 }],
  };
  const results = [{ surfaceSlug: "mobile", count: 2, failed: 0 }];
  const ref = { current: null };
  const modal = (props: { onAdded?: () => void; onClose?: () => void; server: unknown }) =>
    <AddSourcesModal open onClose={props.onClose ?? (() => {})} onAdded={props.onAdded ?? (() => {})} returnFocusRef={ref} slug="p" owner="o" repo="r" branch="main" existing={[]} adapters={[]} server={props.server} />;
  async function add() {
    await click(document.querySelector<HTMLElement>('[role="checkbox"]')!);
    await click(document.querySelector<HTMLElement>("[data-add-sources]")!);
  }

  beforeEach(() => { mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [candidate] }); });

  it("추가가 도는 동안의 내비게이션이 얽히지 않는다", async () => {
    const call = deferred<{ ok: true; results: typeof results }>();
    mocks.addSurfaces.mockReturnValue(call.promise);
    await render(<>{modal({ server: {} })}<Navigate /></>);
    await add();
    await navigate();
    expect(moved()).toBe(true);
    await act(async () => { call.resolve({ ok: true, results }); });
  });

  it("닫기와 결과는 새 서버 트리가 커밋된 뒤다", async () => {
    mocks.addSurfaces.mockResolvedValue({ ok: true, results });
    const onAdded = vi.fn(); const onClose = vi.fn();
    const view = await render(modal({ onAdded, onClose, server: { revision: 1 } }));
    await add();
    expect(onAdded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await view.rerender(modal({ onAdded, onClose, server: { revision: 2 } }));
    expect(onAdded).toHaveBeenCalledExactlyOnceWith(results);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
