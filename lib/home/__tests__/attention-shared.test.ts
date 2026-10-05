import { expect, it } from "vitest";
import { CircleX, TriangleAlert } from "lucide-react";
import { collectAttention, neverFilledLocales } from "../attention";
import { attentionHref, attentionTile, body, tail, title } from "../attention-view";
import { routes, ALL_NAMESPACES, bannerTranslationsHref } from "@/lib/routes";
import { en } from "@/messages/en";

const at = new Date("2026-10-01T00:00:00Z");
const surfaces = [{ id: "s", slug: "web", locales: [
  { code: "ko", name: "Korean", orphaned: false, createdAt: at },
  { code: "ja", name: "Japanese", orphaned: true, createdAt: at },
  { code: "es", name: "Spanish", orphaned: false, createdAt: at },
] }];
it("빈 로케일은 활성 키와 현재 채움 수를 보고 생성 시각을 보존한다", () => {
  expect(neverFilledLocales(surfaces, { keyTotals: new Map(), cells: [] })).toEqual([]);
  expect(neverFilledLocales(surfaces, { keyTotals: new Map([["s", 3]]), cells: [{ surfaceId: "s", localeCode: "es", count: 1 }] })).toEqual([
    { surfaceSlug: "web", code: "ko", name: "Korean", keys: 3, at },
  ]);
});
it("공유 수집은 상한도 배너 제외도 없다", () => {
  const failures = Array.from({ length: 7 }, (_, i) => ({ slug: `s${i}`, importError: "parse-failed" as const, importing: false, lastImportFailedAt: at }));
  expect(collectAttention(failures, [], [], new Map())).toHaveLength(7);
  expect(collectAttention([{ ...failures[0]!, importing: true }], [], [], new Map())).toEqual([]);
});
it("Home과 Inbox 링크·문장·부분 반영 칩은 같은 생성기를 쓴다", () => {
  const failed = { kind: "import_failed" as const, at, surfaceSlug: "web", reason: "parse-failed" as const };
  const partial = { ...failed, reason: "partial-import" as const };
  const review = { kind: "review" as const, at, surfaceSlug: "web", code: "ko", name: "Korean", count: 3, who: null };
  const empty = { kind: "never_filled" as const, at, surfaceSlug: "web", code: "ko", name: "Korean", keys: 3 };
  expect(attentionHref("demo", failed)).toBe(routes.sources("demo"));
  expect(attentionHref("demo", review)).toBe(routes.surfaceTranslations("demo", "web", { ns: ALL_NAMESPACES, state: "review", language: "ko" }));
  expect(attentionHref("demo", empty)).toBe(routes.surfaceTranslations("demo", "web", { ns: ALL_NAMESPACES, completion: "incomplete", language: "ko" }));
  expect(bannerTranslationsHref("demo", "web", "unsent")).toBe(routes.surfaceTranslations("demo", "web", { ns: ALL_NAMESPACES, state: "unsent" }));
  expect(attentionTile(failed)).toEqual({ icon: CircleX, tone: "danger" });
  expect(attentionTile(partial)).toEqual({ icon: TriangleAlert, tone: "warning" });
  expect(body(en, partial)).toBe(en.home.attention.partial.body);
  expect(tail(en, review)).toBe(".");
  expect(title(en, empty)).toBe(en.home.attention.neverFilled.title("web", "Korean"));
});
it("프로젝트 항목도 목록 띠와 같은 링크와 문장을 쓴다", () => {
  const setup = { kind: "setup" as const, at };
  const unsent = { kind: "unsent" as const, at, count: 3, surfaceSlug: "web" };
  expect(attentionHref("demo", setup)).toBe(routes.settings("demo"));
  expect(attentionHref("demo", unsent)).toBe(bannerTranslationsHref("demo", "web", "unsent"));
  expect(body(en, setup)).toBe(en.projects.banner.setup);
  expect(body(en, unsent)).toBe(en.projects.banner.unsent(3));
  expect(title(en, setup)).toBe("");
  expect(title(en, unsent)).toBe("web");
  expect(tail(en, unsent)).toBe("");
  expect(attentionTile(setup).tone).toBe("muted");
  expect(attentionTile(unsent).tone).toBe("muted");
});
