// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { FilesStep, type FilesStepState } from "@/components/onboarding/steps/files";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

/**
 * **잘린 후보 경로·개수 줄의 전문이 닿는다** (malmoi#97). 좌측 목록이 240px라 `public/_locales/{l…`·`3 languages · 903 …`로
 * 잘렸고, 선택하지 않은 후보는 경로를 읽을 길이 없었다(같은 디렉터리의 두 후보가 구별되지 않는다). 잘림을 받되 전문을 `title`로 든다
 * — #90의 초대한 사람 칸과 같은 형이다. 소비자가 둘이라(새 프로젝트 ②의 Radio · Add sources의 Checkbox) 둘 다 센다.
 */
const candidate: CandidateSummary = {
  outputPaths: ["public/_locales/en/messages.json"],
  adapter: "chrome-locales",
  label: "Chrome",
  pathTemplate: "public/_locales/{locale}/messages.json",
  locales: ["en", "ko", "fr"],
  baseLocale: "en",
  keys: { status: "counted", count: 903 },
  samples: [{ locale: "en", rows: [{ key: "a", value: "A" }], total: 1 }],
};

const state: FilesStepState = {
  detecting: false,
  detectError: undefined,
  candidates: [candidate],
  picked: 0,
  locale: "en",
  preview: { status: "loading" },
  manual: { adapter: "json-catalog", pathTemplate: "", baseLocale: "" },
  manualMatched: false,
  adapters: [{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "src/locales/{locale}.json" }],
  repoLabel: "owner/repo",
  branch: "main",
  banner: null,
};

const noop = vi.fn();
const count = m.newProject.files.summaryShort(3, m.newProject.files.keys(903));

function truncated(list: Element, text: string): HTMLElement | undefined {
  return [...list.querySelectorAll<HTMLElement>(".truncate")].find((node) => node.textContent === text);
}

it.each([
  ["Radio(새 프로젝트 ②)", undefined],
  ["Checkbox(Add sources)", { checked: new Set<number>(), locked: new Set<number>(), conflicts: [], onToggle: noop }],
])("%s — 잘리는 경로·개수 줄이 title로 전문을 든다", async (_label, selection) => {
  const { container } = await render(
    <FilesStep state={state} selection={selection} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />,
  );
  const list = container.querySelector(`ul[aria-label="${m.newProject.files.candidates}"]`);
  if (!list) throw new Error("Missing candidate list");
  expect(truncated(list, candidate.pathTemplate)?.getAttribute("title")).toBe(candidate.pathTemplate);
  expect(truncated(list, count)?.getAttribute("title")).toBe(count);
});
