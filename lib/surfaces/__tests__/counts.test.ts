import { expect, it } from "vitest";
import { summaryQueue } from "@/lib/projects/list";

it("counts identical locale names independently for each surface", () => {
  const locales = [
    { projectId: "p", surfaceId: "a", surfaceSlug: "a", code: "en", isBase: true },
    { projectId: "p", surfaceId: "b", surfaceSlug: "b", code: "en", isBase: true },
  ];
  const cells = [{ projectId: "p", surfaceId: "a", localeCode: "en", needsReview: false, count: 2 }];
  const keyTotals = new Map([["a", 2], ["b", 3]]);
  expect(summaryQueue({ projects: [{ projectId: "p", archived: false }], locales, cells, keyTotals, newKeys: new Map(), unsent: new Map() }).toTranslate).toBe(3);
});
