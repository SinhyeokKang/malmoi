import { expect, it } from "vitest";
import { rowLocaleProgress, summaryQueue } from "@/lib/projects/list";

it("counts identical locale names independently for each surface", () => {
  const locales = [
    { projectId: "p", surfaceId: "a", surfaceSlug: "a", code: "en", isBase: true },
    { projectId: "p", surfaceId: "b", surfaceSlug: "b", code: "en", isBase: true },
  ];
  const cells = [{ projectId: "p", surfaceId: "a", localeCode: "en", needsReview: false, count: 2 }];
  const keyTotals = new Map([["a", 2], ["b", 3]]);
  expect(rowLocaleProgress(locales, keyTotals, cells).get("p")?.map(row => [row.surfaceSlug, row.total, row.done])).toEqual([["a", 2, 2], ["b", 3, 0]]);
  expect(summaryQueue({ projects: [{ projectId: "p", archived: false }], locales, cells, keyTotals, newKeys: new Map(), unsent: new Map() }).toTranslate).toBe(3);
});
