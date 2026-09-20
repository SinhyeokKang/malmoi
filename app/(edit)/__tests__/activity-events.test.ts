import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor, type Seed } from "./harness";

/**
 * **활동 사건이 변경과 같은 트랜잭션에서 확정된다** (logs-rework 완료조건 2 · T5a·T5d).
 *
 * ⚠️ **여기서 재는 것은 "원자성과 갈래"다** — 실제 Postgres의 잠금·동시성은
 * `pnpm test:projects:postgres`가 본다(가짜의 호출 수로 그것을 판정하지 않는다).
 *
 * ⚠️ **없어야 하는 사건을 함께 센다.** 있는 것만 세면 "no-op에도 줄이 선다"·"거부가 이력을
 * 만든다" 같은 부류가 통과한다 — 결정 7이 정확히 그 목록이다.
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  revalidatePath: vi.fn(),
  triggerPull: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: hoisted.triggerPull }));

const { saveTranslation, triggerPullAction } = await import("../actions");
const { createInvitation, revokeInvitation, changeMember, archiveProject, unarchiveProject, rotatePushToken } =
  await import("../projects/actions");

const ARCHIVED_AT = new Date("2026-09-10T00:00:00Z");

let db: ReturnType<typeof createHarness>;

function seeded(over: Seed = {}) {
  return createHarness({
    projects: [
      { id: "pA", slug: "alpha", lastCommitSha: "a".repeat(40), installationId: "1" },
      { id: "pB", slug: "beta", archivedAt: ARCHIVED_AT, lastCommitSha: "b".repeat(40), installationId: "1" },
    ],
    members: [
      { projectId: "pA", userId: "u-owner", role: "OWNER" },
      { projectId: "pA", userId: "u-editor", role: "EDITOR" },
      { projectId: "pB", userId: "u-owner", role: "OWNER" },
    ],
    users: [
      { id: "u-owner", email: "owner@example.com", name: "Owner" },
      { id: "u-editor", email: "editor@example.com", name: null },
    ],
    keys: [{ id: "k1", projectId: "pA", key: "a.greet", sourceText: "Hi", description: null, sortIndex: 0, orphaned: false }],
    locales: [{ projectId: "pA", code: "ko", isBase: false, orphaned: false }],
    ...over,
  });
}

beforeEach(() => {
  db = seeded();
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-owner");
  hoisted.revalidatePath.mockReset();
  hoisted.triggerPull.mockReset();
});

const save = (value: string) =>
  saveTranslation({ slug: "alpha", surfaceSlug: "default", keyId: "k1", localeCode: "ko", value });

describe("번역 저장 — 값과 사건이 같은 트랜잭션이다", () => {
  it("실제로 바뀐 저장만 사건을 만들고, 전후 값이 잠금 뒤 읽은 값이다", async () => {
    await save("안녕");
    await save("반가워");

    expect(db.projectEvents).toHaveLength(2);
    expect(db.projectEvents.map((row) => row.payload)).toEqual([
      { kind: "TRANSLATION", surfaceSlug: "default", key: "a.greet", locale: "ko", before: null, after: "안녕" },
      { kind: "TRANSLATION", surfaceSlug: "default", key: "a.greet", locale: "ko", before: "안녕", after: "반가워" },
    ]);
  });

  /** ⚠️ **값이 그대로면 일어난 일이 없다** (완료조건 3) — 번역·편집 토큰·사건 셋 다 안 쓴다. */
  it("no-op은 사건 0건이다", async () => {
    await save("안녕");
    const token = db.translations[0]?.pendingEditToken;
    await save("안녕");

    expect(db.projectEvents).toHaveLength(1);
    expect(db.translations[0]?.pendingEditToken).toBe(token);
  });

  /** ⚠️ **이벤트만 남고 변경이 없는 조합이 생기면 이력이 거짓이 된다** — 반대 방향도 같다. */
  it("사건 INSERT가 실패하면 번역 저장도 롤백된다", async () => {
    db.spies.createEvent.mockRejectedValueOnce(new Error("event store down"));
    await expect(save("안녕")).rejects.toThrow("event store down");

    expect(db.translations).toHaveLength(0);
    expect(db.projectEvents).toHaveLength(0);
  });

  it("거부된 저장은 사건을 만들지 않는다 — 키가 이 프로젝트 것이 아니다", async () => {
    const result = await saveTranslation({ slug: "alpha", surfaceSlug: "default", keyId: "nope", localeCode: "ko", value: "x" });
    expect(result).toEqual({ ok: false, error: "key not found in this project" });
    expect(db.projectEvents).toHaveLength(0);
  });

  it("행위자가 세션의 User.id다 — 번역 사건도 예외가 아니다 (결정 4)", async () => {
    await save("안녕");
    expect(db.projectEvents[0]).toMatchObject({ actorKind: "USER", actorUserId: "u-owner" });
  });

  it("사건 당시 대상 소스가 그 표면 하나다", async () => {
    await save("안녕");
    expect(db.projectEvents[0]?.surfaceScope).toBe("sources");
    expect(db.projectEvents[0]?.surfaceIds).toEqual(["surface-pA"]);
  });
});

describe("Publish 선행 거부 — 여섯만 남는다 (결정 7)", () => {
  it("보관된 프로젝트의 Publish가 Not started로 남는다", async () => {
    const result = await triggerPullAction("beta");
    expect(result.status).toBe("failed");
    expect(db.projectEvents).toHaveLength(1);
    expect(db.projectEvents[0]).toMatchObject({
      projectId: "pB", kind: "PUBLISH", result: "notStarted", surfaceScope: "project-wide",
      payload: { kind: "PUBLISH", surfaceSlugs: [], refusal: "archived" },
    });
  });

  /** ⚠️ **인가되지 않은 호출이 남의 이력에 줄을 세우면 그 자체가 쓰기 경로다.** */
  it("세션·멤버십 거부는 사건 0건이다", async () => {
    hoisted.session = null;
    expect((await triggerPullAction("beta")).status).toBe("failed");
    hoisted.session = sessionFor("u-stranger");
    expect((await triggerPullAction("beta")).status).toBe("failed");
    expect(db.projectEvents).toHaveLength(0);
  });

  it("입력 검증 실패도 사건 0건이다", async () => {
    expect((await triggerPullAction("")).status).toBe("failed");
    expect(db.projectEvents).toHaveLength(0);
  });
});

describe("멤버 — 넷이 같은 계열로 남는다", () => {
  it("초대는 마스킹 라벨과 역할만 남긴다 — 링크 원문도 해시도 없다", async () => {
    const result = await createInvitation({ slug: "alpha", email: "New.Person@Example.com", role: "EDITOR" });
    expect(result.ok).toBe(true);

    expect(db.projectEvents).toHaveLength(1);
    const event = db.projectEvents[0]!;
    expect(event).toMatchObject({ kind: "MEMBER", surfaceScope: "project-wide", actorUserId: "u-owner" });
    expect(event.payload).toEqual({ kind: "MEMBER", targetLabel: "n***@example.com", role: { before: null, after: "EDITOR" } });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("new.person@example.com");
    expect(serialized).not.toContain(result.ok ? result.token : "");
  });

  it("무효화가 0행이면 사건도 없다", async () => {
    const before = await revokeInvitation({ slug: "alpha", invitationId: "nope" });
    expect(before).toEqual({ ok: false, error: "not-found" });
    expect(db.projectEvents).toHaveLength(0);
  });

  it("역할 변경과 제거가 같은 계열이고 전후를 싣는다", async () => {
    await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: "OWNER" });
    await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: null });

    // ⚠️ **이름이 없으면 마스킹 주소로 떨어진다** — 멤버 표와 같은 폴백이고, 원문은 어디에도 안 남는다.
    expect(db.projectEvents.map((row) => row.payload)).toEqual([
      { kind: "MEMBER", targetLabel: "e***@example.com", role: { before: "EDITOR", after: "OWNER" } },
      { kind: "MEMBER", targetLabel: "e***@example.com", role: { before: "OWNER", after: null } },
    ]);
    expect(JSON.stringify(db.projectEvents)).not.toContain("editor@example.com");
  });

  /** 마지막 OWNER 보호가 롤백을 던지는 갈래 — 변경이 없으면 사건도 없다. */
  it("last-owner 롤백은 사건을 남기지 않는다", async () => {
    const result = await changeMember({ slug: "alpha", targetUserId: "u-owner", nextRole: null });
    expect(result).toEqual({ ok: false, error: "last-owner" });
    expect(db.projectEvents).toHaveLength(0);
  });
});

describe("설정 — 값·해시·주소를 싣지 않는다 (T5c)", () => {
  it("토큰 회전은 사실만 남긴다", async () => {
    const result = await rotatePushToken({ slug: "alpha" });
    expect(result.ok).toBe(true);
    expect(db.projectEvents[0]?.payload).toEqual({ kind: "SETTINGS", field: "pushToken", value: null });
    expect(JSON.stringify(db.projectEvents[0])).not.toContain(result.ok ? result.pushToken : "");
  });

  it("보관·복원이 각각 한 건이고 전후를 말한다", async () => {
    await archiveProject("alpha");
    await unarchiveProject("alpha");
    expect(db.projectEvents.map((row) => row.payload)).toEqual([
      { kind: "SETTINGS", field: "archived", value: { before: null, after: "archived" } },
      { kind: "SETTINGS", field: "archived", value: { before: "archived", after: null } },
    ]);
  });
});

describe("검색 문자열 — 유일한 관문을 지난다 (결정 3)", () => {
  it("번역 사건이 키·소스·로케일로 검색되고 본문은 안 들어간다", async () => {
    await save("비밀값입니다");
    const searchText = db.projectEvents[0]?.searchText as string;
    expect(searchText).toContain("a.greet");
    expect(searchText).toContain("default");
    expect(searchText).toContain("ko");
    expect(searchText).not.toContain("비밀값입니다");
  });

  it("모든 사건이 자기 참조로 검색된다 — 조립을 빠뜨린 종류가 없다", async () => {
    await save("안녕");
    await createInvitation({ slug: "alpha", email: "a@b.com", role: "EDITOR" });
    await rotatePushToken({ slug: "alpha" });
    expect(db.projectEvents).toHaveLength(3);
    for (const row of db.projectEvents) {
      expect(typeof row.searchText, String(row.ref)).toBe("string");
      expect(row.searchText as string).toContain(String(row.ref));
    }
  });
});

it("이미 같은 역할과 복원 상태면 사건이 없다", async () => {
  expect(await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: "EDITOR" })).toEqual({ ok: true });
  expect(await unarchiveProject("alpha")).toEqual({ ok: true });
  expect(db.projectEvents).toHaveLength(0);
});

it("이미 취소된 초대는 다시 사건을 만들지 않는다", async () => {
  const created = await createInvitation({ slug: "alpha", email: "new@example.com", role: "EDITOR" });
  expect(created.ok).toBe(true);
  const invitation = db.invitations[0]!;
  await revokeInvitation({ slug: "alpha", invitationId: invitation.id });
  await revokeInvitation({ slug: "alpha", invitationId: invitation.id });
  expect(db.projectEvents.filter(row => row.subtype === "member.invitationRevoked")).toHaveLength(1);
});

it("멤버 대상 이름을 영구 사건과 검색 문자열에 복제하지 않는다", async () => {
  db.users.find(user => user.id === "u-editor")!.name = "Private Member Name";
  await changeMember({ slug: "alpha", targetUserId: "u-editor", nextRole: "OWNER" });
  expect(JSON.stringify(db.projectEvents)).not.toContain("Private Member Name");
  expect(db.projectEvents[0]?.payload).toMatchObject({ targetLabel: "e***@example.com" });
});
