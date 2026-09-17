import { describe, expect, it } from "vitest";
import { unpublishedWhere } from "../unpublished";

/**
 * 미발송 술어의 where 조각 — `countUnpublished`와 pull 1층 스킵이 같은 객체를 쓴다. 조건 하나가 빠지면
 * 어느 쪽이 빠졌든 같은 자리에서 red가 나야 한다.
 */
describe("unpublishedWhere — 미발송 술어의 where 조각", () => {
  const T = new Date("2026-09-01T10:00:00Z");

  it("사람 저자 + 활성 표면 + 마지막 판정 이후를 전부 요구한다", () => {
    expect(unpublishedWhere("p1", T)).toEqual({
      projectId: "p1",
      surfaceId: undefined,
      surface: { archivedAt: null },
      updatedBy: { not: null },
      updatedAt: { gt: T },
    });
  });

  it("한 번도 안 보냈으면(lastPulledAt=null) 시각 조건이 없다 — 사람이 만진 행 전부", () => {
    expect(unpublishedWhere("p1", null)).not.toHaveProperty("updatedAt");
    expect(unpublishedWhere("p1", null)).toMatchObject({ updatedBy: { not: null } });
  });

  it("surfaceId를 주면 그 표면으로 더 좁힌다 (짝: 안 주면 undefined라 Prisma가 무시한다)", () => {
    expect(unpublishedWhere("p1", T, "s1")).toMatchObject({ surfaceId: "s1" });
    expect(unpublishedWhere("p1", T).surfaceId).toBeUndefined();
  });
});
