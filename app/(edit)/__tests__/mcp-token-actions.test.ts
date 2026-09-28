import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashApiToken } from "@/lib/mcp/token";

/**
 * MCP 토큰 Server Action (mcp-connector T5). 계정당 하나 · 불변이라 **Create와 Rotate가 같은 Action**이다 — 기존 행 삭제 + 새 행 삽입을
 * 한 tx로. 원문은 결과로 한 번만 나가고 DB에는 해시만 간다. 모든 쿼리는 세션의 `userId`로만 좁힌다(POSTMORTEM 2026-09-06).
 */

const hoisted = vi.hoisted(() => {
  const apiToken = { deleteMany: vi.fn(), create: vi.fn() };
  const projectMember = { findMany: vi.fn() };
  const calls: string[] = [];
  return {
    apiToken, projectMember, calls,
    requireUser: vi.fn(),
    revalidateAfterCommit: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: hoisted.requireUser }));
vi.mock("@/lib/revalidate-after-commit", () => ({ revalidateAfterCommit: hoisted.revalidateAfterCommit }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    projectMember: hoisted.projectMember,
    apiToken: hoisted.apiToken,
    $transaction: hoisted.transaction,
  }),
}));

const { issueApiToken, revokeApiToken } = await import("../mcp/actions");

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.calls.length = 0;
  hoisted.requireUser.mockResolvedValue({ userId: "alice" });
  hoisted.projectMember.findMany.mockResolvedValue([{ projectId: "p1" }, { projectId: "p2" }]);
  hoisted.apiToken.deleteMany.mockImplementation(async () => { hoisted.calls.push("delete"); return { count: 1 }; });
  hoisted.apiToken.create.mockImplementation(async () => { hoisted.calls.push("create"); return {}; });
  hoisted.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({ apiToken: hoisted.apiToken }));
});

const valid = { expiresInDays: 90, grants: ["translation:write"], scope: { kind: "all" } };

describe("issueApiToken", () => {
  it("mlm_ 원문을 한 번 돌려주고 DB엔 해시만 넣는다", async () => {
    const result = await issueApiToken(valid);
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.token).toMatch(/^mlm_[A-Za-z0-9_-]{43}$/);
    const data = hoisted.apiToken.create.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ userId: "alice", tokenHash: hashApiToken(result.token), grants: ["translation:write"], allProjects: true, projectIds: [] });
    expect(JSON.stringify(hoisted.apiToken.create.mock.calls)).not.toContain(result.token);
    expect(new Date(result.expiresAt).getTime()).toBe(data.expiresAt.getTime());
  });

  it("기존 행 삭제 → 삽입이 한 tx 안이다 — Create와 Rotate가 같다", async () => {
    await issueApiToken(valid);
    expect(hoisted.transaction).toHaveBeenCalledTimes(1);
    expect(hoisted.calls).toEqual(["delete", "create"]);
    expect(hoisted.apiToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "alice" } });
  });

  it("범위 판정은 세션 사용자의 비보관 멤버십으로 한다", async () => {
    await issueApiToken({ ...valid, scope: { kind: "projects", projectIds: ["p2"] } });
    expect(hoisted.projectMember.findMany).toHaveBeenCalledWith({ where: { userId: "alice", project: { archivedAt: null } }, select: { projectId: true } });
    expect(hoisted.apiToken.create.mock.calls[0]?.[0]?.data).toMatchObject({ allProjects: false, projectIds: ["p2"] });
  });

  it.each([
    [{ ...valid, expiresInDays: 7 }, "invalid-expiry"],
    [{ ...valid, grants: ["admin"] }, "invalid-grants"],
    [{ ...valid, scope: { kind: "projects", projectIds: ["p9"] } }, "invalid-scope"],
    [{ ...valid, scope: { kind: "projects", projectIds: [] } }, "invalid-scope"],
    [{ expiresInDays: "90" }, "invalid-input"],
    [null, "invalid-input"],
  ] as const)("거부 %j → %s, 쓰기 0회", async (input, reason) => {
    await expect(issueApiToken(input)).resolves.toEqual({ ok: false, reason });
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it("DB 장애 → unavailable, 원문을 돌려주지 않는다", async () => {
    hoisted.transaction.mockRejectedValue(new Error("P1001"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(issueApiToken(valid)).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(hoisted.revalidateAfterCommit).not.toHaveBeenCalled();
  });

  it("커밋 뒤 /mcp를 다시 그린다", async () => {
    await issueApiToken(valid);
    expect(hoisted.revalidateAfterCommit).toHaveBeenCalledWith("mcp-token", "/mcp");
  });
});

describe("revokeApiToken", () => {
  it("세션 사용자의 행만 지운다 — 멱등", async () => {
    await expect(revokeApiToken()).resolves.toEqual({ ok: true });
    expect(hoisted.apiToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "alice" } });
    expect(hoisted.revalidateAfterCommit).toHaveBeenCalledWith("mcp-token", "/mcp");
  });

  it("DB 장애 → unavailable", async () => {
    hoisted.apiToken.deleteMany.mockRejectedValue(new Error("P1001"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(revokeApiToken()).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
