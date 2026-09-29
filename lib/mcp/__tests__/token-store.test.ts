import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashApiToken } from "../token";

vi.mock("server-only", () => ({}));

const { resolveApiToken, resolveBearer, resolveOAuthAccess } = await import("../token-store");

/**
 * Bearer → 서버 주체 (mcp-connector design §1.2 · §1.25). 조회 방향은 **해시 → 행**이고 원문으로 조회하지 않는다. 주체의 `credential`은
 * `tokenHash`다(2026-09-28 결정) — 잠금 뒤 재읽기가 `userId` AND `tokenHash`로 재발급을 거부한다.
 * ⚠️ **장애는 401이 아니다** — 조회가 던지면 그대로 올린다(route가 500으로 답한다). `lastUsedAt` 쓰기 실패만 삼킨다.
 */

const RAW = "mlm_" + "a".repeat(43);
const HASH = hashApiToken(RAW);
const now = new Date("2026-09-28T12:00:00.000Z");

const apiToken = { findUnique: vi.fn(), updateMany: vi.fn() };
const oAuthConnection = { findUnique: vi.fn(), updateMany: vi.fn() };
const prisma = { apiToken, oAuthConnection } as unknown as Parameters<typeof resolveBearer>[0];

function row(over: Record<string, unknown> = {}) {
  return {
    userId: "u1", tokenHash: HASH, grants: ["translation:write"], allProjects: true, projectIds: [],
    expiresAt: new Date(now.getTime() + 60_000), lastUsedAt: new Date(now.getTime() - 1_000), ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiToken.updateMany.mockResolvedValue({ count: 1 });
  oAuthConnection.updateMany.mockResolvedValue({ count: 1 });
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

/**
 * **OAuth access → 주체** (mcp-oauth design §5). 조회는 access 해시 → 연결 하나이고, 주체의 `credential`은 **연결 id**다 — 잠금 뒤 재읽기가
 * `userId` AND 연결 id로 읽는다(refresh가 access를 회전해도 같은 연결의 쓰기는 정당하다). 발급 환경 바인딩은 현재 엔드포인트와 대조한다.
 */
const ENDPOINT = { issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" };
const ACCESS = "mlo_" + "a".repeat(43);
const ACCESS_HASH = hashApiToken(ACCESS);

function connection(over: Record<string, unknown> = {}) {
  return {
    id: "c1", userId: "u1", issuer: ENDPOINT.issuer, resource: ENDPOINT.resource, grants: ["translation:write"], allProjects: true, projectIds: [],
    accessExpiresAt: new Date(now.getTime() + 60_000), expiresAt: new Date(now.getTime() + 86_400_000), lastUsedAt: new Date(now.getTime() - 1_000), ...over,
  };
}

describe("resolveOAuthAccess", () => {
  it("유효 access → { userId, credential: connectionId, grants, scope } — 해시로 조회한다", async () => {
    oAuthConnection.findUnique.mockResolvedValue(connection());
    await expect(resolveOAuthAccess(prisma, ACCESS, now, ENDPOINT)).resolves.toEqual({
      userId: "u1", credential: { kind: "oauth", connectionId: "c1" }, grants: ["translation:write"], scope: { kind: "all" },
    });
    expect(oAuthConnection.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { accessTokenHash: ACCESS_HASH } }));
    expect(JSON.stringify(oAuthConnection.findUnique.mock.calls)).not.toContain(ACCESS);
  });

  it("access 만료 · 연결 만료 · 다른 issuer · 다른 resource · 행 없음 → null, 사용 시각을 쓰지 않는다", async () => {
    for (const row of [
      connection({ accessExpiresAt: now, lastUsedAt: null }),
      connection({ expiresAt: now, lastUsedAt: null }),
      connection({ issuer: "https://dev.mal-moi.com", lastUsedAt: null }),
      connection({ resource: "https://dev.mal-moi.com/api/mcp", lastUsedAt: null }),
      null,
    ]) {
      oAuthConnection.findUnique.mockResolvedValue(row);
      await expect(resolveOAuthAccess(prisma, ACCESS, now, ENDPOINT)).resolves.toBeNull();
    }
    expect(oAuthConnection.updateMany).not.toHaveBeenCalled();
  });

  it("mlo_ 접두가 아니면 조회하지 않는다 — refresh(mlr_)를 Bearer로 붙인 설정도", async () => {
    await expect(resolveOAuthAccess(prisma, "mlr_" + "a".repeat(43), now, ENDPOINT)).resolves.toBeNull();
    expect(oAuthConnection.findUnique).not.toHaveBeenCalled();
  });

  it("사용 시각은 1분 단위로 userId AND 연결 id로 좁혀 쓰고, 실패해도 인증을 막지 않는다", async () => {
    oAuthConnection.findUnique.mockResolvedValue(connection({ lastUsedAt: null }));
    oAuthConnection.updateMany.mockRejectedValue(new Error("deadlock"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(resolveOAuthAccess(prisma, ACCESS, now, ENDPOINT)).resolves.toMatchObject({ userId: "u1" });
    expect(oAuthConnection.updateMany).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1" }, data: { lastUsedAt: now } });
  });

  it("조회 장애는 던진다", async () => {
    oAuthConnection.findUnique.mockRejectedValue(new Error("P1001"));
    await expect(resolveOAuthAccess(prisma, ACCESS, now, ENDPOINT)).rejects.toThrow("P1001");
  });
});

describe("resolveBearer — 접두로 가른 뒤 한 종류만 조회한다", () => {
  it("mlm_ → 개인 토큰만 · mlo_ → OAuth만 · 그 밖 → 조회 없음", async () => {
    apiToken.findUnique.mockResolvedValue(row());
    oAuthConnection.findUnique.mockResolvedValue(connection());
    await expect(resolveBearer(prisma, RAW, now, ENDPOINT)).resolves.toMatchObject({ credential: { kind: "api-token" } });
    expect(oAuthConnection.findUnique).not.toHaveBeenCalled();
    await expect(resolveBearer(prisma, ACCESS, now, ENDPOINT)).resolves.toMatchObject({ credential: { kind: "oauth" } });
    expect(apiToken.findUnique).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    for (const token of ["mlr_" + "a".repeat(43), "push-token", "mlo_"]) await expect(resolveBearer(prisma, token, now, ENDPOINT)).resolves.toBeNull();
    expect(apiToken.findUnique).not.toHaveBeenCalled();
    expect(oAuthConnection.findUnique).not.toHaveBeenCalled();
  });

  it("현재 엔드포인트를 모르면(허용 밖 호스트) OAuth는 조회하지 않고 거부한다 · 개인 토큰은 그대로다", async () => {
    apiToken.findUnique.mockResolvedValue(row());
    await expect(resolveBearer(prisma, ACCESS, now, null)).resolves.toBeNull();
    expect(oAuthConnection.findUnique).not.toHaveBeenCalled();
    await expect(resolveBearer(prisma, RAW, now, null)).resolves.toMatchObject({ userId: "u1" });
  });

  /** spec 조건 7 — 같은 grants·범위면 두 주체의 권한이 같다(판정 코어 `planToolAccess`는 권한만 본다). */
  it.each([
    { grants: [], allProjects: true, projectIds: [] },
    { grants: ["translation:write", "project:create"], allProjects: false, projectIds: ["p1"] },
    { grants: ["member:manage", "admin", "__proto__"], allProjects: true, projectIds: [] },
  ])("같은 행 모양이면 같은 권한 — %o", async shape => {
    apiToken.findUnique.mockResolvedValue(row(shape));
    oAuthConnection.findUnique.mockResolvedValue(connection(shape));
    const { credential: a, ...viaToken } = (await resolveBearer(prisma, RAW, now, ENDPOINT))!;
    const { credential: b, ...viaOAuth } = (await resolveBearer(prisma, ACCESS, now, ENDPOINT))!;
    expect(viaOAuth).toEqual(viaToken);
    expect([a.kind, b.kind]).toEqual(["api-token", "oauth"]);
  });
});
