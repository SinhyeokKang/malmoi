import { beforeEach, describe, expect, it, vi } from "vitest";

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
  authorizeUrl: () => "https://github.com/login/oauth/authorize?client_id=x",
}));

const { connectRepository, disconnectGithub } = await import(
  "../projects/[slug]/settings/actions"
);

/** 하네스의 기본 프로젝트는 `o/r`이고 설치 id가 `"1"`이다 (`FORMAT`). */
const PROBE_OK = { status: "ok" as const, installationId: "1", fullName: "o/r" };

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

describe("connectRepository — 저장", () => {
  it("정상 OWNER면 update 1회이고 **인가된 projectId**에만 쓴다", async () => {
    const result = await connectRepository({ slug: "acme" });

    expect(result).toEqual({ ok: true });
    expect(db.spies.updateProject).toHaveBeenCalledTimes(1);
    const [args] = db.spies.updateProject.mock.calls[0] ?? [];
    expect(args?.where).toEqual({ id: "p1" });
  });

  it("저장하는 installationId는 **probe가 준 값**이다 — 클라이언트가 보낸 것이 아니다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "ok", installationId: "77", fullName: "o/r" });
    hoisted.listUserInstallations.mockResolvedValue(["77"]);

    await connectRepository({ slug: "acme" });

    const [args] = db.spies.updateProject.mock.calls[0] ?? [];
    expect(args?.data).toMatchObject({ installationId: "77" });
  });

  it("리네임된 리포면 새 owner/name도 함께 저장한다 — 이름이 갱신되는 유일한 경로다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "ok", installationId: "1", fullName: "newco/website" });
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
    hoisted.probeRepo.mockResolvedValue({ status: "ok", installationId: "77", fullName: "o/r" });
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

describe("disconnectGithub", () => {
  it("자기 github-app 행만 지우고 Project는 건드리지 않는다", async () => {
    expect(await disconnectGithub({ slug: "acme" })).toEqual({ ok: true });
    expect(db.accounts.find((a) => a.userId === "u-owner")).toBeUndefined();
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  it("남의 행은 남는다 — 해제는 자기 연결만 끊는다", async () => {
    db = createHarness({
      members: [{ projectId: "p1", userId: "u-owner", role: "OWNER" }],
      users: [{ id: "u-owner", email: "o@a.com" }],
      accounts: [
        { userId: "u-owner", provider: "github-app", providerAccountId: "gh-1" },
        { userId: "u-other", provider: "github-app", providerAccountId: "gh-2" },
      ],
    });
    hoisted.prisma = db.prisma;

    await disconnectGithub({ slug: "acme" });

    expect(db.accounts.map((a) => a.userId)).toEqual(["u-other"]);
  });

  it("로그인용 github 행은 건드리지 않는다 — provider가 다른 별개 인가다", async () => {
    db = createHarness({
      members: [{ projectId: "p1", userId: "u-owner", role: "OWNER" }],
      users: [{ id: "u-owner", email: "o@a.com" }],
      accounts: [
        { userId: "u-owner", provider: "github", providerAccountId: "gh-1" },
        { userId: "u-owner", provider: "github-app", providerAccountId: "gh-1" },
      ],
    });
    hoisted.prisma = db.prisma;

    await disconnectGithub({ slug: "acme" });

    expect(db.accounts.map((a) => a.provider)).toEqual(["github"]);
  });

  it("EDITOR는 forbidden이고 아무 행도 지워지지 않는다", async () => {
    hoisted.session = sessionFor("u-editor");

    expect(await disconnectGithub({ slug: "acme" })).toEqual({ ok: false, error: "forbidden" });
    expect(db.accounts.length).toBe(1);
  });

  it("연결이 없어도 성공으로 읽는다 — 원하는 상태가 이미 이뤄져 있다", async () => {
    db = createHarness({
      members: [{ projectId: "p1", userId: "u-owner", role: "OWNER" }],
      users: [{ id: "u-owner", email: "o@a.com" }],
    });
    hoisted.prisma = db.prisma;

    expect(await disconnectGithub({ slug: "acme" })).toEqual({ ok: true });
  });
});
