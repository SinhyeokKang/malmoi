import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProbeResult } from "@/lib/github-connect/health";

import { createHarness, sessionFor } from "./harness";

/**
 * **설정 화면의 두 Server Action** (design §3.2·§3.4). 화면 자체는 렌더 테스트가 없어 T5가 보고,
 * 여기서는 **저장이 인가된 것만 바꾸는가**를 값으로 고정한다.
 *
 * ⚠️ **거부만 검증하면 "항상 거부하는 Action"도 전부 통과한다** (POSTMORTEM 2026-09-06 — 전면
 * 장애를 100% 리다이렉트로 보고 정상이라 읽었다). 그래서 성공 경로가 인자까지 대조한다.
 *
 * ⚠️ **`installationId`는 클라이언트에서 오지 않는다.** Action이 받는 것은 slug 하나이고, 설치 id는
 * `probeRepo`가 GitHub에 물어 얻는다 — SAAS §5.4가 걱정한 "브라우저가 보낸 값을 그대로 저장"의
 * 표면이 아예 없다.
 *
 * 별도 파일인 이유: GitHub 호출 셋을 mock해야 하는데 `authorization.test.ts`는 그것들을 지나지 않는다
 * (`publish-failure.test.ts:12`와 같은 분리).
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  ensureUserToken: vi.fn(),
  probeRepo: vi.fn(),
  listUserInstallations: vi.fn(),
  listInstallationRepos: vi.fn(),
  authorizeUrl: vi.fn(),
  cookieSet: vi.fn(),
  headerGet: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/github", () => ({ probeRepo: hoisted.probeRepo }));
vi.mock("@/lib/github-connect/token-store", () => ({ ensureUserToken: hoisted.ensureUserToken }));
vi.mock("@/lib/github-connect/user", () => ({
  listUserInstallations: hoisted.listUserInstallations,
  listInstallationRepos: hoisted.listInstallationRepos,
  authorizeUrl: hoisted.authorizeUrl,
}));
// `startGithubConnect`가 쿠키를 심고 외부로 `redirect`한다 — 둘 다 요청 스코프 밖에선 던지므로 기록만 남긴다.
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: hoisted.cookieSet }),
  headers: async () => ({ get: hoisted.headerGet }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    hoisted.redirect(url);
    // Next의 redirect는 던진다 — 아래 코드가 실행되지 않는 성질까지 흉내 낸다.
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

// ⚠️ **`disconnectGithub`는 여기 없다** — 2026-09-07에 **사용자 수준**으로 옮겼고(`projects/actions.ts`,
// 인가는 `requireUser`), 테스트도 그 파일의 mock 범위를 쓰는 `onboarding.test.ts`로 함께 갔다.
const { connectRepository, startGithubConnect } = await import("../projects/[slug]/settings/actions");

/** 하네스의 기본 프로젝트는 `o/r`이고 설치 id가 `"1"`이다 (`FORMAT`). */
// ⚠️ **`satisfies ProbeResult`가 계약을 붙든다.** mock이 `vi.fn()`이라 인자 타입이 `any`이고, 주석이 없으면
// `ProbeResult`에 필수 필드가 늘어도 이 리터럴이 red가 되지 않는다 — T6이 `probe.defaultBranch`를
// `Project.baseBranch`에 넣는 순간 `undefined`를 저장하는 경로가 green으로 통과한다
// (code-review 2026-09-07 🟡3 · 이 리포가 이미 밟은 "타입 검사가 계약을 못 본다").
const PROBE_OK = {
  status: "ok",
  installationId: "1",
  fullName: "o/r",
  defaultBranch: "main",
  repositoryId: "100",
} satisfies ProbeResult;

let db: ReturnType<typeof createHarness>;

beforeEach(() => {
  // 호출 카운터를 리셋한다 — 안 하면 "제출 시점에 한 번 부른다" 같은 횟수 단언이 누적으로 깨진다.
  // `clearAllMocks`는 기록만 지우고 아래 `mockResolvedValue`는 남긴다.
  vi.clearAllMocks();
  db = createHarness({
    members: [
      { projectId: "p1", userId: "u-owner", role: "OWNER" },
      { projectId: "p1", userId: "u-editor", role: "EDITOR" },
    ],
    users: [{ id: "u-owner", email: "o@a.com" }, { id: "u-editor", email: "e@a.com" }],
    accounts: [{ userId: "u-owner", provider: "github-app", providerAccountId: "gh-1" }],
  });
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-owner");
  hoisted.ensureUserToken.mockResolvedValue({ status: "ok", accessToken: "user-token" });
  hoisted.probeRepo.mockResolvedValue(PROBE_OK);
  hoisted.listUserInstallations.mockResolvedValue(["1"]);
  hoisted.listInstallationRepos.mockResolvedValue(["o/r"]);
  hoisted.authorizeUrl.mockReturnValue("https://github.com/login/oauth/authorize?client_id=x");
  hoisted.headerGet.mockImplementation((name: string) =>
    name.toLowerCase() === "host" ? "localhost:3000" : null,
  );
  vi.unstubAllEnvs();
  vi.stubEnv("AUTH_SECRET", "test-secret-0123456789abcdef");
});

describe("connectRepository — 인가", () => {
  it("EDITOR는 forbidden이고 Project가 바뀌지 않는다", async () => {
    hoisted.session = sessionFor("u-editor");

    const result = await connectRepository({ slug: "acme" });

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("멤버가 아니면 not-found다 — 프로젝트 존재를 노출하지 않는다", async () => {
    hoisted.session = sessionFor("u-stranger");

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "not-found" });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("비로그인은 unauthorized다", async () => {
    hoisted.session = null;

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "unauthorized" });
    expect(hoisted.probeRepo).not.toHaveBeenCalled();
  });

  it("인가가 GitHub 조회보다 먼저다 — 거부된 요청이 외부 API를 부르지 않는다", async () => {
    hoisted.session = sessionFor("u-editor");

    await connectRepository({ slug: "acme" });

    expect(hoisted.probeRepo).not.toHaveBeenCalled();
    expect(hoisted.listUserInstallations).not.toHaveBeenCalled();
  });
});

describe("connectRepository — 계정 연결 상태", () => {
  it("GitHub 계정이 없으면 not-connected다", async () => {
    hoisted.ensureUserToken.mockResolvedValue({ status: "not-connected" });

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "not-connected" });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("토큰이 죽었으면 reauthorize를 그대로 전달한다", async () => {
    hoisted.ensureUserToken.mockResolvedValue({ status: "reauthorize" });

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "reauthorize" });
  });

  it("토큰 조회 장애는 unavailable이다 — 거부로 위장하지 않는다", async () => {
    hoisted.ensureUserToken.mockResolvedValue({ status: "unavailable" });

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("connectRepository — 3중 검증 (SAAS §5.4)", () => {
  it("사용자가 볼 수 없는 설치면 installation-forbidden이고 저장하지 않는다", async () => {
    hoisted.listUserInstallations.mockResolvedValue(["999"]);

    expect(await connectRepository({ slug: "acme" })).toEqual({
      ok: false,
      error: "installation-forbidden",
    });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("설치는 보이는데 그 리포를 못 보면 repo-forbidden이고 저장하지 않는다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue(["o/other"]);

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "repo-forbidden" });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("App이 그 리포에 설치돼 있지 않으면 repo-not-installed다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "not-installed" });

    expect(await connectRepository({ slug: "acme" })).toEqual({
      ok: false,
      error: "repo-not-installed",
    });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("probe가 실패하면 unavailable이다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "error" });

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "unavailable" });
  });

  it("목록을 **제출 시점에** 부른다 — 렌더 때 본 것을 믿지 않는다 (SAAS §5.2)", async () => {
    await connectRepository({ slug: "acme" });

    expect(hoisted.listUserInstallations).toHaveBeenCalledTimes(1);
    expect(hoisted.listInstallationRepos).toHaveBeenCalledTimes(1);
  });
});

describe("connectRepository — GitHub 조회 실패를 거부와 장애로 가른다", () => {
  /**
   * ⚠️ **사용자 토큰 GET의 401은 `reauthorize`다** (design §2.4). 사용자가 GitHub 설정에서 App 인가를
   * 철회하면 DB의 토큰은 아직 만료 전이라 `ensureUserToken`이 `ok`를 주고, 그 직후 GET이 401을 뱉는다 —
   * `expires_at`으로는 볼 수 없어 **이 자리가 유일한 신호**다.
   *
   * `unavailable`로 접으면 영구 상태를 "잠시 뒤 다시"로 안내해 **사용자가 같은 버튼을 무한히 누른다** —
   * 필요한 것은 "GitHub 다시 연결"이고 그 버튼은 `reauthorize`일 때만 나온다.
   */
  function httpError(status: number): Error {
    return Object.assign(new Error(`HTTP ${status}`), { status });
  }

  it("설치 목록 조회가 401이면 reauthorize다 — 인가가 철회됐다", async () => {
    hoisted.listUserInstallations.mockRejectedValue(httpError(401));

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "reauthorize" });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("리포 목록 조회가 401이어도 reauthorize다", async () => {
    hoisted.listInstallationRepos.mockRejectedValue(httpError(401));

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "reauthorize" });
  });

  it("5xx는 unavailable이다 — 재시도가 유효한 실패다", async () => {
    hoisted.listUserInstallations.mockRejectedValue(httpError(503));

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "unavailable" });
  });

  it("status가 없는 실패(네트워크)도 unavailable이다", async () => {
    hoisted.listUserInstallations.mockRejectedValue(new Error("fetch failed"));

    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "unavailable" });
  });

  it("unavailable은 서버 로그를 남긴다 — 제보를 받았을 때 재현 말고 길이 있어야 한다", async () => {
    // route.ts만 로그를 남기고 Action은 안 남겼다 (code-review 2026-09-07 🟡2). "일시적인 오류" 제보가
    // GitHub 5xx인지 네트워크인지 Prisma인지 이 한 줄이 가른다.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    hoisted.listUserInstallations.mockRejectedValue(new Error("fetch failed"));

    await connectRepository({ slug: "acme" });

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain("unavailable");
    expect(JSON.stringify(error.mock.calls)).not.toContain("fetch failed");
    error.mockRestore();
  });

  it("probeRepo가 설정 오류로 던지면 unavailable로 접지 않고 그대로 던진다", async () => {
    // GITHUB_APP_ID 누락·PEM 손상은 사용자가 할 수 있는 일이 없다 — "잠시 뒤 다시"로 위장하면 같은
    // 버튼을 무한히 누른다 (code-review 2026-09-07 🟡1, state.ts requireSecret과 같은 판단).
    const { MissingEnvError } = await import("@/lib/failure");
    hoisted.probeRepo.mockRejectedValue(new MissingEnvError("환경변수 GITHUB_APP_ID이(가) 없다."));

    await expect(connectRepository({ slug: "acme" })).rejects.toBeInstanceOf(MissingEnvError);
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });
});

describe("connectRepository — 저장", () => {
  it("조회 뒤 저장소 조건이 바뀌면 예외 대신 재연결을 거부한다", async () => {
    db.spies.updateProject.mockRejectedValueOnce({ code: "P2025" });
    expect(await connectRepository({ slug: "acme" })).toEqual({ ok: false, error: "repo-forbidden" });
  });

  it("정상 OWNER면 update 1회이고 **인가된 projectId**에만 쓴다", async () => {
    const result = await connectRepository({ slug: "acme" });

    expect(result).toEqual({ ok: true });
    expect(db.spies.updateProject).toHaveBeenCalledTimes(1);
    const [args] = db.spies.updateProject.mock.calls[0] ?? [];
    expect(args?.where).toEqual({ id: "p1", repositoryId: null, repoOwner: "o", repoName: "r" });
  });

  it("저장하는 installationId는 **probe가 준 값**이다 — 클라이언트가 보낸 것이 아니다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "ok", installationId: "77", fullName: "o/r", defaultBranch: "main", repositoryId: "100" } satisfies ProbeResult);
    hoisted.listUserInstallations.mockResolvedValue(["77"]);

    await connectRepository({ slug: "acme" });

    const [args] = db.spies.updateProject.mock.calls[0] ?? [];
    expect(args?.data).toMatchObject({ installationId: "77" });
  });

  it("리네임된 리포면 새 owner/name도 함께 저장한다 — 이름이 갱신되는 유일한 경로다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "ok", installationId: "1", fullName: "newco/website", defaultBranch: "main", repositoryId: "100" } satisfies ProbeResult);
    hoisted.listInstallationRepos.mockResolvedValue(["newco/website"]);

    await connectRepository({ slug: "acme" });

    const [args] = db.spies.updateProject.mock.calls[0] ?? [];
    expect(args?.data).toMatchObject({ repoOwner: "newco", repoName: "website" });
  });

  it("다른 프로젝트는 건드리지 않는다", async () => {
    db = createHarness({
      projects: [
        { id: "p1", slug: "acme" },
        { id: "p2", slug: "other" },
      ],
      members: [{ projectId: "p1", userId: "u-owner", role: "OWNER" }],
      users: [{ id: "u-owner", email: "o@a.com" }],
      accounts: [{ userId: "u-owner", provider: "github-app", providerAccountId: "gh-1" }],
    });
    hoisted.prisma = db.prisma;
    hoisted.probeRepo.mockResolvedValue({ status: "ok", installationId: "77", fullName: "o/r", defaultBranch: "main", repositoryId: "100" } satisfies ProbeResult);
    hoisted.listUserInstallations.mockResolvedValue(["77"]);

    await connectRepository({ slug: "acme" });

    const other = db.projects.find((p) => p.id === "p2");
    expect(other?.installationId).toBe("1");
  });

  it("Zod가 빈 slug를 거른다 — 인가 이전이다", async () => {
    expect(await connectRepository({ slug: "" })).toEqual({ ok: false, error: "invalid input" });
    expect(hoisted.probeRepo).not.toHaveBeenCalled();
  });
});

describe("startGithubConnect — 나가는 쪽 (malmoi#7)", () => {
  /**
   * `authorizeUrl`이 mock이라 이 Action은 지금까지 테스트가 없었고, `redirect_uri` 누락(malmoi#7)은 T5의
   * 실물 왕복만 잡았다. 여기서 고정하는 것은 셋 — **callback URL이 요청 origin에서 나온다**, 쿠키 이름·
   * `secure`가 그 판정과 짝이다, 인가 실패면 쿠키를 심지 않는다.
   */
  function cookieCall(): { name: string; options: { secure?: boolean } } {
    const call = hoisted.cookieSet.mock.calls[0];
    if (call === undefined) throw new Error("쿠키를 심지 않았다");
    return { name: call[0] as string, options: call[2] as { secure?: boolean } };
  }

  it("authorizeUrl에 요청 origin의 callback URL을 넘긴다 — 안 넘기면 GitHub이 첫 등록 URL(프로덕션)로 보낸다", async () => {
    await expect(startGithubConnect({ slug: "acme" })).rejects.toThrow(/NEXT_REDIRECT/);

    const [nonce, redirectUrl] = hoisted.authorizeUrl.mock.calls[0] ?? [];
    expect(redirectUrl).toBe("http://localhost:3000/api/github/callback");
    expect(typeof nonce).toBe("string");
    expect(hoisted.redirect).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?client_id=x");
  });

  it("http면 접두 없는 쿠키 + secure false — Safari가 localhost에서 Secure 쿠키를 버린다", async () => {
    await expect(startGithubConnect({ slug: "acme" })).rejects.toThrow(/NEXT_REDIRECT/);

    const { name, options } = cookieCall();
    expect(name).toBe("malmoi-gh-state");
    expect(options.secure).toBe(false);
  });

  it("x-forwarded-proto가 https면 __Host- 쿠키 + secure + https callback — 셋이 한 판정에서 나온다", async () => {
    hoisted.headerGet.mockImplementation((name: string) => {
      const key = name.toLowerCase();
      if (key === "host") return "mal-moi.com";
      if (key === "x-forwarded-proto") return "https";
      return null;
    });

    await expect(startGithubConnect({ slug: "acme" })).rejects.toThrow(/NEXT_REDIRECT/);

    const { name, options } = cookieCall();
    expect(name).toBe("__Host-malmoi-gh-state");
    expect(options.secure).toBe(true);
    expect(hoisted.authorizeUrl.mock.calls[0]?.[1]).toBe("https://mal-moi.com/api/github/callback");
  });

  it("EDITOR는 forbidden이고 쿠키도 redirect도 없다", async () => {
    hoisted.session = sessionFor("u-editor");

    expect(await startGithubConnect({ slug: "acme" })).toEqual({ ok: false, error: "forbidden" });
    expect(hoisted.cookieSet).not.toHaveBeenCalled();
    expect(hoisted.redirect).not.toHaveBeenCalled();
  });

  it("Host 헤더가 없으면 unavailable — 추측한 origin으로 사용자를 보내지 않는다", async () => {
    hoisted.headerGet.mockReturnValue(null);

    expect(await startGithubConnect({ slug: "acme" })).toEqual({ ok: false, error: "unavailable" });
    expect(hoisted.cookieSet).not.toHaveBeenCalled();
  });
});
