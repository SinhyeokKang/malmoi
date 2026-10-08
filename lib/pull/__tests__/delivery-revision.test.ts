import { expect, it, vi } from "vitest";
import { readDeliveryRevision } from "../delivery-revision";

it("orders surface/revision pairs and keeps invalidated or archived confirmations in the barrier", async () => {
  const findMany = vi.fn(async () => [{ surfaceId: "b", revision: "r2" }, { surfaceId: "a", revision: "r1" }]);
  expect(await readDeliveryRevision({ deliveryConfirmation: { findMany } } as never, "p"))
    .toBe('[["a","r1"],["b","r2"]]');
  expect(findMany).toHaveBeenCalledWith({ where: { projectId: "p" }, select: { surfaceId: true, revision: true }, orderBy: { surfaceId: "asc" } });
});
it("distinguishes missing, new, and repeated confirmations of the same surface", async () => {
  const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ surfaceId: "a", revision: "r1" }])
    .mockResolvedValueOnce([{ surfaceId: "a", revision: "r2" }]);
  const db = { deliveryConfirmation: { findMany } } as never;
  const barriers = await Promise.all([readDeliveryRevision(db, "p"), readDeliveryRevision(db, "p"), readDeliveryRevision(db, "p")]);
  expect(new Set(barriers).size).toBe(3);
});
it("propagates query failure instead of pretending there were no confirmations", async () => {
  const db = { deliveryConfirmation: { findMany: vi.fn().mockRejectedValue(new Error("database unavailable")) } } as never;
  await expect(readDeliveryRevision(db, "p")).rejects.toThrow("database unavailable");
});
