// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilesStep, type FilesStepState } from "@/components/onboarding/steps/files";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * **Files 단계 순차 판** (responsive-app A5 · 시안 AT7). body content box가 608 미만이면 후보 목록과 샘플 표를 한 판씩 보이고,
 * `View sample` / `Candidates` 두 버튼이 판을 오간다.
 *
 * ⚠️ **jsdom은 폭을 못 잰다** — 전역 `ResizeObserver` mock은 콜백을 부르지 않으므로 여기서 부를 수 있는 stub으로 바꾼다.
 * 판 표시는 클래스(`hidden`)와 `data-files-*` 속성으로 단언한다. 판 전환은 **같은 트리를 CSS로 가린다** — 다시 그리지 않아야
 * 수동 지정 폼의 열림·입력이 resize에 살아남는다.
 */
type Observed = { callback: ResizeObserverCallback; targets: Set<Element> };
const observers = new Set<Observed>();
const original = globalThis.ResizeObserver;
class StubObserver {
  private readonly entry: Observed;
  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback, targets: new Set() };
    observers.add(this.entry);
  }
  observe(target: Element) { this.entry.targets.add(target); }
  unobserve(target: Element) { this.entry.targets.delete(target); }
  disconnect() { observers.delete(this.entry); }
}

async function resize(width: number) {
  await act(async () => {
    for (const { callback, targets } of observers) {
      for (const target of targets) {
        if (!target.hasAttribute("data-files-body")) continue;
        callback([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      }
    }
  });
}

/** 가린 판 안에 포커스가 남으면 브라우저는 `body`로 돌린다 — jsdom은 그대로 두므로 흉내 낸다(POSTMORTEM 2026-09-20). */
let fixup: MutationObserver | undefined;
beforeEach(() => {
  globalThis.ResizeObserver = StubObserver as unknown as typeof ResizeObserver;
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".hidden") !== null) active.blur();
  });
  fixup.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
});
afterEach(() => {
  fixup?.disconnect();
  globalThis.ResizeObserver = original;
  observers.clear();
});

const click = async (node: Element) => { await act(async () => { await userEvent.setup().click(node); }); };

const candidate = (path: string): CandidateSummary => ({
  outputPaths: [path.replace("{locale}", "en")],
  adapter: "json-catalog",
  pathTemplate: path,
  locales: ["en", "ko"],
  baseLocale: "en",
  keys: { status: "counted", count: 3 },
  samples: [{ locale: "en", rows: [{ key: "a", value: "A" }], total: 1 }],
});

const base: FilesStepState = {
  detecting: false,
  detectError: undefined,
  candidates: [candidate("src/locales/{locale}.json"), candidate("public/{locale}/app.json")],
  picked: 0,
  locale: "en",
  preview: { status: "ready", rows: [{ key: "a", value: "A" }], total: 1 },
  manual: { adapter: "json-catalog", pathTemplate: "", baseLocale: "" },
  manualMatched: false,
  adapters: [{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "src/locales/{locale}.json" }],
  repoLabel: "owner/repo",
  branch: "main",
  banner: null,
};

const handlers = () => ({ onPick: vi.fn(), onLocale: vi.fn(), onManual: vi.fn(), onRetry: vi.fn() });

async function draw(state: FilesStepState = base, selection?: Parameters<typeof FilesStep>[0]["selection"]) {
  const fns = handlers();
  const { container, rerender } = await render(<FilesStep state={state} selection={selection} {...fns} />);
  const root = () => container.querySelector<HTMLElement>("[data-files-body]")!;
  const pane = (name: "candidates" | "sample") => container.querySelector<HTMLElement>(`[data-files-pane="${name}"]`)!;
  const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label);
  return { container, rerender, fns, root, pane, button };
}

const shown = (node: HTMLElement) => !node.classList.contains("hidden");

describe("판 판정 — body content box 608", () => {
  it("재기 전에는 두 판(데스크톱 fallback)이고 판 버튼이 없다", async () => {
    const { root, pane, button } = await draw();
    expect(root().dataset.filesMode).toBe("split");
    expect(shown(pane("candidates"))).toBe(true);
    expect(shown(pane("sample"))).toBe(true);
    expect(button(en.responsive.viewSample)).toBeUndefined();
    expect(button(en.responsive.backToCandidates)).toBeUndefined();
  });

  it.each([[607, "sequential"], [608, "split"], [609, "split"], [343, "sequential"]])("%i → %s", async (width, mode) => {
    const { root } = await draw();
    await resize(width);
    expect(root().dataset.filesMode).toBe(mode);
  });

  it("순차 판은 후보부터 보이고 샘플 판과 핸들을 가린다", async () => {
    const { container, pane, button } = await draw();
    await resize(607);
    expect(shown(pane("candidates"))).toBe(true);
    expect(shown(pane("sample"))).toBe(false);
    expect(container.querySelector<HTMLElement>("[data-resize-handle]")!.classList.contains("hidden")).toBe(true);
    expect(button(en.responsive.viewSample)).toBeDefined();
  });
});

describe("판 전환 — step을 진행시키지 않고 부모 상태를 건드리지 않는다", () => {
  it("View sample → 샘플 판 · Candidates 버튼에 포커스, Candidates → 후보 판 · View sample에 포커스", async () => {
    const { pane, button, fns } = await draw();
    await resize(400);
    await click(button(en.responsive.viewSample)!);
    expect(shown(pane("candidates"))).toBe(false);
    expect(shown(pane("sample"))).toBe(true);
    expect(document.activeElement).toBe(button(en.responsive.backToCandidates));

    await click(button(en.responsive.backToCandidates)!);
    expect(shown(pane("candidates"))).toBe(true);
    expect(shown(pane("sample"))).toBe(false);
    expect(document.activeElement).toBe(button(en.responsive.viewSample));
    // 판 전환은 고르기·언어·재시도가 아니다 — 탐지·샘플 조회를 다시 부르지 않는다.
    for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
  });

  it("후보 선택은 판을 오가도 그대로다", async () => {
    const { container, button } = await draw({ ...base, picked: 1 });
    await resize(400);
    await click(button(en.responsive.viewSample)!);
    await click(button(en.responsive.backToCandidates)!);
    const radios = [...container.querySelectorAll<HTMLElement>(`[aria-label="${en.newProject.files.candidates}"] [role="radio"]`)];
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("resize만으로는 콜백(탐지·샘플 조회)이 하나도 불리지 않는다 · 마지막 판을 기억한다", async () => {
    const { pane, button, fns } = await draw();
    await resize(400);
    await click(button(en.responsive.viewSample)!);
    await resize(900);
    expect(shown(pane("candidates"))).toBe(true);
    expect(shown(pane("sample"))).toBe(true);
    await resize(400);
    expect(shown(pane("sample"))).toBe(true);
    expect(shown(pane("candidates"))).toBe(false);
    for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
  });

  it("수동 지정 폼의 열림은 resize에 살아남는다 — 같은 트리를 가린다", async () => {
    const { container, button } = await draw();
    await click(button(en.newProject.files.setPath)!);
    expect(container.querySelector("#manual-path")).not.toBeNull();
    await resize(400);
    await resize(900);
    await resize(400);
    expect(container.querySelector("#manual-path")).not.toBeNull();
  });
});

describe("샘플 판 — 상태 문장과 표 이름", () => {
  it.each([
    ["loading", { status: "loading" } as const, undefined],
    ["unavailable", { status: "unavailable" } as const, en.newProject.files.preview.unavailable],
    ["expired", { status: "expired" } as const, en.errors.onboarding["sample-expired"]],
  ])("%s 샘플이 순차 판에서도 선다", async (_label, preview, text) => {
    const { container, pane, button } = await draw({ ...base, preview });
    await resize(400);
    await click(button(en.responsive.viewSample)!);
    const table = pane("sample").querySelector("table");
    expect(table?.getAttribute("aria-label")).toBe(en.newProject.files.preview.rows);
    if (text !== undefined) expect(pane("sample").textContent).toContain(text);
    else expect(container.querySelectorAll("tbody tr[aria-hidden]").length).toBeGreaterThan(0);
  });

  it("후보 0건(수동 지정)도 View sample로 빈 샘플 판에 닿는다", async () => {
    const { container, pane, button } = await draw({ ...base, candidates: [], picked: null });
    await resize(400);
    expect(container.querySelector("#manual-path")).not.toBeNull();
    await click(button(en.responsive.viewSample)!);
    expect(pane("sample").textContent).toContain(en.newProject.files.preview.none);
  });

  it("샘플 툴바의 경로는 말줄임 대신 감긴다 — 터치에서도 전문이 보인다", async () => {
    const { pane } = await draw();
    const path = [...pane("sample").querySelectorAll<HTMLElement>("span")].find((s) => s.textContent === base.candidates[0]!.pathTemplate);
    expect(path?.className).not.toMatch(/\btruncate\b/);
    expect(path?.className).toMatch(/\bbreak-all\b/);
  });
});

describe("Add sources — 행 안 미리보기 버튼이 샘플 판을 연다", () => {
  it("순차 판에서 미리보기 버튼 → onPick + 샘플 판", async () => {
    const selection = { checked: new Set<number>(), locked: new Set<number>(), conflicts: [], onToggle: vi.fn() };
    const { container, pane, fns } = await draw(base, selection);
    await resize(400);
    const preview = container.querySelector<HTMLButtonElement>(`button[aria-label="${en.newProject.files.previewCandidate(base.candidates[1]!.pathTemplate)}"]`)!;
    await click(preview);
    expect(fns.onPick).toHaveBeenCalledWith(1);
    expect(shown(pane("sample"))).toBe(true);
    expect(shown(pane("candidates"))).toBe(false);
    // 누른 행 버튼은 가려졌다 — 포커스가 `body`로 빠지지 않고 Candidates로 선다.
    expect(document.activeElement).toBe([...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === en.responsive.backToCandidates));
  });

  it("체크박스 갈래도 판을 오가면 고른 행·체크가 그대로다", async () => {
    const selection = { checked: new Set<number>([1]), locked: new Set<number>(), conflicts: [], onToggle: vi.fn() };
    const { container, button, fns } = await draw({ ...base, picked: 1 }, selection);
    await resize(400);
    await click(button(en.responsive.viewSample)!);
    await click(button(en.responsive.backToCandidates)!);
    const boxes = [...container.querySelectorAll<HTMLElement>('[role="checkbox"]')];
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(selection.onToggle).not.toHaveBeenCalled();
    for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
  });

  it("두 판에서는 미리보기 버튼이 판을 바꾸지 않는다", async () => {
    const selection = { checked: new Set<number>(), locked: new Set<number>(), conflicts: [], onToggle: vi.fn() };
    const { container, pane } = await draw(base, selection);
    await resize(900);
    await click(container.querySelector<HTMLButtonElement>(`button[aria-label="${en.newProject.files.previewCandidate(base.candidates[1]!.pathTemplate)}"]`)!);
    expect(shown(pane("sample"))).toBe(true);
    expect(shown(pane("candidates"))).toBe(true);
  });
});

/**
 * **판 버튼 형** (malmoi#230 · #231 · 시안 AT7). View sample은 후보 목록 아래 본문 전폭 · 가운데 정렬이고, ‹ Candidates는 번역 상세 ‹ Keys와
 * 같은 "돌아가기" 형(ghost sm + ChevronLeft)이다 — 손 사본 클래스가 아니라 같은 variant/size 조합이다.
 */
describe("판 버튼 형", () => {
  it("View sample은 전폭 기본 버튼이다(오른쪽 정렬 래퍼 없음)", async () => {
    const { button } = await draw();
    await resize(400);
    const view = button(en.responsive.viewSample)!;
    expect(view.className.split(/\s+/)).toContain("w-full");
    expect(view.parentElement?.className ?? "").not.toMatch(/justify-end/);
  });

  it("Candidates는 번역 ‹ Keys와 같은 ghost sm 조합이다", async () => {
    const { button } = await draw();
    await resize(400);
    await click(button(en.responsive.viewSample)!);
    const back = button(en.responsive.backToCandidates)!;
    for (const cls of ["h-7", "px-2", "text-xs"]) expect(back.className.split(/\s+/), cls).toContain(cls);
    expect(back.className).not.toMatch(/\bh-9\b/);
    const source = (await import("node:fs")).readFileSync("components/onboarding/steps/files.tsx", "utf8");
    expect(source).toMatch(/<Button ref=\{backRef\} variant="ghost" size="sm"/);
    expect((await import("node:fs")).readFileSync("components/translations/workspace/workspace.tsx", "utf8")).toMatch(/<Button ref=\{backRef\} variant="ghost" size="sm"/);
  });
});
