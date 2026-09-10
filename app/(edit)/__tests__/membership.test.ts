import { encodeInvitationEmail } from "@/lib/credentials/records";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashInviteToken } from "@/lib/auth/invitation";

import { createHarness, sessionFor } from "./harness";

/**
 * 초대와 멤버 변경 (SAAS.md §5.6).
 *
 * ⚠️ **초대 수락은 `requireProjectAccess`를 지나지 않는다** — 수락 전엔 멤버가 아니기 때문이다.
 * 그래서 그 Action은 spec 완료 조건 6의 **명시된 예외**이고, 대신 **토큰이 인가를 대신한다**:
 * 해시로 행을 찾고, 단일 사용이고, provider가 검증한 이메일과 대조한다.
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
}));

// `projects/actions.ts`가 `requireUser`(=`lib/auth/session.ts`)를 물면서 `server-only`가 딸려 온다 —
// vitest는 `react-server` 조건 밖이라 그 패키지가 던진다 (`lib/__tests__/db.test.ts`와 같은 스텁).
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createInvitation, changeMember, revokeInvitation } = await import("../projects/actions");
const { acceptInvitation } = await import("../../invite/actions");

const LATER = new Date("2126-01-01T00:00:00Z");
const EARLIER = new Date("2020-01-01T00:00:00Z");

function seeded() {
  return createHarness({
    projects: [
      { id: "pA", slug: "alpha" },
      { id: "pB", slug: "beta" },
    ],
    members: [
      { projectId: "pA", userId: "u-owner", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
      { projectId: "pA", userId: "u-editor", role: "EDITOR", createdAt: new Date("2026-02-01T00:00:00Z") },
      { projectId: "pB", userId: "u-other", role: "OWNER" },
    ],
    users: [
      { id: "u-owner", email: "owner@a.com" },
      { id: "u-editor", email: "editor@a.com" },
      { id: "u-other", email: "other@b.com" },
      { id: "u-guest", email: "guest@a.com" },
    ],
  });
}

let db: ReturnType<typeof seeded>;

beforeEach(() => {
  db = seeded();
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-owner");
});

describe("createInvitation — 누가 부를 수 있나", () => {
  it("비로그인은 거부된다", async () => {
    hoisted.session = null;
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("멤버가 아니면 not-found다", async () => {
    hoisted.session = sessionFor("u-other");
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("EDITOR는 forbidden이다 — 멤버 관리는 OWNER만이다 (SAAS §3)", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("OWNER는 초대를 만든다", async () => {
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(result).toMatchObject({ ok: true });
    expect(db.invitations).toHaveLength(1);
  });
});

describe("createInvitation — 토큰은 해시만 남는다", () => {
  it("원문이 응답에 한 번 실리고 DB에는 해시만 있다", async () => {
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    if (!result.ok) throw new Error("초대가 만들어져야 한다");

    const row = db.invitations[0];
    expect(row).toBeDefined();
    expect(row?.tokenHash).toBe(hashInviteToken(result.token));
    // 원문이 어느 컬럼에도 남지 않는다.
    expect(JSON.stringify(row)).not.toContain(result.token);
  });

  it("두 번 만들면 토큰이 다르다 — 예측 가능한 값이 아니다", async () => {
    const a = await createInvitation({ slug: "alpha", email: "one@a.com", role: "EDITOR" });
    const b = await createInvitation({ slug: "alpha", email: "two@a.com", role: "EDITOR" });
    if (!a.ok || !b.ok) throw new Error("둘 다 만들어져야 한다");
    expect(a.token).not.toBe(b.token);
  });

  it("이메일을 정규화해 저장한다 — 수락 시 대조가 대소문자로 갈리지 않게", async () => {
    await createInvitation({ slug: "alpha", email: " New@A.com ", role: "EDITOR" });
    expect(db.invitations[0]?.email).toBe("new@a.com");
  });

  it("초대는 인가된 projectId에 붙는다", async () => {
    await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(db.invitations[0]).toMatchObject({ projectId: "pA", invitedBy: "u-owner" });
  });
});

describe("createInvitation — 이미 있는 관계", () => {
  it("이미 멤버인 이메일은 거부한다", async () => {
    const result = await createInvitation({ slug: "alpha", email: "editor@a.com", role: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "already-member" });
    expect(db.invitations).toHaveLength(0);
  });

  it("자기 자신을 초대할 수 없다", async () => {
    const result = await createInvitation({ slug: "alpha", email: "owner@a.com", role: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "already-member" });
  });

  it("만료된 초대를 다시 보내면 **토큰이 회전한다** — unique가 아니라 index인 이유다", async () => {
    db.invitations.push({
      id: "inv-old", projectId: "pA", email: "new@a.com", role: "EDITOR",
      tokenHash: "old-hash", expiresAt: EARLIER, acceptedAt: null, invitedBy: "u-owner",
    });

    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(result).toMatchObject({ ok: true });
    // 새 행이 생기고 옛 행은 더 이상 수락되지 않아야 한다.
    expect(db.invitations).toHaveLength(2);
    expect(db.spies.updateManyInvitations).toHaveBeenCalled();
  });
});

/**
 * **동시 발급이 유효 토큰을 둘 남긴다** (Codex 감사 2026-09-06 #4). 회전(`updateMany` 만료)과 `create`가
 * 잠금 없이 갈라져 있어 두 OWNER가 같은 이메일을 동시에 초대하면 각자 회전을 끝내고 각자 만든다 — 링크 둘이
 * 살아 있고 role이 다르면 둘 다 유효하다. `changeMember`와 같은 형태로 `Project` 행을 잠근 트랜잭션에 넣는다.
 * 메모리 DB는 잠금을 못 흉내내므로 **잠금이 회전보다 먼저인 것**과 **create가 실패하면 회전이 되돌아가는 것**을 본다.
 */
describe("createInvitation — 회전과 생성이 한 트랜잭션이다", () => {
  it("프로젝트 행을 잠근 뒤 회전한다", async () => {
    await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    const sql = db.spies.executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join("?")).join("\n");
    expect(sql).toMatch(/"Project"[\s\S]*FOR UPDATE/);
    expect(db.spies.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.spies.updateManyInvitations.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("생성이 실패하면 옛 초대의 만료가 되돌아간다 — 회전만 남으면 유효 링크가 0개가 된다", async () => {
    db.invitations.push({
      id: "inv-old", projectId: "pA", email: "new@a.com", role: "EDITOR",
      tokenHash: "old-hash", expiresAt: LATER, acceptedAt: null, invitedBy: "u-owner",
    });
    db.spies.createInvitationRow.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });
    await expect(createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" })).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(db.invitations).toHaveLength(1);
    expect(db.invitations[0]?.expiresAt).toEqual(LATER);
  });
});

describe("acceptInvitation — 토큰이 인가를 대신한다", () => {
  function invite(over: Partial<{ email: string; expiresAt: Date; acceptedAt: Date | null }> = {}) {
    db.invitations.push({
      id: "inv-1", projectId: "pA", email: "guest@a.com", role: "EDITOR",
      tokenHash: hashInviteToken("tok"), expiresAt: LATER, acceptedAt: null,
      invitedBy: "u-owner", ...over,
    });
  }

  beforeEach(() => {
    hoisted.session = sessionFor("u-guest");
  });

  it("비로그인은 거부된다 — 링크만으로는 들어올 수 없다", async () => {
    hoisted.session = null;
    invite();
    expect(await acceptInvitation({ token: "tok" })).toEqual({ ok: false, error: "unauthorized" });
  });

  it("검증된 이메일이 맞으면 멤버가 된다", async () => {
    invite();
    const result = await acceptInvitation({ token: "tok" });
    expect(result).toEqual({ ok: true, slug: "alpha" });
    expect(db.members).toEqual(expect.arrayContaining([expect.objectContaining({ projectId: "pA", userId: "u-guest", role: "EDITOR" })]));
  });

  it("없는 토큰은 not-found다", async () => {
    expect(await acceptInvitation({ token: "nope" })).toEqual({ ok: false, error: "not-found" });
  });

  it("만료된 토큰은 expired다 — not-found와 구별된다", async () => {
    invite({ expiresAt: EARLIER });
    expect(await acceptInvitation({ token: "tok" })).toEqual({ ok: false, error: "expired" });
  });

  it("다른 이메일 계정으로는 수락되지 않는다", async () => {
    hoisted.session = sessionFor("u-other"); // other@b.com
    invite();
    expect(await acceptInvitation({ token: "tok" })).toEqual({ ok: false, error: "email-mismatch" });
    expect(db.members.some((m) => m.userId === "u-other" && m.projectId === "pA")).toBe(false);
  });

  it("재사용은 already-accepted다 — 두 번째가 조용히 성공하지 않는다", async () => {
    invite();
    expect(await acceptInvitation({ token: "tok" })).toMatchObject({ ok: true });
    expect(await acceptInvitation({ token: "tok" })).toEqual({ ok: false, error: "already-accepted" });
    expect(db.members.filter((m) => m.userId === "u-guest")).toHaveLength(1);
  });

  it("**단일 사용을 조건부 갱신으로 강제한다** — 메모리 DB는 경합을 못 보므로 인자를 고정한다", () => {
    // 두 요청이 동시에 들어와도 `acceptedAt: null` 조건이 한쪽만 통과시킨다. count를 읽지 않고
    // 그냥 update하면 둘 다 성공해 멤버십이 두 번 생긴다 (ARCHITECTURE §5.5.6의 인자 캡처 선례).
    invite();
    return acceptInvitation({ token: "tok" }).then(() => {
      const calls = db.spies.updateManyInvitations.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((c) => c[0]?.where?.acceptedAt === null)).toBe(true);
    });
  });

  /**
   * **소비 조건에 만료가 있어야 한다** (Codex 감사 2026-09-06 #3). 사전 판정은 `expiresAt`을 보지만 실제
   * `updateMany`가 `{ id, acceptedAt: null }`만 보면, 판정을 지난 뒤 OWNER가 재초대로 옛 행을 만료시켜도
   * 진행 중인 요청이 옛 행을 소비해 **옛 role**로 멤버가 된다.
   */
  it("판정 뒤 만료된(회전된) 초대는 소비되지 않는다 — expired", async () => {
    invite({ expiresAt: EARLIER });
    // 판정 시점엔 살아 있었다 — 그 직후 다른 요청이 회전시켰다.
    db.spies.findInvitation.mockImplementationOnce(async () => ({
      id: "inv-1", projectId: "pA", ...encodeInvitationEmail("inv-1", "pA", "guest@a.com"), role: "EDITOR",
      tokenHash: hashInviteToken("tok"), expiresAt: LATER, acceptedAt: null, invitedBy: "u-owner",
    }));

    expect(await acceptInvitation({ token: "tok" })).toEqual({ ok: false, error: "expired" });
    expect(db.members.some((m) => m.userId === "u-guest")).toBe(false);
    expect(db.invitations[0]?.acceptedAt).toBeNull();
  });

  it("수락 조회 뒤 미래 시각으로 취소돼도 옛 초대는 소비하지 않는다", async () => {
    invite({ expiresAt: new Date(Date.now() + 1000) });
    db.spies.findInvitation.mockImplementationOnce(async () => ({
      id: "inv-1", projectId: "pA", ...encodeInvitationEmail("inv-1", "pA", "guest@a.com"), role: "OWNER",
      tokenHash: hashInviteToken("tok"), expiresAt: LATER, acceptedAt: null, invitedBy: "u-owner",
    }));
    expect(await acceptInvitation({ token: "tok" })).toEqual({ ok: false, error: "expired" });
    expect(db.members.some((m) => m.userId === "u-guest")).toBe(false);
  });

  it("소비 조건에 만료 시각이 들어간다", async () => {
    invite();
    await acceptInvitation({ token: "tok" });
    const claim = db.spies.updateManyInvitations.mock.calls.find((c) => c[0]?.where?.acceptedAt === null);
    expect(claim?.[0]?.where?.expiresAt?.gt).toBeInstanceOf(Date);
  });

  it("토큰 원문이 아니라 해시로 조회한다", async () => {
    invite();
    await acceptInvitation({ token: "tok" });
    expect(db.spies.findInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashInviteToken("tok") } }),
    );
  });
});

/**
 * **Server Action 입력을 타입만 믿지 않는다.** `saveTranslation`만 zod를 지나고 나머지는 `role: Role`을 그대로
 * DB에 넣었다 — 조작된 `"ADMIN"`은 Prisma enum 검증에서 던져 digest 오류가 된다 (code-review 2026-09-06 🟡13).
 * 인가는 그 앞에서 끝나므로 권한 구멍은 아니지만, 거부가 예외로 죽지 않는다는 규칙(ARCHITECTURE §6.3)이 깨진다.
 */
describe("입력 검증 — 거부가 예외로 죽지 않는다", () => {
  it("createInvitation: 모르는 role은 invalid input", async () => {
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "ADMIN" as never });
    expect(result).toEqual({ ok: false, error: "invalid input" });
    expect(db.invitations).toHaveLength(0);
  });

  it("changeMember: 모르는 role·비문자열 대상은 invalid input", async () => {
    expect(await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: "ADMIN" as never }))
      .toEqual({ ok: false, error: "invalid input" });
    expect(await changeMember({ slug: "alpha", targetUserId: 42 as never, nextRole: null }))
      .toEqual({ ok: false, error: "invalid input" });
    expect(db.members.find((m) => m.userId === "u-editor")?.role).toBe("EDITOR");
  });

  it("acceptInvitation: 토큰이 문자열이 아니면 not-found — 해시 함수에 닿기 전에 거른다", async () => {
    hoisted.session = sessionFor("u-guest");
    expect(await acceptInvitation({ token: 123 as never })).toEqual({ ok: false, error: "not-found" });
  });

  it("검증이 인가보다 앞이다 — slug가 없으면 무엇을 인가할지 정할 수 없다", async () => {
    const result = await createInvitation({ slug: "", email: "new@a.com", role: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "invalid input" });
  });
});

describe("changeMember — 마지막 OWNER 보호", () => {
  it("EDITOR는 부를 수 없다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: null });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("OWNER가 EDITOR를 제거한다", async () => {
    const result = await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: null });
    expect(result).toEqual({ ok: true });
    expect(db.members.some((m) => m.userId === "u-editor" && m.projectId === "pA")).toBe(false);
  });

  it("마지막 OWNER는 제거되지 않는다", async () => {
    const result = await changeMember({ slug: "alpha", targetUserId: "u-owner", nextRole: null });
    expect(result).toEqual({ ok: false, error: "last-owner" });
    expect(db.members.some((m) => m.userId === "u-owner")).toBe(true);
  });

  it("마지막 OWNER는 강등되지도 않는다 — 제거와 같은 판정을 지난다", async () => {
    const result = await changeMember({ slug: "alpha", targetUserId: "u-owner", nextRole: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "last-owner" });
    expect(db.members.find((m) => m.userId === "u-owner")?.role).toBe("OWNER");
  });

  it("OWNER가 둘이면 하나를 강등할 수 있다", async () => {
    db.members.push({ projectId: "pA", userId: "u-second", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") });
    const result = await changeMember({ slug: "alpha", targetUserId: "u-owner", nextRole: "EDITOR" });
    expect(result).toEqual({ ok: true });
    expect(db.members.find((m) => m.userId === "u-owner")?.role).toBe("EDITOR");
  });

  it("멤버가 아닌 대상은 not-member다 — '성공'으로 접지 않는다", async () => {
    const result = await changeMember({ slug: "alpha", targetUserId: "u-stranger", nextRole: null });
    expect(result).toEqual({ ok: false, error: "not-member" });
  });

  it("다른 프로젝트의 멤버를 건드릴 수 없다", async () => {
    const result = await changeMember({ slug: "alpha", targetUserId: "u-other", nextRole: null });
    expect(result).toEqual({ ok: false, error: "not-member" });
    expect(db.members.some((m) => m.userId === "u-other")).toBe(true);
  });

  it("멤버 목록을 인가된 projectId로 좁혀 읽는다", async () => {
    await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: null });
    expect(db.spies.findManyMembers).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "pA" }) }),
    );
  });
});

/**
 * **거부는 응답으로 흘러야 한다 — 예외로 죽으면 안 된다.**
 *
 * Server Action에서 처리되지 않은 throw는 사용자에게 digest만 있는 일반 오류가 되고, 판정 함수가
 * 만들어 둔 사유(`not-member`·`already-member`)가 무시된다. `saveTranslation`·`triggerPullAction`이
 * 구조화된 거부를 내는데 이쪽만 다르면 화면이 두 계약을 상대하게 된다.
 */
describe("경합에서도 거부가 응답으로 온다", () => {
  it("판정 뒤 행이 사라져도 not-member다 — OWNER 둘이 같은 멤버를 동시에 제거하는 경우", async () => {
    // 목록에는 있지만 실제 행은 없다 = 다른 요청이 먼저 지운 뒤다.
    db.spies.findManyMembers.mockImplementationOnce(async () => [
      { projectId: "pA", userId: "u-owner", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
      { projectId: "pA", userId: "u-ghost", role: "EDITOR", createdAt: new Date("2026-02-01T00:00:00Z") },
    ]);
    const result = await changeMember({ slug: "alpha", targetUserId: "u-ghost", nextRole: null });
    expect(result).toEqual({ ok: false, error: "not-member" });
  });

  it("역할 변경도 같다", async () => {
    db.spies.findManyMembers.mockImplementationOnce(async () => [
      { projectId: "pA", userId: "u-owner", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
      { projectId: "pA", userId: "u-ghost", role: "EDITOR", createdAt: new Date("2026-02-01T00:00:00Z") },
    ]);
    const result = await changeMember({ slug: "alpha", targetUserId: "u-ghost", nextRole: "OWNER" });
    expect(result).toEqual({ ok: false, error: "not-member" });
  });

  /**
   * **OWNER 둘이 동시에 각자를 줄이면 OWNER 0명이 된다** (Codex 감사 2026-09-06 #2). 둘 다 OWNER 2명인
   * 목록을 읽어 판정을 통과하고 **서로 다른 행**을 쓰므로 `count`도 각각 1이다 — 같은 대상의 경합만 막는
   * count 검사로는 못 본다. FK Restrict는 멤버 행 변경을 막지 않는다(스키마 주석이 그렇게 주장했었다).
   *
   * 메모리 DB는 잠금을 흉내낼 수 없으므로 **잠금이 없었을 때 일어날 상태**를 주입한다: 판정에 쓴 목록은
   * OWNER 둘인데 실제 행은 하나만 OWNER다(다른 요청이 먼저 강등했다). 쓰기 뒤 재집계가 0을 보고 되돌려야 한다.
   */
  it("판정 뒤 다른 OWNER가 이미 줄었으면 last-owner로 되돌린다 — 쓰기 뒤 OWNER를 다시 센다", async () => {
    db.members.push({ projectId: "pA", userId: "u-second", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") });
    // 판정은 둘 다 OWNER로 본다.
    db.spies.findManyMembers.mockImplementationOnce(async () => [
      { projectId: "pA", userId: "u-owner", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
      { projectId: "pA", userId: "u-second", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
      { projectId: "pA", userId: "u-editor", role: "EDITOR", createdAt: new Date("2026-02-01T00:00:00Z") },
    ]);
    // 실제로는 다른 요청이 u-second를 이미 강등했다.
    const second = db.members.find((m) => m.userId === "u-second");
    if (second) second.role = "EDITOR";

    const result = await changeMember({ slug: "alpha", targetUserId: "u-owner", nextRole: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "last-owner" });
    // 되돌려졌다 — u-owner는 그대로 OWNER다.
    expect(db.members.find((m) => m.userId === "u-owner")?.role).toBe("OWNER");
  });

  it("자기 제거도 같은 재집계를 지난다", async () => {
    db.members.push({ projectId: "pA", userId: "u-second", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") });
    db.spies.findManyMembers.mockImplementationOnce(async () => [
      { projectId: "pA", userId: "u-owner", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
      { projectId: "pA", userId: "u-second", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
    ]);
    db.members.splice(db.members.findIndex((m) => m.userId === "u-second"), 1);

    const result = await changeMember({ slug: "alpha", targetUserId: "u-owner", nextRole: null });
    expect(result).toEqual({ ok: false, error: "last-owner" });
    expect(db.members.some((m) => m.userId === "u-owner" && m.role === "OWNER")).toBe(true);
  });

  it("프로젝트 행을 잠근 뒤 목록을 읽는다 — 재집계는 잠금이 새는 경우의 그물이다", async () => {
    await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: null });
    const sql = db.spies.executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join("?")).join("\n");
    expect(sql).toMatch(/"Project"[\s\S]*FOR UPDATE/);
    // 잠금이 목록 조회보다 먼저다.
    expect(db.spies.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.spies.findManyMembers.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("이미 멤버인 사람이 옛 초대를 수락하면 already-member다 — unique 위반으로 죽지 않는다", async () => {
    // 초대가 만들어진 뒤 다른 경로로 멤버가 된 상태. `createInvitation`이 그 조합을 막지만
    // **막혀 있다는 것이 코드가 아니라 추론에 있으면** 다음 변경에서 열린다.
    db.invitations.push({
      id: "inv-1", projectId: "pA", email: "editor@a.com", role: "EDITOR",
      tokenHash: hashInviteToken("tok"), expiresAt: LATER, acceptedAt: null,
      invitedBy: "u-owner",
    });
    hoisted.session = sessionFor("u-editor"); // 이미 pA의 EDITOR다

    const result = await acceptInvitation({ token: "tok" });
    expect(result).toEqual({ ok: false, error: "already-member" });
    expect(db.members.filter((m) => m.userId === "u-editor" && m.projectId === "pA")).toHaveLength(1);
  });
});

/**
 * `revokeInvitation` (6b-2, design §3.9).
 *
 * ⚠️ **행을 지우지 않는다.** `prisma/schema.prisma`의 `acceptedAt` 주석이 그것을 금지한다 — 지우면
 * 재사용 시도가 `already-accepted`가 아니라 `not-found`가 되어 만료·오배송과 뭉개진다. 무효화의
 * 기존 관용구는 `expiresAt = now`이고(`createInvitation`의 회전) `loadPendingInvitations`의
 * `expiresAt > now()` 술어가 그대로 맞는다.
 */
describe("revokeInvitation — 무효화는 삭제가 아니다", () => {
  function withInvites() {
    const db = createHarness({
      projects: [
        { id: "pA", slug: "alpha" },
        { id: "pB", slug: "beta" },
      ],
      members: [
        { projectId: "pA", userId: "u-owner", role: "OWNER", createdAt: new Date("2026-02-01T00:00:00Z") },
        { projectId: "pA", userId: "u-editor", role: "EDITOR", createdAt: new Date("2026-02-01T00:00:00Z") },
        { projectId: "pB", userId: "u-other", role: "OWNER" },
      ],
      users: [{ id: "u-owner", email: "owner@a.com" }],
      invitations: [
        { id: "i-a", projectId: "pA", email: "x@a.com", role: "EDITOR", tokenHash: "hA", expiresAt: LATER, acceptedAt: null, invitedBy: "u-owner" },
        { id: "i-done", projectId: "pA", email: "y@a.com", role: "EDITOR", tokenHash: "hD", expiresAt: LATER, acceptedAt: new Date("2026-09-05T00:00:00Z"), invitedBy: "u-owner" },
        { id: "i-b", projectId: "pB", email: "z@b.com", role: "EDITOR", tokenHash: "hB", expiresAt: LATER, acceptedAt: null, invitedBy: "u-other" },
      ],
    });
    hoisted.prisma = db.prisma;
    return db;
  }

  it("OWNER는 대기 초대를 무효화한다 — 만료 시각을 당기는 것이다", async () => {
    const db = withInvites();
    hoisted.session = sessionFor("u-owner");
    const result = await revokeInvitation({ slug: "alpha", invitationId: "i-a" });
    expect(result).toEqual({ ok: true });

    const [args] = db.spies.updateManyInvitations.mock.calls.at(-1) ?? [];
    expect(args?.where).toMatchObject({ id: "i-a", projectId: "pA", acceptedAt: null });
    expect(args?.data.expiresAt).toBeInstanceOf(Date);
    // 삭제 경로를 쓰지 않는다 — 하네스에 그 메서드가 없어 부르면 던진다는 것과 별개로 계약을 고정한다.
    expect(db.spies.updateManyInvitations).toHaveBeenCalled();
  });

  it("다른 프로젝트의 초대 id는 0행이다 — id를 알아도 남의 테넌트를 못 건드린다", async () => {
    const db = withInvites();
    hoisted.session = sessionFor("u-owner");
    const result = await revokeInvitation({ slug: "alpha", invitationId: "i-b" });
    expect(result).toEqual({ ok: false, error: "not-found" });

    const untouched = db.invitations.find((i) => i.id === "i-b");
    expect(untouched?.expiresAt).toEqual(LATER);
  });

  it("이미 수락된 초대는 건드리지 않는다 — 그 사람은 이미 멤버다", async () => {
    const db = withInvites();
    hoisted.session = sessionFor("u-owner");
    const result = await revokeInvitation({ slug: "alpha", invitationId: "i-done" });
    expect(result).toEqual({ ok: false, error: "not-found" });

    const row = db.invitations.find((i) => i.id === "i-done");
    expect(row?.expiresAt).toEqual(LATER);
  });

  it("EDITOR는 forbidden이다 — 멤버 관리는 OWNER만이다 (SAAS §3)", async () => {
    withInvites();
    hoisted.session = sessionFor("u-editor");
    const result = await revokeInvitation({ slug: "alpha", invitationId: "i-a" });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("멤버가 아니면 not-found다 — 프로젝트의 존재를 노출하지 않는다", async () => {
    withInvites();
    hoisted.session = sessionFor("u-other");
    const result = await revokeInvitation({ slug: "alpha", invitationId: "i-a" });
    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("비로그인은 거부된다", async () => {
    withInvites();
    hoisted.session = null;
    const result = await revokeInvitation({ slug: "alpha", invitationId: "i-a" });
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("입력이 비면 invalid input이다 — 예외로 죽지 않는다", async () => {
    withInvites();
    hoisted.session = sessionFor("u-owner");
    expect(await revokeInvitation({ slug: "", invitationId: "i-a" })).toEqual({ ok: false, error: "invalid input" });
    expect(await revokeInvitation({ slug: "alpha", invitationId: "" })).toEqual({ ok: false, error: "invalid input" });
  });
});

/**
 * **멤버 10명 제한** (7단계 — sync-runs spec 완료 조건 8, design §1.5·결정 3).
 *
 * ⚠️ **집계가 잠금 안이다.** 밖에서 세면 두 OWNER가 동시에 초대할 때 각자 "자리 있음"을 보고
 * 각자 만든다 — `createProject`의 재집계와 같은 형이고, 여기는 잠글 `Project` 행이 **이미 있다**.
 */
describe("createInvitation — 멤버 제한", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      projectId: "pA",
      userId: `u-${i}`,
      role: "EDITOR" as const,
    }));

  function withMembers(count: number) {
    return createHarness({
      projects: [{ id: "pA", slug: "alpha" }],
      members: [{ projectId: "pA", userId: "u-owner", role: "OWNER" as const }, ...many(count - 1)],
      users: [{ id: "u-owner", email: "owner@a.com" }],
    });
  }

  it("9명이면 통과한다 — 열째 자리가 남아 있다", async () => {
    const db = withMembers(9);
    hoisted.prisma = db.prisma;
    hoisted.session = sessionFor("u-owner");
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(result).toMatchObject({ ok: true });
  });

  it("10명이면 member-limit으로 거부하고 행을 만들지 않는다", async () => {
    const db = withMembers(10);
    hoisted.prisma = db.prisma;
    hoisted.session = sessionFor("u-owner");
    const before = db.invitations.length;
    const result = await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });
    expect(result).toEqual({ ok: false, error: "member-limit" });
    expect(db.invitations).toHaveLength(before);
  });

  it("⚠️ 집계가 잠금 뒤다 — 밖에서 세면 동시 초대가 자리를 하나 더 만든다", async () => {
    const db = withMembers(10);
    hoisted.prisma = db.prisma;
    hoisted.session = sessionFor("u-owner");
    await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" });

    const lockOrder = db.spies.executeRaw.mock.invocationCallOrder[0] ?? Infinity;
    const countOrder = db.spies.countMembers.mock.invocationCallOrder.at(-1) ?? -Infinity;
    expect(lockOrder).toBeLessThan(countOrder);
  });

  it("다른 프로젝트의 멤버는 안 센다", async () => {
    const db = createHarness({
      projects: [{ id: "pA", slug: "alpha" }, { id: "pB", slug: "beta" }],
      members: [
        { projectId: "pA", userId: "u-owner", role: "OWNER" as const },
        ...Array.from({ length: 12 }, (_, i) => ({
          projectId: "pB",
          userId: `u-b-${i}`,
          role: "EDITOR" as const,
        })),
      ],
      users: [{ id: "u-owner", email: "owner@a.com" }],
    });
    hoisted.prisma = db.prisma;
    hoisted.session = sessionFor("u-owner");
    expect(await createInvitation({ slug: "alpha", email: "new@a.com", role: "EDITOR" })).toMatchObject({
      ok: true,
    });
  });
});
