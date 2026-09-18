// @vitest-environment jsdom
import { expect, it } from "vitest";
import { NamingStep } from "@/components/onboarding/steps/naming";
import { syncBranchFor } from "@/lib/pull/trigger";
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
