import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor } from "./harness";

/**
 * 다중 초대·재발급 Action (invitation-email T2.2·T2.3 · design §3·§4).
 *
 * DB 판정은 `lib/invitation-email/issue.ts`가 하고 `invitation.integration.ts`가 실제 PostgreSQL로 잰다.
 * 여기서 보는 것은 **껍데기**다: 인가 → 입력 → 메일 설정 → 발급 → commit 뒤 발송 → 요청 단위 결과.
 *
 * ⚠️ **응답에 토큰·URL이 없다** — 원문은 서버 메모리와 메일에만 있다(spec §5).
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  issueInvitations: vi.fn(),
  reissueInvitation: vi.fn(),
  readConfig: vi.fn(),
  send: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock("@/lib/invitation-email/issue", () => ({
  issueInvitations: hoisted.issueInvitations,
  reissueInvitation: hoisted.reissueInvitation,
}));
vi.mock("@/lib/invitation-email/send", () => ({
  readInvitationEmailConfigFromEnv: hoisted.readConfig,
  sendInvitationEmails: hoisted.send,
}));

const { createInvitations, resendInvitation } = await import("../projects/actions");

const READY = { status: "ready", apiKey: "re_k", from: "malmoi <invite@notify.mal-moi.com>", origin: "https://mal-moi.com" };
const RETRY = new Date("2026-09-23T12:01:00.000Z");

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
    ],
  });
}

beforeEach(() => {
  hoisted.prisma = seeded().prisma;
  hoisted.session = sessionFor("u-owner");
  for (const fn of [hoisted.issueInvitations, hoisted.reissueInvitation, hoisted.readConfig, hoisted.send, hoisted.revalidatePath]) fn.mockReset();
  hoisted.readConfig.mockReturnValue(READY);
  hoisted.send.mockResolvedValue("accepted");
  hoisted.issueInvitations.mockImplementation(async (_prisma: unknown, input: { recipients: { email: string }[] }) => ({
    status: "issued",
    invitations: input.recipients.map((r, i) => ({ email: r.email, token: `tok_${i}` })),
    retryAt: RETRY,
  }));
  hoisted.reissueInvitation.mockResolvedValue({ status: "issued", invitation: { email: "pending@a.com", token: "tok_r" }, retryAt: RETRY });
});

const two = [
  { email: " New@A.com ", role: "EDITOR" },
  { email: "boss@b.com", role: "OWNER" },
];

function noSecrets(result: unknown) {
  const text = JSON.stringify(result);
  expect(text).not.toMatch(/tok_/);
  expect(text).not.toContain("/invite/");
}

describe("createInvitations — 누가 부를 수 있나 (쓰기·발송 0)", () => {
  it.each([
    ["비로그인", null, "unauthorized"],
    ["다른 프로젝트 멤버", "u-other", "not-found"],
    ["EDITOR", "u-editor", "forbidden"],
  ])("%s는 거부된다", async (_name, user, error) => {
    hoisted.session = user === null ? null : sessionFor(user);
    await expect(createInvitations({ slug: "alpha", recipients: two })).resolves.toEqual({ ok: false, error });
    expect(hoisted.issueInvitations).not.toHaveBeenCalled();
    expect(hoisted.send).not.toHaveBeenCalled();
  });
});

describe("createInvitations — 입력 (쓰기·발송 0)", () => {
  it.each([
    ["배열이 아님", { slug: "alpha", recipients: "a@x.com" }],
    ["빈 배열", { slug: "alpha", recipients: [] }],
    ["빈 주소 행", { slug: "alpha", recipients: [{ email: "a@x.com", role: "EDITOR" }, { email: "  ", role: "EDITOR" }] }],
    ["slug 없음", { recipients: two }],
  ])("%s는 invalid input이다", async (_name, raw) => {
    await expect(createInvitations(raw as never)).resolves.toEqual({ ok: false, error: "invalid input" });
    expect(hoisted.issueInvitations).not.toHaveBeenCalled();
  });

  it("20명을 넘으면 too-many다", async () => {
    const recipients = Array.from({ length: 21 }, (_, i) => ({ email: `u${i}@x.com`, role: "EDITOR" }));
    await expect(createInvitations({ slug: "alpha", recipients })).resolves.toEqual({ ok: false, error: "too-many" });
    expect(hoisted.issueInvitations).not.toHaveBeenCalled();
  });

  it("잘못된 주소·역할·중복은 행 인덱스로 돌려준다", async () => {
    const result = await createInvitations({
      slug: "alpha",
      recipients: [
        { email: "bad", role: "EDITOR" },
        { email: "a@x.com", role: "ADMIN" },
        { email: "b@x.com", role: "EDITOR" },
        { email: "B@x.com", role: "OWNER" },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: "invalid-rows",
      rowErrors: [
        { index: 0, code: "invalid-email" },
        { index: 1, code: "invalid-role" },
        { index: 2, code: "role-conflict", otherIndex: 3, otherRole: "OWNER" },
        { index: 3, code: "role-conflict", otherIndex: 2, otherRole: "EDITOR" },
      ],
    });
    expect(hoisted.issueInvitations).not.toHaveBeenCalled();
  });
});

describe("createInvitations — 메일 설정이 없으면 쓰기 전에 막는다", () => {
  it("unavailable이면 email-unavailable이고 발급하지 않는다", async () => {
    hoisted.readConfig.mockReturnValue({ status: "unavailable", reason: "missing" });
    await expect(createInvitations({ slug: "alpha", recipients: two })).resolves.toEqual({ ok: false, error: "email-unavailable" });
    expect(hoisted.issueInvitations).not.toHaveBeenCalled();
    expect(hoisted.send).not.toHaveBeenCalled();
  });
});

describe("createInvitations — 발급 판정의 거부는 발송 0", () => {
  it("인가된 projectId와 정규화한 수신자로 발급을 부른다", async () => {
    await createInvitations({ slug: "alpha", recipients: two });
    expect(hoisted.issueInvitations).toHaveBeenCalledWith(hoisted.prisma, {
      projectId: "pA",
      userId: "u-owner",
      recipients: [
        { email: "new@a.com", role: "EDITOR" },
        { email: "boss@b.com", role: "OWNER" },
      ],
    });
  });

  it("이미 멤버는 행 오류다", async () => {
    hoisted.issueInvitations.mockResolvedValueOnce({ status: "invalid-rows", rowErrors: [{ index: 1, code: "already-member" }] });
    await expect(createInvitations({ slug: "alpha", recipients: two })).resolves.toEqual({
      ok: false,
      error: "invalid-rows",
      rowErrors: [{ index: 1, code: "already-member" }],
    });
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("주소 간격 제한이면 재시도 시각과 막힌 행을 돌려준다", async () => {
    hoisted.issueInvitations.mockResolvedValueOnce({ status: "rate-limited", retryAt: RETRY, limit: "address", index: 1 });
    await expect(createInvitations({ slug: "alpha", recipients: two })).resolves.toEqual({
      ok: false,
      error: "rate-limited",
      retryAt: RETRY.toISOString(),
      limit: "address",
      index: 1,
    });
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("프로젝트 한도면 재시도 시각과 최근 1시간 발급 수를 돌려준다", async () => {
    hoisted.issueInvitations.mockResolvedValueOnce({ status: "rate-limited", retryAt: RETRY, limit: "project", used: 18 });
    await expect(createInvitations({ slug: "alpha", recipients: two })).resolves.toEqual({
      ok: false,
      error: "rate-limited",
      retryAt: RETRY.toISOString(),
      limit: "project",
      used: 18,
    });
  });

  it("좌석이 없으면 member-limit이다", async () => {
    hoisted.issueInvitations.mockResolvedValueOnce({ status: "member-limit", limit: 10 });
    await expect(createInvitations({ slug: "alpha", recipients: two })).resolves.toEqual({ ok: false, error: "member-limit" });
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("DB 실패는 unavailable이고 발송하지 않는다", async () => {
    hoisted.issueInvitations.mockRejectedValueOnce(new Error("deadlock detected"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createInvitations({ slug: "alpha", recipients: two })).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(hoisted.send).not.toHaveBeenCalled();
  });
});

describe("createInvitations — commit 뒤 한 번 발송하고 요청 단위로 답한다", () => {
  it("전체 접수면 인원 수만 돌려주고 토큰·URL은 없다", async () => {
    const result = await createInvitations({ slug: "alpha", recipients: two });
    expect(result).toEqual({ ok: true, count: 2 });
    noSecrets(result);
    expect(hoisted.send).toHaveBeenCalledTimes(1);
    expect(hoisted.send).toHaveBeenCalledWith(READY, [
      { to: "new@a.com", token: "tok_0" },
      { to: "boss@b.com", token: "tok_1" },
    ]);
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects/alpha/members");
  });

  it.each([
    ["rejected", "email-rejected"],
    ["unknown", "email-unknown"],
  ])("발송 %s는 저장을 뒤집지 않고 %s + 재시도 시각이다", async (outcome, error) => {
    hoisted.send.mockResolvedValueOnce(outcome);
    const result = await createInvitations({ slug: "alpha", recipients: two });
    expect(result).toEqual({ ok: false, error, retryAt: RETRY.toISOString() });
    noSecrets(result);
    // 초대는 이미 생겼으므로 Pending 목록을 다시 그린다.
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects/alpha/members");
  });
});

describe("resendInvitation — 누가 부를 수 있나 (쓰기·발송 0)", () => {
  it.each([
    ["비로그인", null, "unauthorized"],
    ["다른 프로젝트 멤버", "u-other", "not-found"],
    ["EDITOR", "u-editor", "forbidden"],
  ])("%s는 거부된다", async (_name, user, error) => {
    hoisted.session = user === null ? null : sessionFor(user);
    await expect(resendInvitation({ slug: "alpha", invitationId: "inv" })).resolves.toEqual({ ok: false, error });
    expect(hoisted.reissueInvitation).not.toHaveBeenCalled();
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("입력이 문자열이 아니면 invalid input이다", async () => {
    await expect(resendInvitation({ slug: "alpha", invitationId: 7 } as never)).resolves.toEqual({ ok: false, error: "invalid input" });
    expect(hoisted.reissueInvitation).not.toHaveBeenCalled();
  });

  it("메일 설정이 없으면 재발급하지 않는다", async () => {
    hoisted.readConfig.mockReturnValue({ status: "unavailable", reason: "missing" });
    await expect(resendInvitation({ slug: "alpha", invitationId: "inv" })).resolves.toEqual({ ok: false, error: "email-unavailable" });
    expect(hoisted.reissueInvitation).not.toHaveBeenCalled();
  });
});

describe("resendInvitation — 저장된 주소로 재발급 후 발송", () => {
  it("인가된 projectId와 id만 넘긴다 — 주소·역할을 클라이언트에서 받지 않는다", async () => {
    await resendInvitation({ slug: "alpha", invitationId: "inv", email: "evil@x.com", role: "OWNER" } as never);
    expect(hoisted.reissueInvitation).toHaveBeenCalledWith(hoisted.prisma, { projectId: "pA", userId: "u-owner", invitationId: "inv" });
  });

  it("접수되면 서버 마스킹 라벨을 돌려준다", async () => {
    const result = await resendInvitation({ slug: "alpha", invitationId: "inv" });
    expect(result).toEqual({ ok: true, label: "p***@a.com" });
    noSecrets(result);
    expect(result).not.toEqual(expect.objectContaining({ label: "pending@a.com" }));
    expect(hoisted.send).toHaveBeenCalledWith(READY, [{ to: "pending@a.com", token: "tok_r" }]);
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects/alpha/members");
  });

  it.each([
    [{ status: "not-found" }, { ok: false, error: "not-found" }],
    [{ status: "unreadable" }, { ok: false, error: "unavailable" }],
    [{ status: "invalid-rows", rowErrors: [{ index: 0, code: "already-member" }] }, { ok: false, error: "already-member" }],
    [{ status: "member-limit", limit: 10 }, { ok: false, error: "member-limit" }],
    [{ status: "rate-limited", retryAt: RETRY, limit: "address", index: 0 }, { ok: false, error: "rate-limited", retryAt: RETRY.toISOString(), limit: "address" }],
    [{ status: "rate-limited", retryAt: RETRY, limit: "project", used: 20 }, { ok: false, error: "rate-limited", retryAt: RETRY.toISOString(), limit: "project", used: 20 }],
  ])("재발급 거부 %j는 발송 0이다", async (outcome, expected) => {
    hoisted.reissueInvitation.mockResolvedValueOnce(outcome);
    await expect(resendInvitation({ slug: "alpha", invitationId: "inv" })).resolves.toEqual(expected);
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it.each([
    ["rejected", "email-rejected"],
    ["unknown", "email-unknown"],
  ])("발송 %s는 %s + 라벨 + 재시도 시각이다", async (outcome, error) => {
    hoisted.send.mockResolvedValueOnce(outcome);
    const result = await resendInvitation({ slug: "alpha", invitationId: "inv" });
    expect(result).toEqual({ ok: false, error, label: "p***@a.com", retryAt: RETRY.toISOString() });
    noSecrets(result);
  });

  it("DB 실패는 unavailable이고 발송하지 않는다", async () => {
    hoisted.reissueInvitation.mockRejectedValueOnce(new Error("deadlock detected"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(resendInvitation({ slug: "alpha", invitationId: "inv" })).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(hoisted.send).not.toHaveBeenCalled();
  });
});
