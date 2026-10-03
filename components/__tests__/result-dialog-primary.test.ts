import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/** 결과 Dialog의 단독 버튼은 primary다(DESIGN §6.4) — `Review again`만 default였다. */
it("revert-changed 결과 Dialog의 단독 버튼은 primary다", () => {
  const src = readFileSync("components/translations/workspace/workspace.tsx", "utf8");
  expect(src).toMatch(/<Button variant="primary" autoFocus onClick=\{onReview\}>\{w\.revert\.changed\.again\}<\/Button>/);
});
