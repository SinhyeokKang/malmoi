import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { withheldRevertable } from "../load";
import type { PendingEdit } from "../run";

/** #129 — 보류 셀 전부에 되돌릴 기준 행이 있을 때만 true. 조회는 `projectId`로 좁힌다(CLAUDE.md). 좌표 없는 편집은 증명할 수 없어 false다. */
describe("withheldRevertable", () => {
  const edit = (id: string, keyId: string, localeCode: string): PendingEdit => ({ id, token: id, cell: { surfaceId: "s", keyId, localeCode, restoreValue: "" } });
  const db = (rows: { surfaceId: string; keyId: string; localeCode: string }[]) => {
    const findMany = vi.fn(async () => rows);
    return { prisma: { translationBaseline: { findMany } } as unknown as PrismaClient, findMany };
  };

  it("전부 있으면 true — projectId와 셀 좌표로 좁혀 묻는다", async () => {
    const { prisma, findMany } = db([{ surfaceId: "s", keyId: "k1", localeCode: "en" }, { surfaceId: "s", keyId: "k2", localeCode: "fr" }]);
    expect(await withheldRevertable(prisma, "p", [edit("a", "k1", "en"), edit("b", "k2", "fr")])).toBe(true);
    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: "p", OR: [{ surfaceId: "s", keyId: "k1", localeCode: "en" }, { surfaceId: "s", keyId: "k2", localeCode: "fr" }] },
      select: { surfaceId: true, keyId: true, localeCode: true },
    });
  });
  it("하나라도 없으면 false", async () => {
    const { prisma } = db([{ surfaceId: "s", keyId: "k1", localeCode: "en" }]);
    expect(await withheldRevertable(prisma, "p", [edit("a", "k1", "en"), edit("b", "k2", "fr")])).toBe(false);
  });
  it("좌표 없는 편집이 있거나 보류가 없으면 false · 조회하지 않는다", async () => {
    const { prisma, findMany } = db([]);
    expect(await withheldRevertable(prisma, "p", [{ id: "x", token: "x" }])).toBe(false);
    expect(await withheldRevertable(prisma, "p", [])).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });
});
