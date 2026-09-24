// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SLOW_AFTER_MS, SlowNotice } from "@/components/slow-notice";
import { FilesStep, type FilesStepState } from "@/components/onboarding/steps/files";
import { ReconnectButton } from "@/components/reconnect-button";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: mocks.connect }));

/**
 * **긴 원격 실행에 시간에 비례한 한 줄을 세운다** (audit-ux #23). 리포 탐지·첫 적재·Sync·Publish는 큰 리포에서 30초를 넘기는데
 * 스켈레톤과 스피너만 돌아 "멈췄다"와 "도는 중"이 구별되지 않았다. 값은 하나다 — 화면마다 다르면 같은 대기가 다르게 읽힌다.
 */
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });

const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

it("값은 8초 하나다", () => {
  expect(SLOW_AFTER_MS).toBe(8_000);
});

it("도는 동안 8초가 지나야 문구가 서고, 끝나면 사라지며, 다시 돌면 처음부터 잰다", async () => {
  let toggle: (next: boolean) => void = () => {};
  function Host() {
    const [active, setActive] = useState(true);
    toggle = setActive;
    return <SlowNotice active={active} />;
  }
  const { container } = await render(<Host />);
  await advance(SLOW_AFTER_MS - 100);
  expect(container.textContent).not.toContain(m.common.slow);
  await advance(100);
  const notice = container.querySelector('[role="status"]');
  expect(notice?.textContent).toBe(m.common.slow);
  await act(async () => toggle(false));
  expect(container.textContent).not.toContain(m.common.slow);
  await act(async () => toggle(true));
  // 옛 경과를 이어 받지 않는다 — 다시 시작한 대기는 다시 8초다.
  await advance(SLOW_AFTER_MS - 100);
  expect(container.textContent).not.toContain(m.common.slow);
  await advance(100);
  expect(container.textContent).toContain(m.common.slow);
});

const candidate: CandidateSummary = {
  outputPaths: ["locales/en.json"], adapter: "json-catalog", label: "JSON", pathTemplate: "locales/{locale}.json",
  locales: ["en"], baseLocale: "en", keys: { status: "counted", count: 1 }, samples: [],
};
function state(patch: Partial<FilesStepState>): FilesStepState {
  return {
    detecting: false, detectError: undefined, candidates: [candidate], picked: 0, locale: "en", preview: { status: "ready", rows: [], total: 0 },
    manual: { adapter: "json-catalog", pathTemplate: "", baseLocale: "" }, manualMatched: false,
    adapters: [{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "src/locales/{locale}.json" }],
    repoLabel: "owner/repo", branch: "main", banner: null, ...patch,
  };
}
const noop = vi.fn();

/** 온보딩 ②와 Sources의 [Add source]가 같은 `FilesStep`을 쓴다 — 한 자리가 두 화면을 덮는다. */
it.each([
  ["리포 탐지", { detecting: true, candidates: [], picked: null }],
  ["샘플 로드(탐지 뒤에 줄을 선다 — D3)", { preview: { status: "loading" } }],
] as const)("FilesStep: %s가 8초를 넘기면 문구가 선다 — 짝 단언: 준비된 화면에는 없다", async (_, patch) => {
  const ready = await render(<FilesStep state={state({})} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />);
  await advance(SLOW_AFTER_MS);
  expect(ready.container.textContent).not.toContain(m.common.slow);
  const { container } = await render(<FilesStep state={state(patch as Partial<FilesStepState>)} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />);
  await advance(SLOW_AFTER_MS - 100);
  expect(container.textContent).not.toContain(m.common.slow);
  await advance(100);
  expect(container.textContent).toContain(m.common.slow);
});

/** `RefreshCw` 옆에 스피너를 **더하지** 않고 **교체**한다 (audit-ux #25 — DESIGN §6.4 "아이콘이 있는 버튼"). */
it("재연결 중에는 아이콘이 스피너로 바뀌고 글리프는 하나다 — 짝 단언: 전에는 스피너가 없다", async () => {
  mocks.connect.mockImplementation(() => new Promise(() => {}));
  const { container } = await render(<ReconnectButton slug="acme" label="Reconnect" />);
  const button = container.querySelector("button")!;
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  expect(button.querySelector(".animate-spin")).toBeNull();
  await act(async () => { await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(button); });
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  expect(button.querySelector(".animate-spin")).not.toBeNull();
  expect(button.getAttribute("aria-busy")).toBe("true");
});
