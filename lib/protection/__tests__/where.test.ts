import { describe, expect, it } from "vitest";

import { BACKFILL_CONDITION_SQL } from "../backfill";
import { pendingWhere } from "../where";

/**
 * 토큰 술어 조각. **행을 세는 진짜 판정은 PG 통합 테스트다**(`lib/keys/__tests__/sync-edit-protection.integration.ts`) —
 * 여기서는 조각의 모양을 고정해 사본이 조건 하나를 빠뜨리는 회귀를 소스 수준에서 막는다.
 */

describe("pendingWhere", () => {
  it("[C9] 활성 표면·활성 키·활성 로케일·토큰 있음 — 넷 다 선다", () => {
    expect(pendingWhere("p1")).toEqual({
      projectId: "p1",
      surface: { archivedAt: null },
      stringKey: { orphaned: false },
      locale: { orphaned: false },
      pendingEditToken: { not: null },
    });
  });

  it("표면을 주면 그 표면으로 좁힌다", () => {
    expect(pendingWhere("p1", "s1")).toMatchObject({ projectId: "p1", surfaceId: "s1" });
  });

  it("⚠️ 시각·저자 조건이 없다 — 토큰이 판정을 대신한다", () => {
    const where = pendingWhere("p1") as Record<string, unknown>;
    expect(where).not.toHaveProperty("updatedAt");
    expect(where).not.toHaveProperty("updatedBy");
  });
});

describe("BACKFILL_CONDITION_SQL — 옛 술어 ∧ 활성 셀 ∧ 토큰 없음", () => {
  it("[C9] 조건 여섯이 한 조각에 있다 (행 판정은 PG 테스트)", () => {
    for (const fragment of [
      `t."updatedBy" IS NOT NULL`,
      `p."lastPulledAt" IS NULL OR t."updatedAt" > p."lastPulledAt"`,
      `s."archivedAt" IS NULL`,
      `k."orphaned" = false`,
      `l."orphaned" = false`,
      `t."pendingEditToken" IS NULL`,
    ]) {
      expect(BACKFILL_CONDITION_SQL).toContain(fragment);
    }
  });
});
