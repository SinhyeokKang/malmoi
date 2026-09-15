import { describe, expect, it } from "vitest";
import { planImportConfirmation } from "../confirm";

describe("planImportConfirmation", () => {
  for (const unsent of [0, 3]) for (const openPr of [null, undefined, { number: 12, url: "https://github.com/o/r/pull/12" }]) {
    it(`unsent=${unsent}, PR=${String(openPr)}의 위험을 보존한다`, () => {
      expect(planImportConfirmation({ unsent, openPr })).toEqual({ unsent, openPr, recommendSend: unsent > 0, atRisk: unsent > 0 || openPr !== null });
    });
  }
});
