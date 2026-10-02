// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { NamingStep } from "@/components/onboarding/steps/naming";
import { syncBranchFor } from "@/lib/pull/sync-branch";
import { input, render } from "./helpers/dom";

/**
 * **slug 힌트는 호스트를 말하지 않는다** (launch-readiness L7.5, audit #42). `mal-moi.com`을 박아 두어 dev.mal-moi.com의 ③에서도
 * "Opens at mal-moi.com/projects/…"로 보였다(리허설 2026-09-18 재현). 힌트의 목적은 slug가 **경로와 브랜치에 박힌다**는 것이라
 * 호스트 없이도 참이다. 브랜치는 `syncBranchFor`와 같은 값이어야 한다 — 설명이 규칙과 갈리면 PR을 못 찾는다.
 */
const state = { name: "Acme", slug: "acme-mobile", baseLocale: "en", locales: ["en", "ko"], keyCounts: {}, slugTakenAlt: undefined,
  slugTaken: false, pathTemplate: "i18n/{locale}.json", branch: "main", banner: null };

it("경로만 보이고 브랜치는 syncBranchFor와 같다", async () => {
  await render(<NamingStep state={state} onChange={() => {}} />);
  const text = document.body.textContent ?? "";
  expect(text).toContain("/projects/acme-mobile");
  expect(text).not.toMatch(/mal-moi\.com|vercel\.app|localhost/);
  expect(text).toContain(syncBranchFor("acme-mobile"));
});

/** 실제 입력이 FormGroup에서 현재 렌더된 오류·도움말을 가리킨다. */
it.each([
  { slugTaken: true, slug: "acme-mobile", label: "이미 쓰는 slug" },
  { slugTaken: false, slug: "Acme Mobile", label: "형식 위반" },
])("$label의 오류를 입력이 aria-describedby로 가리킨다", async ({ slugTaken, slug }) => {
  const { container } = await render(<NamingStep state={{ ...state, slug, slugTaken }} onChange={() => {}} />);
  const field = container.querySelector<HTMLInputElement>("#project-slug")!;
  expect(field.getAttribute("aria-invalid")).toBe("true");
  const described = document.getElementById(field.getAttribute("aria-describedby")!);
  expect(described?.getAttribute("role")).toBe("alert");
  expect(described?.textContent?.trim()).not.toBe("");
});

it("오류가 없으면 없는 id를 가리키지 않고, 그 자리의 도움말을 가리킨다", async () => {
  const { container } = await render(<NamingStep state={state} onChange={() => {}} />);
  const field = container.querySelector<HTMLInputElement>("#project-slug")!;
  expect(field.getAttribute("aria-invalid")).toBeNull();
  const described = document.getElementById(field.getAttribute("aria-describedby")!);
  expect(described).not.toBeNull();
  expect(described?.getAttribute("role")).toBeNull();
  expect(document.getElementById("project-slug-error")).toBeNull();
});

it("collapsed locale selector fills its384px cap wrapper without inventing a384 width API", async () => {
  const locales = Array.from({ length: 11 }, (_, index) => `locale-${index}`);
  const { container } = await render(<NamingStep state={{ ...state, baseLocale: locales[0]!, locales }} onChange={() => {}} />);
  const field = container.querySelector<HTMLElement>("#project-base-locale")!;
  expect(field.classList.contains("w-full")).toBe(true);
  expect(field.classList.contains("max-w-sm")).toBe(false);
  expect(field.parentElement?.classList.contains("max-w-sm")).toBe(true);
  expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).not.toBe("");
});

it("Naming controls keep labels and events through help/error/help transitions", async () => {
  const onChange = vi.fn();
  const locales = Array.from({ length: 11 }, (_, i) => `locale-${i}`);
  const view = (slugTaken: boolean, disabled = false) => <NamingStep state={{...state, locales, baseLocale: locales[0]!, slugTaken}} disabled={disabled} onChange={onChange} />;
  const { container, rerender } = await render(view(false));
  const name = container.querySelector<HTMLInputElement>("#project-name")!;
  const slug = container.querySelector<HTMLInputElement>("#project-slug")!;
  const select = container.querySelector<HTMLButtonElement>("#project-base-locale")!;
  expect(name.hasAttribute("aria-describedby")).toBe(false);
  expect(container.querySelector('label[for="project-name"]')).not.toBeNull();
  expect(select.getAttribute("aria-labelledby")).toBe("base-locale-select-label project-base-locale");
  const help = select.getAttribute("aria-describedby");
  expect(document.getElementById(help!)?.textContent).not.toBe("");
  await input(name, "Changed");
  await input(slug, "changed");
  expect(onChange.mock.calls).toEqual([[{name:"Changed"}], [{slug:"changed",slugTaken:false}]]);
  await rerender(view(true));
  expect(container.querySelector("#project-slug")).toBe(slug);
  expect(slug.getAttribute("aria-describedby")).toBe("project-slug-error");
  expect(slug.getAttribute("aria-invalid")).toBe("true");
  expect(container.querySelector("#project-slug-help")).toBeNull();
  await rerender(view(false, true));
  expect(slug.getAttribute("aria-describedby")).toBe("project-slug-help");
  expect(slug.getAttribute("aria-invalid")).toBeNull();
  expect(select.disabled).toBe(true);
  expect(select.getAttribute("aria-describedby")).toBe(help);
});
