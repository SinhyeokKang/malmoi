import { describe, expect, it, vi } from "vitest";

// `lib/keys/query.ts`가 `server-only`를 문다 — vitest에서 그 패키지는 `react-server` 조건 밖이라
// 던진다. 다른 Action 테스트들과 같은 관용구다.
vi.mock("server-only", () => ({}));

import { loadMembers, loadPendingInvitations } from "@/lib/auth/query";
import { countUnpublished, loadMemberships, loadProjectList } from "@/lib/keys/query";
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
    /**
     * ⚠️ **`archivedAt: null`이 여기 있어야 한다.** 8-3 전까지 하네스의 `project` 투영이 그 필드를
     * 아예 안 내서 `undefined`가 왔고, 이 단언이 그 **누락을 정답으로 고정**하고 있었다 — 셸은
     * `archivedAt !== null`로 보관을 판정하므로 `undefined`면 **전부 보관됨**이 된다(실제 Prisma가
     * `null`을 내서 프로덕션만 무사했다). 가짜가 실제보다 좁으면 이런 식으로 조용하다.
     */
    expect(await loadMemberships(prisma, "u1")).toEqual([
      {
        slug: "acme",
        name: "Acme",
        role: "OWNER",
        installationId: "1",
        surfaces: [{ archivedAt: null, lastCommitSha: "a".repeat(40) }],
        archivedAt: null,
      },
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

  /**
   * ⚠️ **행 하나가 못 읽히는 것은 목록 전체의 실패가 아니다** (credential-storage 리뷰). 전환 중에는
   * **부분 변환 상태가 정상**이고(backfill이 행 단위 CAS다), 키를 회전하고 옛 키를 지우면 옛 세대의
   * 행이 그대로 남는다. `decodeUser`가 던지는 것을 그대로 올리면 멤버 아홉이 멀쩡한데 화면이 통째로
   * 500이 된다.
   *
   * ⚠️ **`null`(이메일 없음)로 접지 않는다** — POSTMORTEM 2026-09-03의 "실패한 조회를 '없음'으로
   * 읽어 경고가 존재하지 않는 것과 구별되지 않았다"가 정확히 이 부류다. 못 읽은 행은 **자기 문구**를 든다.
   */
  it("복호화되지 않는 멤버 한 행이 나머지를 죽이지 않는다", async () => {
    const db = createHarness({
      ...withEmails(),
      users: [
        { id: "u1", email: "alice@acme.com", name: "A" },
        // 옛 키로 봉인된 행 — 지금 keyring에 그 kid가 없다.
        { id: "u2", email: "andrew@acme.com", name: "Andrew", unreadable: true },
      ],
    });
    const rows = await loadMembers(db.prisma, "p1");
    expect(rows.map((r) => r.emailLabel)).toEqual(["a***@acme.com", "Unavailable"]);
    // 못 읽은 행은 이름도 못 읽는다 — 옛 값을 그럴듯하게 보여주지 않는다.
    expect(rows[1]?.name).toBeNull();
    for (const row of rows) expect(row).not.toHaveProperty("email");
  });

  it("복호화되지 않는 초대 한 행이 나머지를 죽이지 않고 맨 뒤로 간다", async () => {
    const pending = {
      projectId: "p1", role: "EDITOR" as const, expiresAt: new Date("2026-09-20T00:00:00Z"),
      acceptedAt: null, invitedBy: "u1",
    };
    const db = createHarness({
      ...withEmails(),
      invitations: [
        { ...pending, id: "i-lost", email: "aaa@acme.com", tokenHash: "h-lost", unreadable: true },
        { ...pending, id: "i-ok", email: "zoe@acme.com", tokenHash: "h-ok" },
      ],
    });
    const rows = await loadPendingInvitations(db.prisma, "p1", NOW);
    // 못 읽은 행이 알파벳순으로는 앞인데 **맨 뒤로** 간다 — 손상 하나가 나머지 순서를 흔들지 않는다.
    expect(rows.map((r) => r.emailLabel)).toEqual(["z***@acme.com", "Unavailable"]);
  });

  it("⚠️ **키가 통째로 없으면 던진다** — 그것은 행의 손상이 아니라 장애다", async () => {
    const db = createHarness(withEmails());
    vi.stubEnv("PII_ENCRYPTION_KEYS", "");
    await expect(loadMembers(db.prisma, "p1")).rejects.toThrow();
    vi.unstubAllEnvs();
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

/**
 * 목록 화면 전용 조회 (8-3). **셸의 `loadMemberships`와 나뉘어 있는 것이 요지다** — 그쪽은 매 페이지가
 * 부르므로 목록 하나를 위한 집계를 얹지 않는다 (PRODUCT §7.7 결정 5와 같은 축).
 */
describe("loadProjectList", () => {
  it("내 멤버십만 낸다 — 남의 프로젝트가 섞이지 않는다", async () => {
    const h = createHarness(seed());
    const { rows } = await loadProjectList(h.prisma, "u1");
    expect(rows.map((r) => r.slug)).toEqual(["acme"]);
  });

  it("멤버 수를 센다 — 시드의 숫자가 아니라 실제 행이다", async () => {
    const base = seed();
    const h = createHarness({ ...base, members: [...(base.members ?? []), { projectId: "p1", userId: "u2", role: "EDITOR" }] });
    const { rows } = await loadProjectList(h.prisma, "u1");
    expect(rows[0]?.memberCount).toBe(2);
  });

  /**
   * **집계가 행까지 닿는다** (projects-list §3). 조회가 배선됐다는 것과 그 값이 행에 실린다는 것은
   * 다른 사실이고, 후자가 빠지면 화면이 조용히 0을 그린다 — 이 리포가 반복해 밟은 부류다.
   */
  it("Meter와 사건과 Summary를 함께 낸다", async () => {
    const base = seed();
    const h = createHarness({
      ...base,
      // p1에 키를 하나 더 둔다 — 셀이 칸을 다 채우면 "미번역"이라는 축 자체가 안 보인다.
      keys: [...(base.keys ?? []), { id: "k3", projectId: "p1", key: "b", sourceText: "B", description: null, sortIndex: 1, orphaned: false }],
      translations: [
        { keyId: "k1", localeCode: "en", value: "Hello", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-01T00:00:00Z") },
        { keyId: "k1", localeCode: "ko", value: "안녕", description: null, placeholders: null, needsReview: true, updatedBy: "u1", updatedAt: new Date("2026-09-02T00:00:00Z") },
      ],
    });

    const { rows, summary } = await loadProjectList(h.prisma, "u1");

    // p1은 키 2 × 로케일 2 = 4칸이고 값이 있는 것은 둘 — 남는 미번역이 둘이다.
    // ⚠️ p2는 남의 멤버십이라 어느 값에도 안 들어간다.
    expect(summary).toMatchObject({ toTranslate: 2, toReview: 1, toSend: 1 });
    // ⚠️ 사건은 **행에 펼쳐져 있다** — 판정 셋이 그 모양을 그대로 받는다.
    expect(rows[0]).toMatchObject({ review: 1, unsent: 1, openPr: null, repoAheadFiles: 0, importing: false });
    // base가 먼저다 — 폭이 좁아지면 앞에서부터 남으므로 "하나면 base"가 공짜로 성립한다.
    expect(rows[0]?.meters.map((m) => m.code)).toEqual(["en", "ko"]);
    expect(rows[0]?.meters[0]).toMatchObject({ code: "en", total: 2, done: 1, review: 0, percent: 50 });
    // 두 구간은 겹치지 않고 라벨은 그 합이다 — 검토 대기도 값이 들어 있는 칸이다 (캔버스 `1c`).
    expect(rows[0]?.meters[1]).toMatchObject({ code: "ko", total: 2, done: 0, review: 1, percent: 50 });
  });

  /**
   * **원격 신호가 행까지 닿는다** (projects-list §3.4). 주입한 로더가 받는 입력도 함께 본다 —
   * 보관 여부와 저장 로케일이 빠지면 그쪽 판정이 통째로 어긋난다.
   */
  it("원격 신호를 행에 붙이고, 조회 입력에 보관과 저장 로케일을 싣는다", async () => {
    const h = createHarness(seed());
    const loadRemote = vi.fn(async (targets: readonly { projectId: string }[]) =>
      new Map(targets.map((t) => [t.projectId, { openPr: { number: 7, url: "https://github.com/o/r/pull/7" }, repoAheadFiles: 3 }])),
    );

    const { rows } = await loadProjectList(h.prisma, "u1", { loadRemote });

    expect(rows[0]).toMatchObject({ openPr: { number: 7 }, repoAheadFiles: 3 });
    expect(loadRemote).toHaveBeenCalledWith([
      expect.objectContaining({ archived: false, surfaces: [expect.objectContaining({ storedLocales: expect.arrayContaining(["en", "ko"]) })] }),
    ]);
  });

  /** ⚠️ **내부 id를 화면에 흘리지 않는다** — 화면이 아는 식별자는 slug 하나다. */
  it("행에 `Project.id`가 없다", async () => {
    const h = createHarness(seed());
    const { rows } = await loadProjectList(h.prisma, "u1");
    expect(rows[0]).not.toHaveProperty("id");
  });

  it("리포와 보관 시각을 함께 낸다 — 행 메타와 필터의 재료다", async () => {
    const h = createHarness(seed());
    const { rows } = await loadProjectList(h.prisma, "u1");
    expect(rows[0]?.repoOwner).toBe("o");
    expect(rows[0]?.repoName).toBe("r");
    expect(rows[0]?.archivedAt).toBeNull();
  });

  /**
   * ⚠️ **셸이 이 집계를 물지 않는다.** 두 로더가 같은 테이블을 읽는 것이 중복처럼 보이지만,
   * 합치는 순간 `(edit)` 아래 **모든** 페이지가 `_count` 서브쿼리를 돈다.
   */
  it("`loadMemberships`는 목록 전용 필드를 내지 않는다", async () => {
    const h = createHarness(seed());
    const [row] = await loadMemberships(h.prisma, "u1");
    expect(row).not.toHaveProperty("memberCount");
    expect(row).not.toHaveProperty("repoOwner");
  });
});
