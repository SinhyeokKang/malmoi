import { expect, it } from "vitest";
import { finalizationPending } from "../finalize";
it("requires exactly the reviewed finalize migration after R1; never ignores failed migrations", () => {
  const files = [{ name: "r1", checksum: "one" }, { name: "final", checksum: "two" }];
  expect(finalizationPending(files, [{ name: "r1", checksum: "one", finished: true, rolledBack: false }], "final")).toBe(true);
  expect(() => finalizationPending(files, [], "final")).toThrow();
  expect(() => finalizationPending(files, [{ name: "r1", checksum: "edited", finished: true, rolledBack: false }], "final")).toThrow();
  expect(() => finalizationPending(files, [{ name: "r1", checksum: "one", finished: true, rolledBack: false }, { name: "final", checksum: "two", finished: false, rolledBack: false }], "final")).toThrow();
});
