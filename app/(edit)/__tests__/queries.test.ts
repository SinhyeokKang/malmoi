import { describe, expect, it, vi } from "vitest";

// `lib/keys/query.ts`가 `server-only`를 문다 — vitest에서 그 패키지는 `react-server` 조건 밖이라
// 던진다. 다른 Action 테스트들과 같은 관용구다.
vi.mock("server-only", () => ({}));

import { loadMembers, loadPendingInvitations } from "@/lib/auth/query";
import { countUnpublished, loadMemberships } from "@/lib/keys/query";
import { isUnpublished } from "@/lib/keys/view";

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
    expect(await loadMemberships(prisma, "u1")).toEqual([
      { slug: "acme", name: "Acme", role: "OWNER", installationId: "1", lastCommitSha: "a".repeat(40) },
    ]);
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

/**
 * ⚠️ **같은 술어가 두 벌이다** (2026-09-08 code-review 🟡E): `isUnpublished`는 행 단위 TS 판정이고
 * `countUnpublished`는 Prisma `where`다. 한쪽만 고치면 **배너의 숫자와 셀의 점 표시가 갈린다** —
 * 이 리포가 이미 두 번 밟은 "규칙 두 벌" 부류(`matchGlobPaths`·`scanJson`)다.
 *
 * 하네스가 그 `where`를 해석하므로, 여기서 두 경로에 **같은 행 집합**을 먹여 결과를 맞댄다.
 */
describe("isUnpublished ↔ countUnpublished — 술어가 갈리지 않는다", () => {
  const rows = seed().translations ?? [];

  for (const lastPulledAt of [PULLED, null]) {
    it(`같은 행 집합에서 같은 수를 낸다 (lastPulledAt=${lastPulledAt === null ? "null" : "있음"})`, async () => {
      const { prisma } = createHarness(seed());
      // p1의 키는 k1 하나다 — 하네스의 count가 키를 통해 projectId로 좁히는 것과 같은 범위를 손으로 만든다.
      const mine = rows.filter((t) => t.keyId === "k1");
      const byPredicate = mine.filter((t) => isUnpublished(t, lastPulledAt)).length;

      expect(await countUnpublished(prisma, "p1", lastPulledAt)).toBe(byPredicate);
    });
  }
});

/**
 * 멤버 화면의 조회 둘 (6b-2, design §3.9). **같은 축이다** — 이 표는 프로젝트 안의 전원이 보므로
 * `projectId`로 좁히지 않으면 남의 테넌트 멤버가 목록에 뜬다. RLS가 없어 애플리케이션이 유일한
 * 방어선이다 (CLAUDE.md).
 */
const NOW = new Date("2026-09-08T00:00:00Z");

function memberSeed(): Seed {
  return {
    projects: [
      { id: "p1", slug: "acme", name: "Acme" },
      { id: "p2", slug: "beta", name: "Beta" },
    ],
    users: [
      { id: "u1", email: "owner@x.com", name: "Owner" },
      { id: "u2", email: "editor@x.com", name: null },
      { id: "u3", email: "other@y.com", name: "Other" },
    ],
    members: [
      { projectId: "p1", userId: "u1", role: "OWNER", createdAt: new Date("2026-09-01T00:00:00Z") },
      { projectId: "p1", userId: "u2", role: "EDITOR", createdAt: new Date("2026-09-02T00:00:00Z") },
      { projectId: "p2", userId: "u3", role: "OWNER", createdAt: new Date("2026-09-03T00:00:00Z") },
    ],
    invitations: [
      // 대기 중 — 목록에 나온다
      { id: "i-live", projectId: "p1", email: "a@x.com", role: "EDITOR", tokenHash: "h1", expiresAt: new Date("2026-09-20T00:00:00Z"), acceptedAt: null, invitedBy: "u1" },
      // 만료 — 나오면 OWNER가 없는 링크를 기다린다
      { id: "i-expired", projectId: "p1", email: "b@x.com", role: "EDITOR", tokenHash: "h2", expiresAt: new Date("2026-09-01T00:00:00Z"), acceptedAt: null, invitedBy: "u1" },
      // 수락됨 — 그 사람은 이미 멤버 표에 있다
      { id: "i-accepted", projectId: "p1", email: "c@x.com", role: "EDITOR", tokenHash: "h3", expiresAt: new Date("2026-09-20T00:00:00Z"), acceptedAt: new Date("2026-09-05T00:00:00Z"), invitedBy: "u1" },
      // 다른 테넌트의 대기 초대
      { id: "i-other", projectId: "p2", email: "d@y.com", role: "EDITOR", tokenHash: "h4", expiresAt: new Date("2026-09-20T00:00:00Z"), acceptedAt: null, invitedBy: "u3" },
    ],
  };
}

describe("loadMembers", () => {
  it("그 프로젝트의 멤버만 낸다 — 다른 테넌트가 표에 섞이지 않는다", async () => {
    const db = createHarness(memberSeed());
    const rows = await loadMembers(db.prisma, "p1");
    expect(rows.map((r) => r.userId)).toEqual(["u1", "u2"]);
  });

  it("가입 순서다 — 목록이 렌더마다 흔들리면 행을 근육 기억으로 못 찾는다", async () => {
    const db = createHarness(memberSeed());
    const rows = await loadMembers(db.prisma, "p1");
    expect(rows.map((r) => r.joinedAt.toISOString())).toEqual([
      "2026-09-01T00:00:00.000Z",
      "2026-09-02T00:00:00.000Z",
    ]);
  });

  it("이름·이메일 라벨·역할을 함께 낸다 — 이름이 없는 사용자는 null이다 (Google 계정에 핸들이 없다)", async () => {
    const db = createHarness(memberSeed());
    const rows = await loadMembers(db.prisma, "p1");
    // ⚠️ 원문이 아니라 라벨이다 (sec-audit 발견 4) — 이 값이 그대로 RSC 페이로드로 나간다.
    expect(rows[0]).toMatchObject({ name: "Owner", emailLabel: "o***@x.com", role: "OWNER" });
    expect(rows[1]).toMatchObject({ name: null, emailLabel: "e***@x.com", role: "EDITOR" });
  });

  it("멤버가 없으면 빈 목록이다", async () => {
    const db = createHarness({ projects: [{ id: "p1", slug: "acme" }] });
    expect(await loadMembers(db.prisma, "p1")).toEqual([]);
  });
});

describe("loadPendingInvitations", () => {
  it("수락되지 않고 아직 살아 있는 것만 낸다", async () => {
    const db = createHarness(memberSeed());
    const rows = await loadPendingInvitations(db.prisma, "p1", NOW);
    expect(rows.map((r) => r.id)).toEqual(["i-live"]);
  });

  it("다른 프로젝트의 대기 초대가 섞이지 않는다", async () => {
    const db = createHarness(memberSeed());
    const rows = await loadPendingInvitations(db.prisma, "p2", NOW);
    expect(rows.map((r) => r.id)).toEqual(["i-other"]);
  });

  it("초대한 사람의 이름을 함께 낸다 — 누가 보냈는지가 행의 정보다", async () => {
    const db = createHarness(memberSeed());
    const [row] = await loadPendingInvitations(db.prisma, "p1", NOW);
    expect(row).toMatchObject({ emailLabel: "a***@x.com", role: "EDITOR", invitedByName: "Owner" });
  });

  it("대기 0건이면 빈 목록이다 — 화면이 빈 상태를 그린다", async () => {
    const db = createHarness({ projects: [{ id: "p1", slug: "acme" }] });
    expect(await loadPendingInvitations(db.prisma, "p1", NOW)).toEqual([]);
  });
});

/**
 * **로더가 원문 이메일을 안 낸다** (sec-audit 발견 4).
 *
 * 두 반환값이 `"use client"` 컴포넌트의 props로 그대로 넘어가므로, 로더가 `email`을 들고 있으면
 * 마스킹을 어디서 하든 **원문이 RSC 페이로드에 실린다.** 그래서 마스킹이 로더의 일이 됐다 —
 * 그리고 라벨은 **목록 전체를 보고** 만들어야 충돌하는 행만 넓어진다 (malmoi#18).
 */
describe("loadMembers·loadPendingInvitations — 원문 이메일이 안 나온다 (sec-audit 4)", () => {
  const withEmails = (): Seed => ({
    ...seed(),
    users: [
      { id: "u1", email: "alice@acme.com", name: "A" },
      { id: "u2", email: "andrew@acme.com", name: null },
    ],
    members: [
      { projectId: "p1", userId: "u1", role: "OWNER" },
      { projectId: "p1", userId: "u2", role: "EDITOR" },
    ],
  });

  it("멤버 행에 `email`이 없고 마스킹 라벨만 있다", async () => {
    const { prisma } = createHarness(withEmails());
    const rows = await loadMembers(prisma, "p1");
    for (const row of rows) expect(row).not.toHaveProperty("email");
    expect(rows.map((r) => r.emailLabel)).toEqual(["al***@acme.com", "an***@acme.com"]);
  });

  it("라벨은 목록 전체를 보고 만든다 — 도메인이 다르면 첫 글자만 남는다", async () => {
    const { prisma } = createHarness({
      ...withEmails(),
      users: [
        { id: "u1", email: "alice@acme.com", name: "A" },
        { id: "u2", email: "bob@other.com", name: null },
      ],
    });
    expect((await loadMembers(prisma, "p1")).map((r) => r.emailLabel)).toEqual([
      "a***@acme.com",
      "b***@other.com",
    ]);
  });

  it("이메일이 없는 멤버는 라벨이 null이다 — 화면이 '이름 없음'으로 대신한다", async () => {
    const { prisma } = createHarness({
      ...withEmails(),
      users: [{ id: "u1", email: null, name: null }],
      members: [{ projectId: "p1", userId: "u1", role: "OWNER" }],
    });
    expect((await loadMembers(prisma, "p1"))[0]?.emailLabel).toBeNull();
  });

  it("대기 초대도 같다 — 여기가 더 민감하다(아직 멤버가 아닌 외부인의 주소다)", async () => {
    const now = new Date("2026-09-09T00:00:00Z");
    const { prisma } = createHarness({
      ...seed(),
      invitations: [
        { id: "i1", projectId: "p1", email: "qa-invite-1@example.com", role: "EDITOR", tokenHash: "h1", expiresAt: new Date("2026-09-10T00:00:00Z"), acceptedAt: null, invitedBy: "u1" },
        { id: "i2", projectId: "p1", email: "qa-signed-out@example.com", role: "EDITOR", tokenHash: "h2", expiresAt: new Date("2026-09-10T00:00:00Z"), acceptedAt: null, invitedBy: "u1" },
      ],
    });
    const rows = await loadPendingInvitations(prisma, "p1", now);
    for (const row of rows) expect(row).not.toHaveProperty("email");
    // 둘 다 `q***@example.com`이 되면 [Revoke]가 엉뚱한 링크를 무효화한다 (malmoi#18)
    expect(new Set(rows.map((r) => r.emailLabel)).size).toBe(2);
  });
});
