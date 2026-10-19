// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { SourceDetailModal } from "@/components/sources/source-detail-modal";
import type { SourceDetail } from "@/lib/sources/query";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

import { render } from "./helpers/dom";

vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: vi.fn(), updateBaseLocale: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));

const detail = {
  id: "s", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"),
  lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"),
  createdAt: new Date("2026-09-19T00:00:00Z"), keys: 53, locales: 1, orphanedLocales: 0, progress: { total: 53, done: 41, review: 3, percent: 83 },
  installed: true, languageChangesSupported: false, languages: [{ code: "en", isBase: true, orphaned: false, total: 53, translated: 41, needsReview: 3, untranslated: 9, percent: 83, change: null, unsent: false }],
} as unknown as SourceDetail;

const draw = (uiLocale: "en" | "ko" | "es", shown: SourceDetail = detail) => render(
  <SourceDetailModal slug="p" sourceSlug="web" role="OWNER" state={{ status: "ready", detail: shown }} now={new Date("2026-09-21T00:00:00Z")} busy={false} sources={[{ id: "s", slug: "web" }]} onRemoved={() => {}} onLost={() => {}}
    onBusy={() => {}} onClose={() => {}} onReload={() => {}} onImport={() => {}} onSaved={() => {}}
    returnFocusRef={{ current: null }} fallbackFocusRef={{ current: null }} />,
  { uiLocale },
);

/**
 * #186 — 언어 행의 "41 of 53"이 하드코드 영어여서 ko·es 화면에 `of`가 남았다.
 * source-row-locale-meter — 분자는 완료 + 검토 대기(41 + 3)다. 옆 퍼센트(83%)와 같은 비율을 말해야 한다.
 */
describe("Sources 상세 언어 행 — 번역 수 문구는 사전을 지난다", () => {
  it.each(["en", "ko", "es"] as const)("%s", async (uiLocale) => {
    await draw(uiLocale);
    const text = document.body.textContent ?? "";
    const messages = { en, ko, es }[uiLocale];
    expect(text).toContain(messages.sources.translatedOfTotal(44, 53));
    expect(text).not.toContain(messages.sources.translatedOfTotal(41, 53));
    expect(text).toContain("83%");
    if (uiLocale !== "en") expect(text).not.toMatch(/\d+ of \d+/);
  });
});

/*
  source-row-locale-meter T7③ — 막대 폭은 목록 행과 같은 `meterValue`에서 나온다. 두 집계 사이 적재가 바뀌어 분자가 분모를 넘어도
  완료 구간은 트랙을 넘지 않고 검토 구간은 남은 칸까지만이다. 진행률 칸은 200(850 미만은 그대로 `w-auto flex-1`).
*/
describe("Sources 상세 언어 행 — 막대 폭·진행률 칸", () => {
  it("폭과 오른쪽 수치는 meterValue의 clamp를 따른다", async () => {
    const raced = { ...detail, languages: [{ ...detail.languages[0]!, translated: 50, needsReview: 10, untranslated: 0, percent: 100 }] } as unknown as SourceDetail;
    await draw("en", raced);
    const row = document.querySelector('[data-language-row="en"]')!;
    const [done, review] = [...row.querySelectorAll<HTMLElement>('[style*="width"]')].map(node => Number.parseFloat(node.style.width));
    expect(done).toBeCloseTo((50 / 53) * 100);
    expect(review).toBeCloseTo((3 / 53) * 100);
    // 오른쪽 수치도 같은 clamp — 60 of 53이 아니다.
    const progress = row.textContent ?? "";
    expect(progress).toContain(`100%${en.sources.translatedOfTotal(53, 53)}`);
    expect(progress).not.toContain(en.sources.translatedOfTotal(60, 53));
  });

  it("진행률 칸은 w-[200px], 850 미만 규칙은 그대로", async () => {
    await draw("en");
    const row = document.querySelector('[data-language-row="en"]')!;
    const column = [...row.children].find(node => node.classList.contains("flex-col") && node.textContent?.includes("%"))!;
    expect([...column.classList]).toEqual(expect.arrayContaining(["w-[200px]", "@max-[850px]:w-auto", "@max-[850px]:flex-1"]));
    expect(column.classList.contains("w-[300px]")).toBe(false);
  });
});

it.each([true, false])("Sources 상세 basePath 표시와 Android 읽기 전용: %s", async android => {
  const pathTemplate = android ? "app/src/main/res/values-{locale}/strings.xml" : "i18n/{locale}.json";
  const basePath = "app/src/main/res/values/strings.xml";
  await draw("en", { ...detail, repository: { repoOwner: "o", repoName: "r", baseBranch: "main" }, connection: { adapterName: android ? "android-strings" : "json-catalog", format: "Format", pathTemplate, ...(android ? { basePath } : {}) } });
  const cell = document.querySelector('[data-source-connection] dd')!;
  expect(cell.textContent).toBe(android ? basePath + pathTemplate : pathTemplate);
  expect(cell.querySelectorAll("br")).toHaveLength(android ? 1 : 0);
  if (android) {
    expect(document.body.textContent).toContain(en.errors.repositorySettings["android-base-fixed"]);
    expect(document.querySelector('[role="combobox"]')).toBeNull();
    expect([...document.querySelectorAll("button")].some(b => b.textContent === "Save")).toBe(false);
  }
});
