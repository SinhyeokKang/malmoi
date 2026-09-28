import { readFileSync } from "node:fs";

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

describe("사본 ④ — Publish 미리보기가 무엇을 PR로 보낼지 같은 술어로 고른다 (T8)", () => {
  /** 표시 행은 Codex review CR-01부터 `lib/pull/load.ts#loadPreviewSnapshot`이 지문과 같은 스냅샷에서 읽는다 — 술어는 그 자리의 `pendingWhere`다. */
  it("Publish 미리보기가 `loadPreviewSnapshot`의 `pendingWhere`로 행을 고르고 옛 저자·시각 조건을 들지 않는다", () => {
    const read = readFileSync("lib/publish/read.ts", "utf8");
    const load = readFileSync("lib/pull/load.ts", "utf8");
    const snapshot = load.slice(load.indexOf("export async function loadPreviewSnapshot"), load.indexOf("async function loadSnapshot("));
    expect(read).toContain("loadPreviewSnapshot(prisma, slug, PREVIEW_LIMIT)");
    expect(snapshot).toContain("pendingWhere(state.project.id)");
    for (const source of [read, snapshot]) expect(source).not.toContain("updatedBy: { not: null }");
  });

  it("`lib/keys/unpublished.ts`(옛 공유 조각)가 사라졌다 — 술어의 주인은 하나다", () => {
    expect(() => readFileSync("lib/keys/unpublished.ts", "utf8")).toThrow();
  });
});
