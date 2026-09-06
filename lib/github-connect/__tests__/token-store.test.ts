import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 사용자 토큰 확보 껍데기 (design §2.4). **판정은 `planTokenUse`·`refreshFailure`가 하고, 여기는
 * 읽기·갱신·쓰기와 경합 처리만 한다.**
 *
 * ⚠️ **GitHub의 refresh 토큰은 1회용(회전)이다.** 갱신에 성공하면 이전 access/refresh 둘 다 무효라
 * **결과를 즉시 써야** 한다 — 안 쓰면 다음 요청이 반드시 `reauthorize`다 (POSTMORTEM 2026-09-05
 * "검증은 했는데 검증한 값을 저장하지 않아").
 *
 * ⚠️ **쓰기는 조건부다.** 탭 둘이 같은 만료 토큰을 읽어 둘 다 갱신하면 GitHub이 둘째를 거부한다.
 * `where`에 **읽었던 `refresh_token`**을 넣어 진 쪽의 count가 0이 되게 하고, 그때는 행을 다시 읽어
 * 이긴 쪽의 토큰을 쓴다 — `acceptInvitation`의 단일 사용과 같은 형태다 (ARCHITECTURE §6.3).
 *
 * ⚠️ **`userId`를 어떤 update에도 넣지 않는다.** 넣으면 경합 상황에서 소유권이 이동한다.
 *
 * ⚠️ 행 조회가 `findFirst`인 것은 취향이 아니다 — `Account`의 unique는 `@@id([provider,
 * providerAccountId])` 하나뿐이라 **`userId`로는 `findUnique`가 성립하지 않는다**.
 */

const hoisted = vi.hoisted(() => ({
  refreshUserToken: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/github-connect/user", () => ({ refreshUserToken: hoisted.refreshUserToken }));

const { ensureUserToken } = await import("../token-store");

const NOW = new Date("2026-09-06T00:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

/** `Account` 행 중 이 껍데기가 보는 것만. */
function row(over: Partial<{ access_token: string; refresh_token: string | null; expires_at: number | null }> = {}) {
  return {
    access_token: "live-token",
    refresh_token: "refresh-1",
    expires_at: Math.floor(at(3600).getTime() / 1000),
    ...over,
  };
}

const prisma = {
  account: { findFirst: hoisted.findFirst, updateMany: hoisted.updateMany },
} as unknown as Parameters<typeof ensureUserToken>[0];

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.updateMany.mockResolvedValue({ count: 1 });
});

describe("ensureUserToken — 연결이 없거나 아직 유효한 경우", () => {
  it("Account 행이 없으면 not-connected다 — 갱신도 쓰기도 하지 않는다", () => {
    hoisted.findFirst.mockResolvedValue(null);
    return ensureUserToken(prisma, "u1", NOW).then((result) => {
      expect(result).toEqual({ status: "not-connected" });
      expect(hoisted.refreshUserToken).not.toHaveBeenCalled();
      expect(hoisted.updateMany).not.toHaveBeenCalled();
    });
  });

  it("만료가 남았으면 저장된 토큰을 그대로 준다 — 헛된 갱신을 하지 않는다", async () => {
    hoisted.findFirst.mockResolvedValue(row());
    const result = await ensureUserToken(prisma, "u1", NOW);
    expect(result).toEqual({ status: "ok", accessToken: "live-token" });
    expect(hoisted.refreshUserToken).not.toHaveBeenCalled();
    expect(hoisted.updateMany).not.toHaveBeenCalled();
  });

  it("expires_at이 null이면 그대로 쓴다 — 만료를 모르면 401이 판정한다", async () => {
    hoisted.findFirst.mockResolvedValue(row({ expires_at: null }));
    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({
      status: "ok",
      accessToken: "live-token",
    });
  });

  it("만료됐는데 refresh 토큰이 없으면 reauthorize다 — 쓰기 0회", async () => {
    hoisted.findFirst.mockResolvedValue(row({ expires_at: 0, refresh_token: null }));
    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({ status: "reauthorize" });
    expect(hoisted.refreshUserToken).not.toHaveBeenCalled();
    expect(hoisted.updateMany).not.toHaveBeenCalled();
  });
});

describe("ensureUserToken — 갱신하면 즉시 저장한다", () => {
  const expired = () => row({ expires_at: Math.floor(NOW.getTime() / 1000) });
  const refreshed = {
    accessToken: "new-token",
    refreshToken: "refresh-2",
    expiresAt: at(28800),
  };

  it("만료됐고 refresh 토큰이 있으면 갱신하고 새 토큰을 준다", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockResolvedValue(refreshed);

    const result = await ensureUserToken(prisma, "u1", NOW);

    expect(hoisted.refreshUserToken).toHaveBeenCalledWith("refresh-1");
    expect(result).toEqual({ status: "ok", accessToken: "new-token" });
  });

  it("세 컬럼을 함께 쓴다 — 하나라도 빠지면 다음 요청이 옛 값을 읽는다", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockResolvedValue(refreshed);

    await ensureUserToken(prisma, "u1", NOW);

    const [args] = hoisted.updateMany.mock.calls[0] ?? [];
    expect(args?.data).toEqual({
      access_token: "new-token",
      refresh_token: "refresh-2",
      expires_at: Math.floor(refreshed.expiresAt.getTime() / 1000),
    });
  });

  it("where에 **읽었던 refresh_token**을 넣는다 — 경합에서 진 쪽이 덮어쓰지 않는다", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockResolvedValue(refreshed);

    await ensureUserToken(prisma, "u1", NOW);

    const [args] = hoisted.updateMany.mock.calls[0] ?? [];
    expect(args?.where).toMatchObject({ refresh_token: "refresh-1" });
  });

  it("update 데이터에 userId가 없다 — 경합에서 소유권이 이동하지 않는다", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockResolvedValue(refreshed);

    await ensureUserToken(prisma, "u1", NOW);

    for (const [args] of hoisted.updateMany.mock.calls) {
      expect(Object.keys(args?.data ?? {})).not.toContain("userId");
    }
  });
});

describe("ensureUserToken — 경합에서 졌을 때", () => {
  const expired = () => row({ expires_at: Math.floor(NOW.getTime() / 1000) });

  it("count가 0이면 행을 다시 읽어 이긴 쪽의 토큰을 쓴다", async () => {
    hoisted.findFirst
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(row({ access_token: "winner-token", refresh_token: "refresh-9" }));
    hoisted.refreshUserToken.mockResolvedValue({
      accessToken: "loser-token",
      refreshToken: "refresh-loser",
      expiresAt: at(28800),
    });
    hoisted.updateMany.mockResolvedValue({ count: 0 });

    const result = await ensureUserToken(prisma, "u1", NOW);

    expect(hoisted.findFirst).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: "ok", accessToken: "winner-token" });
  });

  it("재조회한 행도 만료돼 있으면 reauthorize다 — 갱신을 무한히 되풀이하지 않는다", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockResolvedValue({
      accessToken: "x",
      refreshToken: "y",
      expiresAt: at(28800),
    });
    hoisted.updateMany.mockResolvedValue({ count: 0 });

    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({ status: "reauthorize" });
    expect(hoisted.refreshUserToken).toHaveBeenCalledTimes(1);
  });

  it("재조회 중 행이 사라지면 not-connected다 — 해제와 겹친 경우", async () => {
    hoisted.findFirst.mockResolvedValueOnce(expired()).mockResolvedValueOnce(null);
    hoisted.refreshUserToken.mockResolvedValue({
      accessToken: "x",
      refreshToken: "y",
      expiresAt: at(28800),
    });
    hoisted.updateMany.mockResolvedValue({ count: 0 });

    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({ status: "not-connected" });
  });
});

describe("ensureUserToken — 갱신 실패를 거부와 장애로 가른다", () => {
  const expired = () => row({ expires_at: Math.floor(NOW.getTime() / 1000) });

  function httpError(status: number): Error {
    return Object.assign(new Error(`HTTP ${status}`), { status });
  }

  it("refresh가 4xx로 실패하면 reauthorize다 — refresh 만료·인가 철회", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockRejectedValue(httpError(401));
    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({ status: "reauthorize" });
  });

  it("refresh가 5xx로 실패하면 unavailable이다 — 거부가 아니라 장애다", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockRejectedValue(httpError(503));
    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({ status: "unavailable" });
  });

  it("status가 없는 실패(네트워크)도 unavailable이다", async () => {
    hoisted.findFirst.mockResolvedValue(expired());
    hoisted.refreshUserToken.mockRejectedValue(new Error("fetch failed"));
    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({ status: "unavailable" });
  });

  it("실패해도 행을 한 번 다시 읽는다 — 다른 요청이 이미 갱신했을 수 있다", async () => {
    hoisted.findFirst
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(row({ access_token: "winner-token" }));
    hoisted.refreshUserToken.mockRejectedValue(httpError(401));

    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({
      status: "ok",
      accessToken: "winner-token",
    });
  });

  it("DB 조회가 던지면 unavailable이다 — 장애를 not-connected로 접지 않는다", async () => {
    hoisted.findFirst.mockRejectedValue(new Error("connection lost"));
    expect(await ensureUserToken(prisma, "u1", NOW)).toEqual({ status: "unavailable" });
  });

  it("unavailable은 서버 로그를 남긴다 — 접힌 원인을 나중에 볼 수 있어야 한다", async () => {
    // code-review 2026-09-07 🟡2: route.ts만 로그가 있었다. 여기서 접힌 예외는 화면에 "일시적인 오류"로만
    // 보이므로 이 한 줄이 없으면 Prisma 장애와 GitHub 5xx가 구별되지 않는다.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    hoisted.findFirst.mockRejectedValue(new Error("connection lost"));

    await ensureUserToken(prisma, "u1", NOW);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain("connection lost");
    error.mockRestore();
  });
});
