// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { FilesStep, type FilesStepState } from "@/components/onboarding/steps/files";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

/**
 * **"위의 선택이 지워진다"는 위에 선택이 있을 때만 참이다** (malmoi#47).
 *
 * ⚠️ `ManualForm`의 소비자가 둘이다 — 후보 0개(예외 E, 좌측이 폼 하나뿐)와 후보 목록 아래 토글.
 * 앞엣것에서 그 문장은 존재하지 않는 UI를 가리킨다.
 */
const HINT = m.newProject.files.manual.hint;

const candidate: CandidateSummary = {
  outputPaths: ["locales/en.json"],
  adapter: "json-catalog",
  label: "JSON",
  pathTemplate: "locales/{locale}.json",
  locales: ["en"],
  baseLocale: "en",
  keys: { status: "counted", count: 1 },
  samples: [{ locale: "en", rows: [{ key: "a", value: "A" }], total: 1 }],
};

function state(candidates: CandidateSummary[]): FilesStepState {
  return {
    detecting: false,
    detectError: undefined,
    candidates,
    picked: candidates.length > 0 ? 0 : null,
    locale: "en",
    preview: { status: "loading" },
    manual: { adapter: "json-catalog", pathTemplate: "", baseLocale: "" },
    manualMatched: false,
    adapters: [{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "src/locales/{locale}.json" }],
    repoLabel: "owner/repo",
    branch: "main",
    banner: null,
  };
}

const noop = vi.fn();

it("후보가 0개면 안내 문장이 없다 — 위에 선택이 없다", async () => {
  const { container } = await render(
    <FilesStep state={state([])} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />,
  );
  // 폼이 실제로 섰는지부터 — 안 서서 문장이 없는 것이면 가짜 green이다.
  expect(container.querySelector("#manual-path")).not.toBeNull();
  expect(container.textContent).not.toContain(HINT);
});

it("후보 목록 아래 토글로 연 폼에는 안내 문장이 남는다", async () => {
  const { container } = await render(
    <FilesStep state={state([candidate])} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />,
  );
  const toggle = [...container.querySelectorAll("button")].find((b) => b.textContent === m.newProject.files.setPath);
  if (!toggle) throw new Error("Missing toggle");
  await act(async () => { await userEvent.setup().click(toggle); });

  expect(container.querySelector("#manual-path")).not.toBeNull();
  expect(container.textContent).toContain(HINT);
});

it("기존 소스는 체크된 채 잠기고 키보드·마우스가 선택을 바꾸지 못한다", async () => {
  const toggle = vi.fn();
  const { container } = await render(<FilesStep state={state([candidate])} selection={{ checked: new Set(), locked: new Set([0]), conflicts: [], onToggle: toggle }} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />);
  const checkbox = container.querySelector<HTMLButtonElement>('[role="checkbox"]')!;
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(checkbox.disabled).toBe(true);
  await act(async () => { await userEvent.setup().click(checkbox); checkbox.focus(); await userEvent.setup().keyboard(" "); });
  expect(toggle).not.toHaveBeenCalled();
});
it("pending은 열린 Portal 언어 선택과 수동 필드를 직접 잠근다", async () => {
  const onLocale = vi.fn();
  const many = { ...candidate, locales: ["en", "ko", "ja", "fr", "de", "es", "it"] };
  const view = (pending: boolean) => <FilesStep state={state([many])} pending={pending} onPick={noop} onLocale={onLocale} onManual={noop} onRetry={noop} />;
  const { container, rerender } = await render(view(false));
  await act(async () => { await userEvent.setup().click(container.querySelector('[role="combobox"]')!); });
  expect(document.querySelector('[role="option"]')).not.toBeNull();
  await rerender(view(true));
  for (const option of document.querySelectorAll('[role="option"]')) expect(option.getAttribute("aria-disabled")).toBe("true");
  expect(container.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled).toBe(true);
  expect(onLocale).not.toHaveBeenCalled();
});
