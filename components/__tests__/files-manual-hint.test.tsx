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
