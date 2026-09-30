// @vitest-environment jsdom
import { act, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { HoldLater } from "@/components/home/hold-later";
import { m } from "@/lib/i18n";
import type { HoldReason } from "@/lib/protection/plan";
import { STATE } from "@/lib/status/canon";

/**
 * **늦게 도착하는 보류 사유가 전환을 붙잡지 않는다** (ux-drift-unify U7 r1 🔴2). 이미 보인 Suspense 경계 안에서 `use(새 promise)`를 하면 그 전환
 * (`?event=` 상세 열기 · Sync/Publish 뒤 재검증)이 새 PR 조회가 끝날 때까지 커밋되지 않았다. 섬은 effect로 구독하고 새 값이 올 때까지 옛 값을 든다.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: (() => void)[] = [];
afterEach(() => { for (const unmount of mounted.splice(0)) act(() => unmount()); });

function Host({ label, hold, as }: { label: string; hold: Promise<HoldReason | null>; as: "subline" | "badge" }) {
  return <div><span data-label>{label}</span><HoldLater hold={hold} as={as} /></div>;
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
  it.each([
    ["subline", m.home.cards.held["open-pr"]],
    ["badge", STATE.held.label],
  ] as const)("%s — 새 promise가 대기 중이어도 전환이 커밋되고 옛 사유가 남는다", async (as, text) => {
    const view = await mount(<Host label="A" hold={Promise.resolve("open-pr")} as={as} />);
    expect(view.container.textContent).toContain(text);
    await view.transition(<Host label="B" hold={new Promise(() => {})} as={as} />);
    expect(view.container.querySelector("[data-label]")?.textContent).toBe("B");
    expect(view.container.textContent).toContain(text);
  });

  it("도착 전 줄은 nothing to send이고 badge는 비어 있다 — 새 사유가 도착하면 바뀐다", async () => {
    const line = await mount(<Host label="A" hold={new Promise(() => {})} as="subline" />);
    expect(line.container.textContent).toContain(m.home.cards.nothingPending);
    const badge = await mount(<Host label="A" hold={new Promise(() => {})} as="badge" />);
    expect(badge.container.textContent).toBe("A");
    await line.transition(<Host label="B" hold={Promise.resolve("pr-check-failed")} as="subline" />);
    expect(line.container.textContent).toContain(m.home.cards.held["pr-check-failed"]);
  });

  it("늦게 풀린 옛 promise가 새 값을 덮지 않는다", async () => {
    let resolveOld: (value: HoldReason | null) => void = () => {};
    const old = new Promise<HoldReason | null>((resolve) => { resolveOld = resolve; });
    const view = await mount(<Host label="A" hold={old} as="subline" />);
    await view.transition(<Host label="B" hold={Promise.resolve("open-pr")} as="subline" />);
    await act(async () => resolveOld(null));
    expect(view.container.textContent).toContain(m.home.cards.held["open-pr"]);
  });
});
