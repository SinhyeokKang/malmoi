import { beforeEach, describe, expect, it, vi } from "vitest";

import { signState } from "@/lib/github-connect/state";

/**
 * **GitHub이 브라우저를 되돌리는 유일한 진입점** (design §3.1·§7.1). Route Handler인 이유는 호출자가
 * 우리 UI가 아니라 GitHub이기 때문이고, 나가는 쪽은 Server Action이다.
 *
 * 이 파일이 지키는 것 셋:
 *
 * 1. **state 검증 전에는 아무것도 하지 않는다** — code 교환도, Account 쓰기도. state가 안 맞는다는 것은
 *    이 요청이 우리가 시작한 흐름이 아니라는 뜻이다(CSRF).
 * 2. **거부 사유가 화면에 닿는다** — `?e=`를 실어 보내고, state를 믿을 수 없으면 `/projects`로 간다
 *    (POSTMORTEM 2026-09-06: 사유를 넘겨놓고 읽는 쪽을 안 만들어 거부가 통째로 무음이었다).
 * 3. **남의 Account 행을 건드리지 않는다** — `taken-by-other`는 토큰조차 갱신하지 않는다 (SAAS §5.5).
 */

const SESSION_USER = "user-1";
const SECRET = "test-secret-0123456789abcdef";
const NOW = new Date("2026-09-06T00:00:00.000Z");

const hoisted = vi.hoisted(() => ({
  auth: vi.fn(),
  exchangeCode: vi.fn(),
  getViewer: vi.fn(),
  cookieGet: vi.fn(),
  account: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  transaction: vi.fn(),
}));

// `requireUser`가 사는 `lib/auth/session.ts`가 `server-only`를 문다 — vitest에서 그 패키지는
// `react-server` 조건 밖이라 던진다. `lib/__tests__/db.test.ts`와 같은 스텁이다.
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: hoisted.auth }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({ account: hoisted.account, $transaction: hoisted.transaction }),
}));
vi.mock("@/lib/github-connect/user", () => ({
  exchangeCode: hoisted.exchangeCode,
  getViewer: hoisted.getViewer,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: hoisted.cookieGet, delete: vi.fn(), set: vi.fn() }),
}));

const { GET } = await import("../github/callback/route");

/** 유효한 state 쿠키 + 그 nonce. 껍데기가 심는 것과 같은 값이다. */
function validState(over: { userId?: string; slug?: string; expiresAt?: Date } = {}) {
  return signState({
    userId: over.userId ?? SESSION_USER,
    slug: over.slug ?? "acme",
    nonce: "nonce-1",
    expiresAt: over.expiresAt ?? new Date(NOW.getTime() + 600_000),
    secret: SECRET,
  });
}

function request(query: Record<string, string>): Request {
  const url = new URL("https://mal-moi.com/api/github/callback");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url);
}

/** 응답의 Location을 경로+쿼리로. 절대·상대 어느 쪽으로 만들어도 같은 모양으로 본다. */
function location(res: Response): string {
  const raw = res.headers.get("location") ?? "";
  const url = new URL(raw, "https://mal-moi.com");
  return url.pathname + url.search;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv23liTEST");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.setSystemTime(NOW);

  hoisted.auth.mockResolvedValue({ user: { id: SESSION_USER } });
  hoisted.cookieGet.mockReturnValue({ value: validState() });
  hoisted.exchangeCode.mockResolvedValue({
    accessToken: "user-token",
    refreshToken: "refresh-1",
    expiresAt: new Date(NOW.getTime() + 28_800_000),
  });
  hoisted.getViewer.mockResolvedValue({ id: "gh-1", login: "octocat" });
  hoisted.account.findUnique.mockResolvedValue(null);
  hoisted.account.findFirst.mockResolvedValue(null);
  hoisted.account.create.mockResolvedValue({});
  hoisted.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    typeof fn === "function" ? fn({ account: hoisted.account }) : undefined,
  );
});

describe("state를 믿을 수 없으면 아무것도 하지 않는다", () => {
  it("쿠키가 없으면 code를 교환하지 않고 /projects로 사유와 함께 돌아간다", async () => {
    hoisted.cookieGet.mockReturnValue(undefined);

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects?e=state-mismatch");
    expect(hoisted.exchangeCode).not.toHaveBeenCalled();
    expect(hoisted.account.create).not.toHaveBeenCalled();
  });

  it("서명이 변조되면 state-mismatch다", async () => {
    const cookie = validState();
    hoisted.cookieGet.mockReturnValue({ value: `${cookie.slice(0, -1)}X` });

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects?e=state-mismatch");
    expect(hoisted.exchangeCode).not.toHaveBeenCalled();
  });

  it("쿼리 nonce가 다르면 state-mismatch다 — CSRF 방어의 본체다", async () => {
    const res = await GET(request({ code: "abc", state: "nonce-attacker" }));

    expect(location(res)).toBe("/projects?e=state-mismatch");
    expect(hoisted.exchangeCode).not.toHaveBeenCalled();
  });

  it("세션이 바뀐 채 돌아오면 wrong-user다 — 계정을 갈아탄 브라우저", async () => {
    hoisted.cookieGet.mockReturnValue({ value: validState({ userId: "user-2" }) });

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects?e=wrong-user");
    expect(hoisted.exchangeCode).not.toHaveBeenCalled();
  });

  it("만료된 state는 state-expired다 — slug를 믿을 수 없으니 /projects로 간다", async () => {
    hoisted.cookieGet.mockReturnValue({
      value: validState({ expiresAt: new Date(NOW.getTime() - 1) }),
    });

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects?e=state-expired");
  });
});

describe("사용자가 GitHub에서 취소한 경우", () => {
  it("state가 유효하면 설정 화면으로 denied를 실어 보낸다", async () => {
    const res = await GET(request({ error: "access_denied", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings?e=denied");
    expect(hoisted.exchangeCode).not.toHaveBeenCalled();
  });

  it("state가 없으면 /projects로 denied를 보낸다 — 돌아갈 slug를 모른다", async () => {
    hoisted.cookieGet.mockReturnValue(undefined);

    const res = await GET(request({ error: "access_denied", state: "nonce-1" }));

    expect(location(res)).toBe("/projects?e=denied");
  });

  it("code가 없는데 error도 없으면 exchange-failed다 — 빈 요청을 성공으로 읽지 않는다", async () => {
    const res = await GET(request({ state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings?e=exchange-failed");
    expect(hoisted.exchangeCode).not.toHaveBeenCalled();
  });
});

describe("정상 연결", () => {
  it("Account를 create하고 설정 화면으로 사유 없이 돌아간다", async () => {
    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings");
    expect(hoisted.account.create).toHaveBeenCalledTimes(1);
  });

  it("행의 userId가 **세션 사용자**이고 provider가 github-app이다", async () => {
    await GET(request({ code: "abc", state: "nonce-1" }));

    const [args] = hoisted.account.create.mock.calls[0] ?? [];
    expect(args?.data).toMatchObject({
      userId: SESSION_USER,
      provider: "github-app",
      providerAccountId: "gh-1",
      access_token: "user-token",
      refresh_token: "refresh-1",
    });
  });

  it("clientSecret을 저장하지 않는다 — OAuthApp의 authentication 객체가 그것을 물고 온다", async () => {
    // `@octokit/oauth-app`의 `createToken`은 `authentication`에 `clientId`·`clientSecret`을 함께 준다.
    // 통째로 넘기면 App 시크릿이 DB에 눕는다 — 껍데기가 필요한 필드만 뽑아야 한다.
    await GET(request({ code: "abc", state: "nonce-1" }));

    const [args] = hoisted.account.create.mock.calls[0] ?? [];
    const serialized = JSON.stringify(args?.data ?? {});
    expect(serialized).not.toContain("client-secret");
    expect(Object.keys(args?.data ?? {})).not.toContain("clientSecret");
  });

  it("state 쿠키를 지운다 — 같은 state로 두 번 들어오지 못하게", async () => {
    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});

describe("이미 연결된 계정", () => {
  it("그 행이 내 것이면 토큰만 갱신하고 create하지 않는다", async () => {
    hoisted.account.findUnique.mockResolvedValue({ userId: SESSION_USER });
    hoisted.account.findFirst.mockResolvedValue({ providerAccountId: "gh-1" });

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings");
    expect(hoisted.account.create).not.toHaveBeenCalled();
    expect(hoisted.account.update).toHaveBeenCalledTimes(1);
  });

  it("갱신 데이터에 userId가 없다 — 소유권을 옮기지 않는다", async () => {
    hoisted.account.findUnique.mockResolvedValue({ userId: SESSION_USER });
    hoisted.account.findFirst.mockResolvedValue({ providerAccountId: "gh-1" });

    await GET(request({ code: "abc", state: "nonce-1" }));

    const [args] = hoisted.account.update.mock.calls[0] ?? [];
    expect(Object.keys(args?.data ?? {})).not.toContain("userId");
  });

  it("남의 것이면 taken-by-other이고 **아무것도 쓰지 않는다** (SAAS §5.5)", async () => {
    hoisted.account.findUnique.mockResolvedValue({ userId: "someone-else" });

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings?e=taken-by-other");
    expect(hoisted.account.create).not.toHaveBeenCalled();
    expect(hoisted.account.update).not.toHaveBeenCalled();
    expect(hoisted.account.delete).not.toHaveBeenCalled();
  });
});

describe("동시 연결 — create가 P2002로 진 경우", () => {
  function uniqueViolation(): Error {
    return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  }

  it("먼저 만든 것이 내 행이면 성공으로 읽는다 — 같은 사람의 중복 클릭이다", async () => {
    hoisted.account.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: SESSION_USER });
    hoisted.account.create.mockRejectedValue(uniqueViolation());

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings");
  });

  it("먼저 만든 것이 남의 행이면 taken-by-other다 — 덮어쓰지 않는다", async () => {
    hoisted.account.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "someone-else" });
    hoisted.account.create.mockRejectedValue(uniqueViolation());

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings?e=taken-by-other");
    expect(hoisted.account.update).not.toHaveBeenCalled();
  });
});

describe("다른 GitHub 계정으로 갈아타기", () => {
  it("내 행이 다른 계정이면 옛 행을 지우고 새로 만든다 — 한 트랜잭션이다", async () => {
    // 새 계정(gh-1)으로 찾으면 없고, 세션 사용자의 기존 행은 다른 계정(gh-old)이다.
    // ⚠️ 조회가 둘로 갈리는 이유: `Account`의 unique가 `[provider, providerAccountId]`뿐이라
    // userId로 찾는 쪽은 `findFirst`여야 한다.
    hoisted.account.findUnique.mockResolvedValue(null);
    hoisted.account.findFirst.mockResolvedValue({ providerAccountId: "gh-old" });

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings");
    expect(hoisted.transaction).toHaveBeenCalledTimes(1);
    expect(hoisted.account.delete).toHaveBeenCalledTimes(1);
    expect(hoisted.account.create).toHaveBeenCalledTimes(1);
  });
});

describe("교환 실패와 장애", () => {
  it("code 재사용·만료는 exchange-failed다 — 라이브러리가 던지는 것을 그대로 쓴다", async () => {
    hoisted.exchangeCode.mockRejectedValue(new Error("bad_verification_code"));

    const res = await GET(request({ code: "used", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings?e=exchange-failed");
    expect(hoisted.account.create).not.toHaveBeenCalled();
  });

  it("DB가 죽으면 unavailable이다 — 거부로 위장하지 않는다", async () => {
    hoisted.account.findUnique.mockRejectedValue(new Error("connection lost"));

    const res = await GET(request({ code: "abc", state: "nonce-1" }));

    expect(location(res)).toBe("/projects/acme/settings?e=unavailable");
  });
});
