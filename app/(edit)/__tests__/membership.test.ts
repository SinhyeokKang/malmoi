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

vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createInvitation, changeMember } = await import("../projects/actions");
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
      { projectId: "pA", userId: "u-owner", role: "OWNER" },
      { projectId: "pA", userId: "u-editor", role: "EDITOR" },
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
    expect(db.members).toContainEqual({ projectId: "pA", userId: "u-guest", role: "EDITOR" });
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

  it("토큰 원문이 아니라 해시로 조회한다", async () => {
    invite();
    await acceptInvitation({ token: "tok" });
    expect(db.spies.findInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashInviteToken("tok") } }),
    );
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
    db.members.push({ projectId: "pA", userId: "u-second", role: "OWNER" });
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
      { projectId: "pA", userId: "u-owner", role: "OWNER" },
      { projectId: "pA", userId: "u-ghost", role: "EDITOR" },
    ]);
    const result = await changeMember({ slug: "alpha", targetUserId: "u-ghost", nextRole: null });
    expect(result).toEqual({ ok: false, error: "not-member" });
  });

  it("역할 변경도 같다", async () => {
    db.spies.findManyMembers.mockImplementationOnce(async () => [
      { projectId: "pA", userId: "u-owner", role: "OWNER" },
      { projectId: "pA", userId: "u-ghost", role: "EDITOR" },
    ]);
    const result = await changeMember({ slug: "alpha", targetUserId: "u-ghost", nextRole: "OWNER" });
    expect(result).toEqual({ ok: false, error: "not-member" });
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
