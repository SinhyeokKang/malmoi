import { describe, expect, it, vi } from "vitest";

// `lib/keys/query.ts`가 `server-only`를 문다 — vitest에서 그 패키지는 `react-server` 조건 밖이라
// 던진다. 다른 Action 테스트들과 같은 관용구다.
vi.mock("server-only", () => ({}));

import { countUnpublished, loadMemberships } from "@/lib/keys/query";

import { createHarness, type Seed } from "./harness";

/**
 * 신설 조회 둘의 **테넌트 좁힘**을 판정한다. 둘 다 2026-09-06에 밟은 부류다 — 그때 조회가 사용자로
 * 좁혀지지 않아 남의 행이 나왔다.
 */

const PULLED = new Date("2026-09-05T00:00:00Z");

function seed(): Seed {
  return {
    projects: [
      { id: "p1", slug: "acme", name: "Acme" },
      { id: "p2", slug: "beta", name: "Beta" },
    ],
    users: [
      { id: "u1", email: "a@x.com", name: "A" },
      { id: "u2", email: "b@x.com", name: "B" },
    ],
    members: [
      { projectId: "p1", userId: "u1", role: "OWNER" },
      { projectId: "p2", userId: "u2", role: "EDITOR" },
    ],
    keys: [
      { id: "k1", projectId: "p1", key: "a", sourceText: "A", description: null, sortIndex: 0, orphaned: false },
      { id: "k2", projectId: "p2", key: "a", sourceText: "A", description: null, sortIndex: 0, orphaned: false },
    ],
    translations: [
      // p1: 사람이 만졌고 마지막 판정 뒤 — 미배포 1건
      { keyId: "k1", localeCode: "ko", value: "v", description: null, placeholders: null, needsReview: false, updatedBy: "u1", updatedAt: new Date("2026-09-06T00:00:00Z") },
      // p1: push가 쓴 행 — 시각은 더 최근이지만 저자가 리포다
      { keyId: "k1", localeCode: "fr", value: "v", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-07T00:00:00Z") },
      // p1: 사람이 만졌지만 이미 보냈다
      { keyId: "k1", localeCode: "ja", value: "v", description: null, placeholders: null, needsReview: false, updatedBy: "u1", updatedAt: new Date("2026-09-04T00:00:00Z") },
      // p2: 다른 테넌트의 미배포 — 세면 안 된다
      { keyId: "k2", localeCode: "ko", value: "v", description: null, placeholders: null, needsReview: false, updatedBy: "u2", updatedAt: new Date("2026-09-06T00:00:00Z") },
    ],
  };
}

describe("countUnpublished", () => {
  it("사람이 만졌고 마지막 판정 뒤에 바뀐 행만 센다", async () => {
    const { prisma } = createHarness(seed());
    expect(await countUnpublished(prisma, "p1", PULLED)).toBe(1);
  });

  it("다른 프로젝트의 행을 세지 않는다 — RLS가 없어 애플리케이션이 유일한 방어선이다", async () => {
    const { prisma } = createHarness(seed());
    expect(await countUnpublished(prisma, "p2", PULLED)).toBe(1);
  });

  it("한 번도 안 보냈으면 사람이 만진 행이 전부다 — push가 쓴 행은 여전히 빠진다", async () => {
    const { prisma } = createHarness(seed());
    expect(await countUnpublished(prisma, "p1", null)).toBe(2);
  });

  it("편집이 없는 프로젝트는 0이다", async () => {
    const { prisma } = createHarness({ ...seed(), translations: [] });
    expect(await countUnpublished(prisma, "p1", PULLED)).toBe(0);
  });
});

describe("loadMemberships", () => {
  it("내 멤버십만 낸다 — 남의 프로젝트가 사이드바에 뜨지 않는다", async () => {
    const { prisma } = createHarness(seed());
    expect(await loadMemberships(prisma, "u1")).toEqual([{ slug: "acme", name: "Acme", role: "OWNER" }]);
  });

  it("역할을 그대로 낸다 — 사이드바의 항목 노출이 이 값으로 갈린다", async () => {
    const { prisma } = createHarness(seed());
    expect((await loadMemberships(prisma, "u2"))[0]).toMatchObject({ slug: "beta", role: "EDITOR" });
  });

  it("멤버십이 없으면 빈 목록이다", async () => {
    const { prisma } = createHarness(seed());
    expect(await loadMemberships(prisma, "u3")).toEqual([]);
  });

  it("slug 오름차순이다 — 목록이 렌더마다 흔들리면 항목을 못 찾는다", async () => {
    const { prisma } = createHarness({
      ...seed(),
      members: [
        { projectId: "p2", userId: "u1", role: "EDITOR" },
        { projectId: "p1", userId: "u1", role: "OWNER" },
      ],
    });
    expect((await loadMemberships(prisma, "u1")).map((m) => m.slug)).toEqual(["acme", "beta"]);
  });
});
