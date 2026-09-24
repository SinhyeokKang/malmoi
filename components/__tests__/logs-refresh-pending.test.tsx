// @vitest-environment jsdom
import { act, Suspense, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **[Refresh]와 [Clear filters]가 눌린 동안 아이콘이 스피너로 바뀐다** (audit-ux #28). 전엔 둘 다 transition
 * 없는 `router.refresh()`·`router.push`라, 바뀐 게 없으면 눌렸는지조차 알 수 없었다. 아이콘이 있는 버튼이라
 * 스피너를 더하지 않고 그 아이콘을 교체한다 (DESIGN §6 `Button loading`).
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));

import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

const props = { slug: "alpha", sources: [{ slug: "web" }], actors: [], refreshable: true };
beforeEach(() => { mocks.push.mockReset(); mocks.refresh.mockReset(); });

/** 라우터 응답이 오기 전까지 transition을 붙들어 두는 목적지 — 서버 렌더가 아직 안 온 상태다. */
function harness(filter: ReturnType<typeof parseLogFilter>) {
  let finish = () => {};
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  let ready = false;
  function Destination({ active }: { active: boolean }) {
    if (active && !ready) throw waiting;
    return null;
  }
  function Harness() {
    const [active, setActive] = useState(false);
    mocks.refresh.mockImplementation(() => setActive(true));
    mocks.push.mockImplementation(() => setActive(true));
    return <Suspense fallback={<p>route loading</p>}>
      <LogFilters {...props} filter={filter} />
      <Destination active={active} />
    </Suspense>;
  }
  return { Harness, finish: async () => { ready = true; await act(async () => { finish(); await waiting; }); } };
}

const button = (label: string) => {
  const node = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!node) throw new Error(`no button ${label}`);
  return node;
};

it("[Refresh]는 새로 그린 목록이 올 때까지 `RefreshCw`를 스피너로 바꾸고 다시 누를 수 없다", async () => {
  const { Harness, finish } = harness(parseLogFilter({}));
  await render(<Harness />);
  const refresh = button(m.logs.refresh);
  expect(refresh.querySelector(".lucide-refresh-cw")).not.toBeNull();

  await act(async () => refresh.click());
  expect(refresh.querySelector(".lucide-refresh-cw")).toBeNull();
  expect(refresh.querySelector(".animate-spin")).not.toBeNull();
  expect(refresh.getAttribute("aria-busy")).toBe("true");
  // 라벨은 그대로다 — 문구를 바꾸지 않는다.
  expect(refresh.textContent?.trim()).toBe(m.logs.refresh);
  await act(async () => refresh.click());
  expect(mocks.refresh).toHaveBeenCalledOnce();

  await finish();
  expect(refresh.querySelector(".animate-spin")).toBeNull();
  expect(refresh.querySelector(".lucide-refresh-cw")).not.toBeNull();
  expect(refresh.getAttribute("aria-busy")).toBeNull();
});

it("[Clear filters]도 이동이 끝날 때까지 `RotateCcw`를 스피너로 바꾼다", async () => {
  const filter = parseLogFilter({ kind: "publish" });
  const { Harness, finish } = harness(filter);
  await render(<Harness />);
  const clear = button(m.logs.filters.clear);
  expect(clear.querySelector(".lucide-rotate-ccw")).not.toBeNull();

  await act(async () => clear.click());
  expect(clear.querySelector(".lucide-rotate-ccw")).toBeNull();
  expect(clear.querySelector(".animate-spin")).not.toBeNull();
  expect(clear.getAttribute("aria-busy")).toBe("true");
  await act(async () => clear.click());
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(routes.logs("alpha", {}));
  // 붙든 transition을 테스트 안에서 푼다 — 남기면 뒤 테스트의 pending이 얽힌다 (POSTMORTEM 2026-09-18).
  await finish();
});
