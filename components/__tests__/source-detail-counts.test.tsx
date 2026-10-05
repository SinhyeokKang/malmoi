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
  createdAt: new Date("2026-09-19T00:00:00Z"), keys: 53, locales: 1, orphanedLocales: 0, progress: { total: 53, done: 41, review: 0, percent: 77 },
  installed: true, languages: [{ code: "en", isBase: true, orphaned: false, total: 53, translated: 41, needsReview: 0, untranslated: 12, percent: 77 }],
} as unknown as SourceDetail;

const draw = (uiLocale: "en" | "ko" | "es") => render(
  <SourceDetailModal slug="p" sourceSlug="web" role="OWNER" state={{ status: "ready", detail }} now={new Date("2026-09-21T00:00:00Z")} busy={false} sources={[{ id: "s", slug: "web" }]} onRemoved={() => {}}
    onBusy={() => {}} onClose={() => {}} onReload={() => {}} onImport={() => {}} onSaved={() => {}}
    returnFocusRef={{ current: null }} fallbackFocusRef={{ current: null }} />,
  { uiLocale },
);

/** #186 — 언어 행의 "41 of 53"이 하드코드 영어여서 ko·es 화면에 `of`가 남았다. */
describe("Sources 상세 언어 행 — 번역 수 문구는 사전을 지난다", () => {
  it.each(["en", "ko", "es"] as const)("%s", async (uiLocale) => {
    await draw(uiLocale);
    const text = document.body.textContent ?? "";
    const messages = { en, ko, es }[uiLocale];
    expect(text).toContain(messages.sources.translatedOfTotal(41, 53));
    if (uiLocale !== "en") expect(text).not.toMatch(/\d+ of \d+/);
  });
});
