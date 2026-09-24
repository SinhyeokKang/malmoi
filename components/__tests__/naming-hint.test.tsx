// @vitest-environment jsdom
import { expect, it } from "vitest";
import { NamingStep } from "@/components/onboarding/steps/naming";
import { syncBranchFor } from "@/lib/pull/sync-branch";
import { render } from "./helpers/dom";

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

/**
 * **오류가 필드에 매달린다** (DESIGN §6.4 — "필드의 aria-invalid/aria-describedby는 소비자가 잇는다").
 * `FormGroup`이 안정된 id와 `role="alert"`을 주지만 그것을 가리키는 것은 호출부다: 안 이으면
 * 포커스가 입력에 있는 스크린리더 사용자는 **무엇을 고쳐야 하는지** 못 듣는다. 이 화면이 그 유일한
 * 소비자다(리포 전체에서 `FormGroup error`는 여기 하나다).
 *
 * ⚠️ **술어가 `aria-invalid`와 같아야 한다** — 갈리면 오류가 없을 때 없는 id를 가리킨다.
 */
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

it("오류가 없으면 없는 id를 가리키지 않는다", async () => {
  const { container } = await render(<NamingStep state={state} onChange={() => {}} />);
  const field = container.querySelector<HTMLInputElement>("#project-slug")!;
  expect(field.getAttribute("aria-invalid")).toBeNull();
  expect(field.getAttribute("aria-describedby")).toBeNull();
});
