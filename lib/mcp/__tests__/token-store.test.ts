import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashApiToken } from "../token";

vi.mock("server-only", () => ({}));

const { resolveApiToken } = await import("../token-store");

/**
 * Bearer → 서버 주체 (mcp-connector design §1.2 · §1.25). 조회 방향은 **해시 → 행**이고 원문으로 조회하지 않는다. 주체의 `credential`은
 * `tokenHash`다(2026-09-28 결정) — 잠금 뒤 재읽기가 `userId` AND `tokenHash`로 재발급을 거부한다.
 * ⚠️ **장애는 401이 아니다** — 조회가 던지면 그대로 올린다(route가 500으로 답한다). `lastUsedAt` 쓰기 실패만 삼킨다.
 */

const RAW = "mlm_" + "a".repeat(43);
const HASH = hashApiToken(RAW);
const now = new Date("2026-09-28T12:00:00.000Z");

const apiToken = { findUnique: vi.fn(), updateMany: vi.fn() };
const prisma = { apiToken } as unknown as Parameters<typeof resolveApiToken>[0];

function row(over: Record<string, unknown> = {}) {
  return {
    userId: "u1", tokenHash: HASH, grants: ["translation:write"], allProjects: true, projectIds: [],
    expiresAt: new Date(now.getTime() + 60_000), lastUsedAt: new Date(now.getTime() - 1_000), ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiToken.updateMany.mockResolvedValue({ count: 1 });
});

describe("resolveApiToken", () => {
  it("유효 토큰 → { userId, credential: tokenHash, grants, scope }", async () => {
    apiToken.findUnique.mockResolvedValue(row());
    await expect(resolveApiToken(prisma, RAW, now)).resolves.toEqual({
      userId: "u1", credential: { kind: "api-token", tokenHash: HASH }, grants: ["translation:write"], scope: { kind: "all" },
    });
  });

  it("원문이 아니라 해시로 조회한다", async () => {
    apiToken.findUnique.mockResolvedValue(row());
    await resolveApiToken(prisma, RAW, now);
    expect(apiToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: HASH } }));
    expect(JSON.stringify(apiToken.findUnique.mock.calls)).not.toContain(RAW);
  });

  it("allProjects=false → projects 범위", async () => {
    apiToken.findUnique.mockResolvedValue(row({ allProjects: false, projectIds: ["p1", "p2"] }));
    await expect(resolveApiToken(prisma, RAW, now)).resolves.toMatchObject({ scope: { kind: "projects", projectIds: ["p1", "p2"] } });
  });

  it("어휘 밖 grant 문자열은 버린다 — DB 값을 권한으로 믿지 않는다", async () => {
    apiToken.findUnique.mockResolvedValue(row({ grants: ["member:manage", "admin", "__proto__"] }));
    await expect(resolveApiToken(prisma, RAW, now)).resolves.toMatchObject({ grants: ["member:manage"] });
  });

  it("mlm_ 접두가 아니면 조회하지 않고 null", async () => {
    await expect(resolveApiToken(prisma, "push-token-raw", now)).resolves.toBeNull();
    expect(apiToken.findUnique).not.toHaveBeenCalled();
  });

  it("행 없음(없음·폐기·재발급) → null", async () => {
    apiToken.findUnique.mockResolvedValue(null);
    await expect(resolveApiToken(prisma, RAW, now)).resolves.toBeNull();
  });

  it("만료(expiresAt == now 포함) → null, lastUsedAt을 쓰지 않는다", async () => {
    apiToken.findUnique.mockResolvedValue(row({ expiresAt: new Date(now) }));
    await expect(resolveApiToken(prisma, RAW, now)).resolves.toBeNull();
    expect(apiToken.updateMany).not.toHaveBeenCalled();
  });

  it("lastUsedAt이 1분 안이면 쓰지 않는다", async () => {
    apiToken.findUnique.mockResolvedValue(row());
    await resolveApiToken(prisma, RAW, now);
    expect(apiToken.updateMany).not.toHaveBeenCalled();
  });

  it("처음 쓰거나 1분이 지났으면 userId AND tokenHash로 좁혀 쓴다 — 재발급된 새 행을 건드리지 않는다", async () => {
    apiToken.findUnique.mockResolvedValue(row({ lastUsedAt: null }));
    await resolveApiToken(prisma, RAW, now);
    expect(apiToken.updateMany).toHaveBeenCalledWith({ where: { userId: "u1", tokenHash: HASH }, data: { lastUsedAt: now } });
  });

  it("lastUsedAt 쓰기 실패는 인증을 막지 않는다", async () => {
    apiToken.findUnique.mockResolvedValue(row({ lastUsedAt: null }));
    apiToken.updateMany.mockRejectedValue(new Error("deadlock"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(resolveApiToken(prisma, RAW, now)).resolves.toMatchObject({ userId: "u1" });
  });

  it("조회 장애는 던진다 — 401로 접히면 전면 장애가 '토큰 무효'로 읽힌다", async () => {
    apiToken.findUnique.mockRejectedValue(new Error("P1001"));
    await expect(resolveApiToken(prisma, RAW, now)).rejects.toThrow("P1001");
  });
});
