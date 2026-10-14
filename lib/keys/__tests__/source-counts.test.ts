import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadSurfaceCounts } from "../query";
it("표면 수와 무관하게 집계 쿼리 하나로 인가한 프로젝트를 조회한다", async () => {
  const query = vi.fn().mockResolvedValue([{ surfaceId: "a", keys: 4, locales: 2 }]);
  const prisma = { $queryRaw: query } as unknown as PrismaClient;
  expect(await loadSurfaceCounts(prisma, "p")).toEqual([{ surfaceId: "a", keys: 4, locales: 2 }]);
  expect(query).toHaveBeenCalledTimes(1);
  // 바인딩 값은 projectId뿐이다 — 끼운 조각(`notRemoving`)은 값이 없는 SQL이다(locale-add: 언어 수는 작업 언어만).
  const values = query.mock.calls[0]?.slice(1) ?? [];
  expect(values.filter(value => typeof value === "string").every(value => value === "p")).toBe(true);
  expect(values.filter(value => typeof value !== "string").map(value => (value as { values: unknown[] }).values)).toEqual([[]]);
});
