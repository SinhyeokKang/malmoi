// @vitest-environment jsdom
import { act, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { HoldLater } from "@/components/home/hold-later";
import { m } from "@/lib/i18n";
import type { HoldReason } from "@/lib/protection/plan";

/**
 * **늦게 도착하는 보류 사유가 전환을 붙잡지 않는다** (ux-drift-unify U7 r1 🔴2). 이미 보인 Suspense 경계 안에서 `use(새 promise)`를 하면 그 전환
 * (`?event=` 상세 열기 · Sync/Publish 뒤 재검증)이 새 PR 조회가 끝날 때까지 커밋되지 않았다. 섬은 effect로 구독하고 새 값이 올 때까지 옛 값을 든다.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: (() => void)[] = [];
afterEach(() => { for (const unmount of mounted.splice(0)) act(() => unmount()); });

function Host({ label, hold, project = "acme" }: { label: string; hold: Promise<HoldReason | null>; project?: string }) {
  return <div><span data-label>{label}</span><HoldLater hold={hold} identity={project} /></div>;
}

async function mount(ui: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(ui));
  mounted.push(() => { root.unmount(); container.remove(); });
  return { container, transition: async (next: React.ReactNode) => { await act(async () => startTransition(() => root.render(next))); } };
}

describe("HoldLater", () => {
  it("새 promise가 대기 중이어도 전환이 커밋되고 옛 사유가 남는다", async () => {
    const text = m.home.cards.held["open-pr"];
    const view = await mount(<Host label="A" hold={Promise.resolve("open-pr")} />);
    expect(view.container.textContent).toContain(text);
    await view.transition(<Host label="B" hold={new Promise(() => {})} />);
    expect(view.container.querySelector("[data-label]")?.textContent).toBe("B");
    expect(view.container.textContent).toContain(text);
  });

  it("도착 전 줄은 nothing to send다 — 새 사유가 도착하면 바뀐다", async () => {
    const line = await mount(<Host label="A" hold={new Promise(() => {})} />);
    expect(line.container.textContent).toContain(m.home.cards.nothingPending);
    await line.transition(<Host label="B" hold={Promise.resolve("pr-check-failed")} />);
    expect(line.container.textContent).toContain(m.home.cards.held["pr-check-failed"]);
  });

  it("늦게 풀린 옛 promise가 새 값을 덮지 않는다", async () => {
    let resolveOld: (value: HoldReason | null) => void = () => {};
    const old = new Promise<HoldReason | null>((resolve) => { resolveOld = resolve; });
    const view = await mount(<Host label="A" hold={old} />);
    await view.transition(<Host label="B" hold={Promise.resolve("open-pr")} />);
    await act(async () => resolveOld(null));
    expect(view.container.textContent).toContain(m.home.cards.held["open-pr"]);
  });

  /**
   * **U7 r2** — 같은 트리가 다른 프로젝트로 다시 렌더되면(스위처가 컴포넌트를 마운트한 채 둔다) 옛 프로젝트의 사유가 새 조회가 끝날 때까지 남았다.
   * 식별 키가 바뀌면 그 자리에서 비운다 — 그 사이 다른 프로젝트의 Held를 말하지 않는다.
   */
  it("프로젝트가 바뀌면 옛 프로젝트의 사유가 서지 않는다", async () => {
    const text = m.home.cards.held["open-pr"];
    const view = await mount(<Host label="A" hold={Promise.resolve("open-pr")} project="acme" />);
    expect(view.container.textContent).toContain(text);
    await view.transition(<Host label="B" hold={new Promise(() => {})} project="globex" />);
    expect(view.container.querySelector("[data-label]")?.textContent).toBe("B");
    expect(view.container.textContent).not.toContain(text);
  });
});
