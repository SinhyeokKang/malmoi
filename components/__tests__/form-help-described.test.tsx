// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { FilesStep, type FilesStepState } from "@/components/onboarding/steps/files";
import { NamingStep } from "@/components/onboarding/steps/naming";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

/**
 * **필드 아래 도움말이 그 필드의 설명이다** (audit #89). `FormGroup`이 help `<p>`에 id를 안 줘서 경로 형식·slug·기준 언어의
 * 안내가 보이기만 하고 입력에 이어지지 않았다 — 포커스가 입력에 있는 스크린리더 사용자는 `{locale}`을 넣으라는 말을 못 듣는다.
 * 오류가 help를 대신할 때는 오류를 가리킨다(`naming-hint.test.tsx`).
 */
function describedText(el: Element | null): string {
  const ids = el?.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
}

const naming = { name: "Acme", slug: "acme-mobile", baseLocale: "en", locales: ["en", "ko"], keyCounts: {}, slugTakenAlt: undefined,
  slugTaken: false, pathTemplate: "i18n/{locale}.json", branch: "main", banner: null };

it("slug 입력이 경로·브랜치 힌트를 설명으로 가리킨다", async () => {
  const { container } = await render(<NamingStep state={naming} onChange={() => {}} />);
  const field = container.querySelector("#project-slug");
  expect(field?.getAttribute("aria-invalid")).toBeNull();
  expect(describedText(field)).toContain("/projects/acme-mobile");
});

it("접힌 기준 언어 Select가 힌트를 설명으로 가리킨다", async () => {
  const locales = Array.from({ length: 12 }, (_, i) => `l${String(i).padStart(2, "0")}`);
  const { container } = await render(<NamingStep state={{ ...naming, locales, baseLocale: "l00" }} onChange={() => {}} />);
  const trigger = container.querySelector("#project-base-locale");
  expect(trigger).not.toBeNull();
  expect(describedText(trigger)).toBe(document.getElementById("project-base-locale-help")?.textContent?.trim());
  expect(describedText(trigger)).not.toBe("");
});

it("수동 경로 입력이 형식 힌트를 설명으로 가리킨다", async () => {
  const state: FilesStepState = {
    detecting: false, detectError: undefined, candidates: [], picked: null, locale: "en", preview: { status: "loading" },
    manual: { adapter: "json-catalog", pathTemplate: "", baseLocale: "" }, manualMatched: false,
    adapters: [{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "src/locales/{locale}.json" }],
    repoLabel: "owner/repo", branch: "main", banner: null,
  };
  const noop = vi.fn();
  const { container } = await render(<FilesStep state={state} onPick={noop} onLocale={noop} onManual={noop} onRetry={noop} />);
  const field = container.querySelector("#manual-path");
  expect(field).not.toBeNull();
  expect(describedText(field)).toContain("{locale}");
  expect(m.newProject.files.manual.path).not.toBe("");
});
