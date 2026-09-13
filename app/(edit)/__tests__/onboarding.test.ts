import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProbeResult } from "@/lib/github-connect/health";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { signSampleConfirmation } from "@/lib/onboarding/sample-confirmation";
import { renderWorkflowYaml } from "@/lib/onboarding/workflow";
import { hashPushToken } from "@/lib/push/token";

import { createHarness, sessionFor } from "./harness";

/**
 * **온보딩 Server Action 다섯** (design §3.6·§3.11 · tasks T6). 화면은 T7이고, 여기서 고정하는 것은
 * **인가·3중 검증·재검증·트랜잭션 경계**가 값으로 지켜지는가다.
 *
 * ⚠️ **별도 파일이다.** `github-connect.test.ts`·`publish-failure.test.ts`와 같은 이유로 mock 범위가
 * 다르다 — 여기는 `@/lib/onboarding/ingest`와 리포 리더를 가짜로 세우고, `authorization.test.ts`는
 * 그 경로를 아예 지나지 않는다.
 *
 * ⚠️ **거부만 검증하면 "항상 거부하는 Action"도 전부 통과한다** (POSTMORTEM 2026-09-06). 그래서 성공
 * 경로가 **저장된 값까지** 대조한다 — 특히 "저장하는 것은 `detectFormatWith`의 반환값"(§3.4의 5).
 *
 * ⚠️ **두 자격증명이 만나는 자리가 이 파일의 대상이다.** `lib/onboarding/`은 `@/lib/github`을 모르고
 * (`credential-separation.test.ts`), Action 하나가 App 토큰(리더)과 사용자 토큰(목록)을 함께 든다.
 */

const OWNER = "u-owner";
const EDITOR = "u-editor";

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  ensureUserToken: vi.fn(),
  probeRepo: vi.fn(),
  openRepoReader: vi.fn(),
  listBranches: vi.fn(),
  createGitClient: vi.fn(),
  listUserInstallations: vi.fn(),
  listInstallationRepos: vi.fn(),
  authorizeUrl: vi.fn(),
  ingestFirstSnapshot: vi.fn(),
  triggerPull: vi.fn(),
  revalidatePath: vi.fn(),
  cookieSet: vi.fn(),
  headerGet: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock("@/lib/github", () => ({
  probeRepo: hoisted.probeRepo,
  openRepoReader: hoisted.openRepoReader,
  listBranches: hoisted.listBranches,
  // `app/(edit)/actions.ts` → `lib/pull/trigger` 체인이 이 이름을 가져온다. 빠지면 import가 던진다.
  createGitClient: hoisted.createGitClient,
}));
vi.mock("@/lib/github-connect/token-store", () => ({ ensureUserToken: hoisted.ensureUserToken }));
vi.mock("@/lib/github-connect/user", () => ({
  listUserInstallations: hoisted.listUserInstallations,
  listInstallationRepos: hoisted.listInstallationRepos,
  authorizeUrl: hoisted.authorizeUrl,
}));
vi.mock("@/lib/onboarding/ingest", () => ({ ingestFirstSnapshot: hoisted.ingestFirstSnapshot }));
// ⚠️ **부분 mock이다.** 통째로 가리면 `isRefSafeSlug`가 사라지고 `planSlug`가 그것을 부른다 —
// slug 형식 규칙이 pull과 **같은 함수**여야 한다는 것이 T1의 판정이었다 (design §5).
vi.mock("@/lib/pull/trigger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pull/trigger")>()),
  triggerPull: hoisted.triggerPull,
}));
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

const {
  createProject,
  detectRepoFormats,
  listRepoBranches,
  loadCandidateSample,
  confirmManualFormat,
  disconnectGithub,
  listConnectableRepos,
  rotatePushToken,
  runFirstIngest,
  startGithubConnectForUser,
} = await import("../projects/actions");
const { saveTranslation, triggerPullAction } = await import("../actions");

/** 탐지가 후보를 내는 최소 리포 — `i18n/{locale}.json` 3로케일. */
const TREE = [
  { path: "README.md", sha: "sha-readme", size: 100 },
  { path: "i18n/en.json", sha: "sha-en", size: 100 },
  { path: "i18n/ko.json", sha: "sha-ko", size: 100 },
  { path: "i18n/fr.json", sha: "sha-fr", size: 100 },
];
const CATALOG = `${JSON.stringify({ "a.greet": "Hello", "a.bye": "Bye" }, null, 2)}\n`;

/** `probeTargets`가 고르는 셋 — en 우선 → 코드포인트 순. ②의 미리보기가 처음 드는 언어와 같다. */
const SAMPLED_LOCALES = ["en", "fr", "ko"];

/** `listInstallationRepos`가 주는 행. `pushed_at`은 같은 응답에 이미 있다 — 추가 호출 0. */
const repoRow = (fullName: string, pushedAt = "2026-09-01T00:00:00Z") => ({ fullName, pushedAt });

const HEAD_SHA = "c0ffee";
const HEAD_AT = "2026-09-07T00:00:00Z";

/**
 * ⚠️ **`satisfies ProbeResult`가 계약을 붙든다.** mock이 `vi.fn()`이라 인자 타입이 `any`이고, 이 단언이
 * 없으면 `ProbeResult`에 필수 필드가 늘어도 리터럴이 red가 되지 않는다 (github-connect.test.ts와 같은 판단).
 */
const PROBE_OK = {
  status: "ok",
  installationId: "77",
  repositoryId: "1035512",
  fullName: "acme/web",
  defaultBranch: "develop",
} satisfies ProbeResult;

/** 리더 가짜 — App 토큰 경로. 트리 항목의 `sha`로 blob을 준다 (contents API가 아니다). */
function reader(over: { snapshot?: unknown; blobs?: Map<string, string> } = {}) {
  const blobs = over.blobs ?? new Map(TREE.map((f) => [f.sha, CATALOG]));
  return {
    snapshot: vi.fn(async () => over.snapshot ?? { status: "ok", headSha: HEAD_SHA, headCommittedAt: HEAD_AT, files: TREE }),
    blob: vi.fn(async (sha: string) => blobs.get(sha)),
  };
}

/** 확정 입력 — 화면이 후보에서 되돌려 보내는 값과 같은 모양이다. */
function createInput(over: Record<string, unknown> = {}) {
  return {
    owner: "acme",
    repo: "web",
    adapter: "json-catalog",
    pathTemplate: "i18n/{locale}.json",
    baseLocale: "en",
    slug: "acme-web",
    name: "Acme Web",
    baseBranch: "develop",
    ...over,
  };
}

let db: ReturnType<typeof createHarness>;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.session = sessionFor(OWNER);
  db = createHarness({
    projects: [{ id: "p1", slug: "acme", name: "Acme" }],
    members: [
      { projectId: "p1", userId: OWNER, role: "OWNER" },
      { projectId: "p1", userId: EDITOR, role: "EDITOR" },
    ],
    users: [{ id: OWNER, email: "o@a.com" }, { id: EDITOR, email: "e@a.com" }],
    accounts: [{ userId: OWNER, provider: "github-app", providerAccountId: "gh-1" }],
  });
  hoisted.prisma = db.prisma;

  hoisted.ensureUserToken.mockResolvedValue({ status: "ok", accessToken: "user-token" });
  hoisted.probeRepo.mockResolvedValue(PROBE_OK);
  hoisted.listUserInstallations.mockResolvedValue(["77"]);
  hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/web")]);
  hoisted.openRepoReader.mockImplementation(async () => reader());
  hoisted.authorizeUrl.mockReturnValue("https://github.com/login/oauth/authorize?client_id=x");
  hoisted.headerGet.mockImplementation((name: string) =>
    name.toLowerCase() === "host" ? "localhost:3000" : null,
  );
  hoisted.listBranches.mockResolvedValue({ status: "ok", names: ["main", "develop"], truncated: false });
  hoisted.ingestFirstSnapshot.mockResolvedValue({ count: 2, failed: 0, errors: [] });
  vi.stubEnv("AUTH_SECRET", "test-secret-0123456789abcdef");
});

describe("비로그인은 어느 Action도 지나지 못한다", () => {
  /**
   * 프로젝트가 없는 다섯은 `requireUser`라 `/`로 redirect하고(design §3.6 — 중간 상태 무저장이라
   * "처음부터"가 맞는 안내다), 프로젝트가 있는 둘은 값으로 거부한다.
   */
  beforeEach(() => {
    hoisted.session = sessionFor(null);
  });

  it("연결·목록·해제는 redirect하고 모달의 탐지·생성은 값으로 거부한다", async () => {
    await expect(startGithubConnectForUser("new")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(listConnectableRepos()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({ ok: false, error: "unauthorized" });
    expect(await createProject(createInput())).toEqual({ ok: false, error: "unauthorized" });
    // 2026-09-07에 다섯이 됐다 — 해제가 설정 화면에서 사용자 수준으로 옮겨왔다 (리뷰 🟡9).
    await expect(disconnectGithub()).rejects.toThrow(/NEXT_REDIRECT/);
    // 8-1a: 로그인 화면이 `/signin`으로 갈렸다 — 루트는 랜딩 자리의 껍데기다.
    expect(hoisted.redirect).toHaveBeenCalledWith("/signin");
  });

  it("GitHub을 한 번도 부르지 않는다 — 거부될 요청이 레이트 리밋을 태우지 않는다", async () => {
    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({ ok: false, error: "unauthorized" });
    expect(hoisted.probeRepo).not.toHaveBeenCalled();
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("프로젝트 수준 Action 둘은 값으로 거부한다", async () => {
    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "unauthorized" });
    expect(await rotatePushToken({ slug: "acme" })).toEqual({ ok: false, error: "unauthorized" });
  });
});

describe("startGithubConnectForUser — 프로젝트 없이 연결이 성립한다 (design §3.6)", () => {
  /** 심어진 쿠키의 서명 payload. 착지 갈래가 **쿠키 안에** 있다는 것이 이 함수의 요지다. */
  function signedDest(): unknown {
    const value = hoisted.cookieSet.mock.calls[0]?.[1] as string;
    const payload = value.slice(0, value.lastIndexOf("."));
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  }

  it("멤버십을 요구하지 않는다 — Account 행은 사용자 소유다", async () => {
    hoisted.session = sessionFor("u-nobody");

    await expect(startGithubConnectForUser("new")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(hoisted.cookieSet).toHaveBeenCalledTimes(1);
    expect(hoisted.redirect).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?client_id=x");
  });

  it("서명된 state의 dest가 `{kind:\"new\"}`다 — 착지가 쿼리에 없다", async () => {
    await expect(startGithubConnectForUser("new")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(signedDest()).toMatchObject({ userId: OWNER, dest: { kind: "new" } });
  });

  /**
   * ⚠️ **착지가 인자로 갈린다** (6b-4). 전에는 무인자라 `/projects/new` 하나였고, `/account`가 생기면서
   * **같은 Action이 두 착지를 낸다** — 계정 화면에서 연결을 누른 사람이 생성 화면에 떨어지면
   * "내가 뭘 만들려고 한 게 아닌데"가 된다.
   */
  it("계정 화면에서 시작하면 dest가 `{kind:\"account\"}`다 — 같은 Action이 두 착지를 낸다", async () => {
    await expect(startGithubConnectForUser("account")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(signedDest()).toMatchObject({ userId: OWNER, dest: { kind: "account" } });
  });

  /**
   * ⚠️ **착지는 서명 안에 있고 인자는 갈래 이름뿐이다.** 클라이언트가 `{kind:"settings", slug}`를
   * 통째로 보낼 수 있으면 남의 프로젝트 설정 화면으로 착지를 정할 수 있고, 그러면 이 자리에
   * open redirect 판정이 생긴다 (design §3.1).
   */
  it("모르는 갈래는 값으로 거부하고 쿠키를 심지 않는다 — 클라이언트가 착지를 고르지 못한다", async () => {
    expect(await startGithubConnectForUser("settings" as never)).toEqual({
      ok: false,
      error: "invalid input",
    });
    expect(hoisted.cookieSet).not.toHaveBeenCalled();
    expect(hoisted.redirect).not.toHaveBeenCalled();
  });

  it("callback URL이 요청 origin에서 나온다 — 안 넘기면 GitHub이 프로덕션으로 되돌린다 (malmoi#7)", async () => {
    await expect(startGithubConnectForUser("new")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(hoisted.authorizeUrl.mock.calls[0]?.[1]).toBe("http://localhost:3000/api/github/callback");
  });

  it("Host 헤더가 없으면 unavailable — 추측한 origin으로 사용자를 보내지 않는다", async () => {
    hoisted.headerGet.mockReturnValue(null);

    expect(await startGithubConnectForUser("new")).toEqual({ ok: false, error: "unavailable" });
    expect(hoisted.cookieSet).not.toHaveBeenCalled();
  });
});

describe("listConnectableRepos — 빈 상태 둘을 가른다", () => {
  it("설치와 리포를 전 페이지로 읽어 owner/repo로 준다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/web"), repoRow("acme/ext")]);

    expect(await listConnectableRepos()).toEqual({
      ok: true,
      repos: [
        { owner: "acme", repo: "ext", fullName: "acme/ext", pushedAt: "2026-09-01T00:00:00Z" },
        { owner: "acme", repo: "web", fullName: "acme/web", pushedAt: "2026-09-01T00:00:00Z" },
      ],
    });
  });

  it("`pushedAt`을 함께 실어 준다 — 같은 응답에 이미 있어 추가 호출이 0이다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/web", "2026-08-30T10:00:00Z")]);

    const result = await listConnectableRepos();

    expect(result.ok && result.repos[0]?.pushedAt).toBe("2026-08-30T10:00:00Z");
    expect(hoisted.listInstallationRepos).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ **객체가 되면 기본 `.sort()`가 조용히 죽는다.** 전에는 `[...new Set(names)].sort()`였는데 원소가
   * 객체가 되면 전부 `"[object Object]"`로 비교돼 **정렬이 사라진다** — `tsc`가 못 보는 부류라 이 단언이
   * 유일한 방어선이다.
   */
  it("같은 리포가 두 설치에 있어도 한 번만 나오고, 이름순으로 정렬돼 있다", async () => {
    hoisted.listUserInstallations.mockResolvedValue(["77", "88"]);
    hoisted.listInstallationRepos.mockImplementation(async (_token: string, id: string) =>
      id === "77" ? [repoRow("acme/web"), repoRow("acme/zeta")] : [repoRow("acme/web"), repoRow("acme/alpha")],
    );

    const result = await listConnectableRepos();

    expect(result.ok && result.repos.map((r) => r.fullName)).toEqual(["acme/alpha", "acme/web", "acme/zeta"]);
  });

  /**
   * **인가가 App 자격증명보다 앞이다** (sec-audit 발견 5).
   *
   * 전에는 `probeRepo`(App JWT → 설치 토큰 → repo GET)가 사용자 설치 목록보다 **먼저** 돌았고,
   * `RepoInput`은 `z.string().min(1)` 둘뿐이었다. 로그인은 검증 이메일만 요구하므로(ARCHITECTURE §6.00 —
   * 의도된 성질) **낯선 사람이 임의 private 리포에 대해 "말모이 App이 설치돼 있는가"를 물을 수
   * 있었고**, 반환 갈래가 `repo-not-installed`(없다)와 `installation-forbidden`(있는데 너는 못
   * 본다)로 갈려 그대로 화면 문구가 됐다 — **존재 오라클**이다.
   *
   * 부수로 호출당 App 호출 셋이 상한 없이 돌아 **전 테넌트가 공유하는 App quota**를 태운다.
   *
   * ⚠️ **`planRepoConnect`의 3중 검증은 그대로다** — 순서만 바꾼다.
   */
  it("내 설치에 없는 리포면 App 자격증명을 한 번도 안 쓴다 (sec-audit 5)", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/other")]);

    const result = await detectRepoFormats({ owner: "someone", repo: "private-thing" });
    expect(result.ok).toBe(false);
    expect(hoisted.probeRepo).not.toHaveBeenCalled();
  });

  it("내 설치에 있으면 그때 probe한다 — 순서만 바뀌고 성공 경로는 같다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/web")]);

    const result = await detectRepoFormats({ owner: "acme", repo: "web" });
    expect(result.ok).toBe(true);
    expect(hoisted.probeRepo).toHaveBeenCalledTimes(1);
  });

  it("설치가 0개면 no-installations이고 리포 목록을 부르지 않는다", async () => {
    hoisted.listUserInstallations.mockResolvedValue([]);

    expect(await listConnectableRepos()).toEqual({ ok: false, error: "no-installations" });
    expect(hoisted.listInstallationRepos).not.toHaveBeenCalled();
  });

  it("설치는 있는데 선택된 리포가 없으면 no-repos다 — 설치 0개와 안내가 다르다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([]);

    expect(await listConnectableRepos()).toEqual({ ok: false, error: "no-repos" });
  });

  it("토큰이 없거나 만료면 그 사유가 그대로 나간다 — 장애로 위장하지 않는다", async () => {
    hoisted.ensureUserToken.mockResolvedValue({ status: "not-connected" });

    expect(await listConnectableRepos()).toEqual({ ok: false, error: "not-connected" });
    expect(hoisted.listUserInstallations).not.toHaveBeenCalled();
  });

  it("401은 reauthorize다 — 영구 상태를 \"잠시 뒤 다시\"로 안내하지 않는다", async () => {
    hoisted.listUserInstallations.mockRejectedValue(Object.assign(new Error("bad"), { status: 401 }));

    expect(await listConnectableRepos()).toEqual({ ok: false, error: "reauthorize" });
  });

  it("나머지 실패는 unavailable이다", async () => {
    hoisted.listUserInstallations.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));

    expect(await listConnectableRepos()).toEqual({ ok: false, error: "unavailable" });
  });

  /**
   * ⚠️ **설치 하나의 실패가 나머지를 막지 않는다** (code-review 2026-09-07 🟡2). 일시중지된 설치는
   * 403을 주고 그건 **영구 상태**다(`health.ts`가 `not-installed`로 분류하는 것과 같은 축) — 전체를
   * `unavailable`로 접으면 정상 설치의 리포도 못 고르고, 화면은 "잠시 뒤 다시"를 말해 사용자가 같은
   * 버튼을 무한히 누른다. `/api/pull`의 프로젝트별 try/catch와 같은 판단이다 (design §3.9).
   */
  it("설치 하나가 실패해도 나머지 설치의 리포는 보인다", async () => {
    hoisted.listUserInstallations.mockResolvedValue(["77", "88"]);
    hoisted.listInstallationRepos.mockImplementation(async (_token: string, id: string) => {
      if (id === "88") throw Object.assign(new Error("suspended"), { status: 403 });
      return [repoRow("acme/web")];
    });

    expect(await listConnectableRepos()).toEqual({
      ok: true,
      repos: [{ owner: "acme", repo: "web", fullName: "acme/web", pushedAt: "2026-09-01T00:00:00Z" }],
    });
  });

  it("설치가 전부 실패하면 unavailable이다 — 빈 목록을 \"리포가 없다\"로 말하지 않는다", async () => {
    hoisted.listUserInstallations.mockResolvedValue(["77", "88"]);
    hoisted.listInstallationRepos.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));

    expect(await listConnectableRepos()).toEqual({ ok: false, error: "unavailable" });
  });

  it("전부 실패했는데 하나가 401이면 reauthorize다 — 재인가 신호가 장애에 묻히지 않는다", async () => {
    hoisted.listUserInstallations.mockResolvedValue(["77", "88"]);
    hoisted.listInstallationRepos.mockImplementation(async (_token: string, id: string) => {
      throw Object.assign(new Error("nope"), { status: id === "88" ? 401 : 500 });
    });

    expect(await listConnectableRepos()).toEqual({ ok: false, error: "reauthorize" });
  });
});

describe("detectRepoFormats — 3중 검증을 지난 뒤 2패스로 탐지한다", () => {
  it("후보를 사용자 언어로 요약해 준다 — 키 수는 base 파일을 실제로 읽은 값이다", async () => {
    const result = await detectRepoFormats({ owner: "acme", repo: "web" });

    expect(result).toEqual({
      ok: true,
      candidates: [
        {
          adapter: "json-catalog",
          confirmation: expect.any(String),
          label: "JSON catalog",
          pathTemplate: "i18n/{locale}.json",
          locales: ["en", "fr", "ko"],
          baseLocale: "en",
          keys: { status: "counted", count: 2 },
          // ②의 미리보기 — `probeTargets`가 이미 받아 둔 blob만 쓴다 (추가 다운로드 0).
          samples: SAMPLED_LOCALES.map((locale) => ({
            locale,
            rows: [
              { key: "a.bye", value: "Bye" },
              { key: "a.greet", value: "Hello" },
            ],
            total: 2,
          })),
        },
      ],
    });
  });

  it("샘플은 `sampleOrder`가 고른 로케일만 든다 — 내려받지 않은 파일을 미리보기가 요구하지 않는다", async () => {
    const result = await detectRepoFormats({ owner: "acme", repo: "web" });
    const locales = result.ok ? result.candidates[0]?.samples.map((s) => s.locale) : undefined;

    expect(locales).toEqual(SAMPLED_LOCALES);
  });

  it("`ref`를 주면 그 브랜치의 트리를 읽는다 — ①의 브랜치 선택이 ②의 후보를 바꾼다", async () => {
    await detectRepoFormats({ owner: "acme", repo: "web", ref: "release/2.0" });

    const created = await hoisted.openRepoReader.mock.results[0]?.value;
    expect(created.snapshot).toHaveBeenCalledWith("release/2.0");
  });

  it("형식이 깨진 `ref`는 GitHub에 안 나간다 — 잎 함수라 비용이 0이다", async () => {
    expect(await detectRepoFormats({ owner: "acme", repo: "web", ref: "bad ref" })).toEqual({
      ok: false,
      error: "invalid input",
    });
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("리더는 probe가 준 설치·이름과 프로젝트의 default branch로 연다", async () => {
    await detectRepoFormats({ owner: "acme", repo: "web" });

    expect(hoisted.openRepoReader).toHaveBeenCalledWith("acme", "web", "77");
    const created = await hoisted.openRepoReader.mock.results[0]?.value;
    expect(created.snapshot).toHaveBeenCalledWith("develop");
  });

  it("내려받는 파일은 sampleOrder와 같은 셋이다 — 다른 3개를 받으면 후보가 미검증으로 탈락한다", async () => {
    await detectRepoFormats({ owner: "acme", repo: "web" });

    const created = await hoisted.openRepoReader.mock.results[0]?.value;
    expect(created.blob.mock.calls.map((c: string[]) => c[0]).sort()).toEqual(
      ["sha-en", "sha-fr", "sha-ko"],
    );
  });

  it("후보가 0개면 no-candidates다 — 수동 지정이 유일한 길이라 화면이 그것을 펼친다", async () => {
    hoisted.openRepoReader.mockImplementation(async () =>
      reader({ snapshot: { status: "ok", headSha: HEAD_SHA, headCommittedAt: HEAD_AT, files: [{ path: "README.md", sha: "s", size: 100 }] } }),
    );

    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({
      ok: false,
      error: "no-candidates",
    });
  });

  it("트리가 잘리면 tree-truncated다 — 부분 트리로 \"로케일 파일이 없다\"고 말하지 않는다", async () => {
    hoisted.openRepoReader.mockImplementation(async () => reader({ snapshot: { status: "truncated" } }));

    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({
      ok: false,
      error: "tree-truncated",
    });
  });

  it("base 브랜치를 못 읽으면 base-branch-missing이다", async () => {
    hoisted.openRepoReader.mockImplementation(async () =>
      reader({ snapshot: { status: "base-branch-missing" } }),
    );

    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({
      ok: false,
      error: "base-branch-missing",
    });
  });

  it("3중 검증 거부 셋이 각자 나온다 — 그 리포를 읽지도 않는다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "not-installed" });
    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({
      ok: false,
      error: "repo-not-installed",
    });

    hoisted.probeRepo.mockResolvedValue(PROBE_OK);
    hoisted.listUserInstallations.mockResolvedValue(["other"]);
    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({
      ok: false,
      error: "installation-forbidden",
    });

    /**
     * ⚠️ **셋째 갈래가 `repo-not-installed`로 접힌다** (2026-09-09, sec-audit 발견 5). 내 설치 목록에
     * 그 리포가 없으면 **probe를 아예 안 부르므로** "우리 App이 없다"와 "네가 못 본다"를 구별할
     * 수단이 없고, **구별해 주는 것이 곧 존재 오라클이었다.** `repo-forbidden`은 설정 화면의
     * 재연결 경로에 그대로 살아 있다 — 거기서는 리포가 `Project` 행에 고정이라 오라클이 아니다.
     */
    hoisted.listUserInstallations.mockResolvedValue(["77"]);
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("someone/else")]);
    hoisted.probeRepo.mockClear();
    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({
      ok: false,
      error: "repo-not-installed",
    });
    expect(hoisted.probeRepo).not.toHaveBeenCalled();

    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("probe 장애는 unavailable로 그대로 나간다 — 거부로 접으면 있는 권한을 없다고 믿는다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "error" });

    expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});

describe("listRepoBranches — ①의 브랜치 목록 (design §3.2)", () => {
  it("목록과 default branch를 함께 준다 — `defaultBranch`는 이미 손에 있으므로 GitHub을 한 번 더 부르지 않는다", async () => {
    expect(await listRepoBranches({ owner: "acme", repo: "web" })).toEqual({
      ok: true,
      names: ["main", "develop"],
      defaultBranch: "develop",
      truncated: false,
    });
    expect(hoisted.listBranches).toHaveBeenCalledTimes(1);
  });

  it("`checkRepoAccess`를 그대로 지난다 — 내 설치에 없으면 브랜치를 읽지도 않는다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/other")]);

    const result = await listRepoBranches({ owner: "someone", repo: "private-thing" });

    expect(result).toEqual({ ok: false, error: "repo-not-installed" });
    expect(hoisted.listBranches).not.toHaveBeenCalled();
    expect(hoisted.probeRepo).not.toHaveBeenCalled();
  });

  it("조회 실패는 값이다 — `unavailable`이고 ①을 막지 않는다 (예외 D)", async () => {
    hoisted.listBranches.mockResolvedValue({ status: "unavailable" });

    expect(await listRepoBranches({ owner: "acme", repo: "web" })).toEqual({ ok: false, error: "unavailable", defaultBranch: "develop" });
  });

  it("300개에서 끊겼으면 `truncated`를 그대로 나른다 — 화면이 자유 입력으로 바꾼다", async () => {
    hoisted.listBranches.mockResolvedValue({ status: "ok", names: ["main"], truncated: true });

    expect(await listRepoBranches({ owner: "acme", repo: "web" })).toMatchObject({ ok: true, truncated: true });
  });
});

/**
 * ②의 언어 전환 (design §3.4).
 *
 * ⚠️ **불변식 10이 걸리는 자리다** — 클라이언트가 보낸 `pathTemplate`·`locale`·`ref` 셋으로 리포를 읽는
 * **새 경로**다. 방어 셋은 새로 만들지 않고 ARCHITECTURE §3.1이 그 값 쌍에 **지정한** 함수를 부른다:
 * `planConfirmedFormat` · `isPathSafeLocale` · `isValidBranchName`. `templatePaths`로 대신하면 탐지용
 * 판정을 적재 방어로 재사용하는 것이고, 그게 POSTMORTEM 2026-09-09의 모양이다.
 */
describe("loadCandidateSample — ②의 언어 샘플", () => {
  const input = {
    owner: "acme",
    repo: "web",
    ref: "develop",
    adapter: "json-catalog",
    pathTemplate: "i18n/{locale}.json",
    locale: "ko",
    confirmation: sampleProof(),
  };

  it("그 로케일의 앞 N행과 전체 수를 준다", async () => {
    expect(await loadCandidateSample(input)).toEqual({
      ok: true,
      rows: [
        { key: "a.bye", value: "Bye" },
        { key: "a.greet", value: "Hello" },
      ],
      total: 2,
    });
  });

  it("고른 브랜치의 트리에서 읽는다 — ①의 선택이 여기까지 따라온다", async () => {
    await loadCandidateSample({ ...input, ref: "release/2.0", confirmation: sampleProof({ ref: "release/2.0" }) });

    const created = await hoisted.openRepoReader.mock.results[0]?.value;
    expect(created.snapshot).toHaveBeenCalledWith("release/2.0");
  });

  it("인가 거부는 리포를 열지도 않는다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/other")]);

    expect(await loadCandidateSample({ ...input, owner: "someone", repo: "private-thing" })).toEqual({
      ok: false,
      error: "repo-not-installed",
    });
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("조작된 `pathTemplate`은 `planConfirmedFormat`이 거부하고 blob을 한 개도 안 읽는다", async () => {
    const result = await loadCandidateSample({ ...input, pathTemplate: "docs/{locale}.json" });

    expect(result.ok).toBe(false);
    const created = await hoisted.openRepoReader.mock.results[0]?.value;
    expect(created.blob).not.toHaveBeenCalled();
  });

  it("`locale`에 `../`가 들어가면 `isPathSafeLocale`이 막고 GitHub을 안 부른다", async () => {
    expect(await loadCandidateSample({ ...input, locale: "../../etc" })).toEqual({
      ok: false,
      error: "invalid input",
    });
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("형식이 깨진 `ref`는 GitHub에 나가지 않는다 — 잎 함수라 비용이 0이다", async () => {
    expect(await loadCandidateSample({ ...input, ref: "bad ref" })).toEqual({
      ok: false,
      error: "invalid input",
    });
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("못 읽은 파일은 실패다 — 빈 결과로 위장하지 않는다 (빈 언어와 화면에서 갈린다)", async () => {
    hoisted.openRepoReader.mockImplementation(async () => reader({ blobs: new Map() }));

    expect((await loadCandidateSample(input)).ok).toBe(false);
  });
});

describe("createProject — 재검증한 값만 저장한다 (design §3.4)", () => {
  it("행·OWNER 멤버십·토큰 해시가 한 번에 생기고 원문이 반환된다", async () => {
    const result = await createProject(createInput());
    // `baseBranch`는 결과 화면의 워크플로 YAML이 `on.push.branches`에 박는 값이다 (T7).
    expect(result).toMatchObject({ ok: true, slug: "acme-web", baseBranch: "develop" });

    const token = (result as { pushToken: string }).pushToken;
    expect(token.length).toBeGreaterThan(20);

    const row = db.projects.find((p) => p.slug === "acme-web");
    expect(row).toBeDefined();
    // 원문은 DB 어디에도 없다 — 해시로만 조회된다 (PRODUCT §7.8).
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row?.pushTokenHash).toBe(hashPushToken(token));
    expect(db.members).toEqual(expect.arrayContaining([expect.objectContaining({ projectId: row?.id, userId: OWNER, role: "OWNER" })]));
  });

  it("저장된 포맷이 `detectFormatWith`의 반환값이다 — 클라이언트 입력이 아니다", async () => {
    await createProject(createInput());

    expect(db.projects.find((p) => p.slug === "acme-web")).toMatchObject({
      adapterName: "json-catalog",
      pathTemplate: "i18n/{locale}.json",
      baseLocale: "en",
    });
  });

  it("사용자가 고른 브랜치를 저장한다 — ①에서 정한 값이 여기까지 온다", async () => {
    await createProject(createInput({ baseBranch: "release/2.0" }));

    expect(db.projects.find((p) => p.slug === "acme-web")).toMatchObject({
      baseBranch: "release/2.0",
      repoOwner: "acme",
      repoName: "web",
      installationId: "77",
    });
  });

  it("고른 브랜치의 트리를 읽는다 — 다른 ref로 탐지해 놓고 저장만 바꾸지 않는다", async () => {
    await createProject(createInput({ baseBranch: "release/2.0" }));

    const created = await hoisted.openRepoReader.mock.results[0]?.value;
    expect(created.snapshot).toHaveBeenCalledWith("release/2.0");
  });

  it("`/`가 든 브랜치가 저장·조회·YAML 셋을 다 지난다 (POSTMORTEM 2026-09-01)", async () => {
    const result = await createProject(createInput({ baseBranch: "release/2.0" }));

    expect(result).toMatchObject({ ok: true, baseBranch: "release/2.0" });
    expect(renderWorkflowYaml({ slug: "acme-web", baseBranch: "release/2.0" })).toContain("release/2.0");
  });

  it("브랜치를 안 주면 거부한다 — T8 이후에는 선택한 브랜치가 필수다", async () => {
    expect(await createProject(createInput({ baseBranch: undefined }))).toEqual({ ok: false, error: "invalid input" });
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("없는 브랜치는 `base-branch-missing`이다 — 새 갈래를 만들지 않는다", async () => {
    hoisted.openRepoReader.mockImplementation(async () =>
      reader({ snapshot: { status: "base-branch-missing" } }),
    );

    expect(await createProject(createInput({ baseBranch: "gone" }))).toEqual({
      ok: false,
      error: "base-branch-missing",
    });
  });

  /**
   * ⚠️ **`invalid-branch`는 `OnboardError`에 **없었다** — `RepositorySettingsError` 전용이었다.
   * "새 **검증**을 안 만든다"는 맞지만 "새 **갈래**를 안 만든다"는 틀렸다: union·`ONBOARD_ERRORS`·
   * 사전 셋을 함께 늘려야 판정이 화면에 닿는다 (POSTMORTEM 2026-09-06 — 판정과 문구를 나눈 커밋).
   */
  it("형식이 깨진 브랜치는 `invalid-branch`이고 GitHub을 부르지 않는다", async () => {
    expect(await createProject(createInput({ baseBranch: "bad branch" }))).toEqual({
      ok: false,
      error: "invalid-branch",
    });
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("`invalid-branch`가 온보딩 사전에 문구를 갖는다 — 판정만 있고 문구가 없으면 화면이 침묵한다", () => {
    expect(isOnboardError("invalid-branch")).toBe(true);
    expect(onboardErrorMessage("invalid-branch").length).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **`revalidatePath`가 접두가 아니라 경로 하나다** — 새로 생긴 "모달 뒤 목록"(`/projects/new`)을
   * 안 덮는다 (POSTMORTEM 2026-09-09: 화면을 옮겼는데 무효화가 안 따라갔다).
   */
  it("`/projects/new`도 무효화한다 — 모달 뒤 목록이 방금 만든 프로젝트를 빠뜨리지 않는다", async () => {
    await createProject(createInput());

    const paths = hoisted.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths, JSON.stringify(hoisted.revalidatePath.mock.calls)).toContain("/projects/new");
  });

  it("첫 적재를 하지 않는다 — lastCommitSha가 null이라 awaiting_first_sync다 (Action 둘, §3.11)", async () => {
    await createProject(createInput());

    expect(db.projects.find((p) => p.slug === "acme-web")?.lastCommitSha).toBeNull();
    expect(hoisted.ingestFirstSnapshot).not.toHaveBeenCalled();
  });

  it("클라이언트가 보낸 pathTemplate이 그 리포에서 성립하지 않으면 거부한다", async () => {
    const result = await createProject(createInput({ pathTemplate: "secrets/{locale}.json" }));

    expect(result).toEqual({ ok: false, error: "manual-no-match" });
    expect(db.projects.some((p) => p.slug === "acme-web")).toBe(false);
  });

  /**
   * ⚠️ **재검증 파일을 못 받은 것은 GitHub 장애다** (2026-09-07 리뷰 🟡4). `readFiles`가 실패한 blob을
   * 조용히 빼므로 `planConfirmedFormat`이 `manual-no-match`를 내는데, 그 문구는 "경로와 형식을 다시
   * 확인해 주세요"다 — 사용자는 자기 입력이 틀렸다고 믿고 맞는 경로를 고치려 든다
   * (POSTMORTEM 2026-09-03: 실패한 조회를 "없음"으로 읽었다).
   */
  it("재검증할 파일을 내려받지 못하면 unavailable이다 — 장애를 입력 오류로 말하지 않는다", async () => {
    hoisted.openRepoReader.mockImplementation(async () => reader({ blobs: new Map() }));

    expect(await createProject(createInput())).toEqual({ ok: false, error: "unavailable" });
    expect(db.projects.some((p) => p.slug === "acme-web")).toBe(false);
  });

  it("기준 로케일이 재탐지된 로케일에 없으면 거부한다 — 진짜 base의 키가 orphaned로 떨어진다", async () => {
    expect(await createProject(createInput({ baseLocale: "de" }))).toEqual({
      ok: false,
      error: "manual-no-match",
    });
  });

  it("모르는 어댑터 이름은 입력 오류다 — 리포를 읽지 않는다", async () => {
    expect(await createProject(createInput({ adapter: "sqlite" }))).toEqual({
      ok: false,
      error: "invalid input",
    });
  });

  it("slug 형식이 틀리면 invalid-slug이고 GitHub을 부르지 않는다", async () => {
    expect(await createProject(createInput({ slug: "new" }))).toEqual({
      ok: false,
      error: "invalid-slug",
    });
    expect(await createProject(createInput({ slug: "Acme_Web" }))).toEqual({
      ok: false,
      error: "invalid-slug",
    });
    expect(hoisted.probeRepo).not.toHaveBeenCalled();
  });

  it("이미 쓰는 slug는 선조회에서 slug-taken이다", async () => {
    expect(await createProject(createInput({ slug: "acme" }))).toEqual({
      ok: false,
      error: "slug-taken",
    });
  });

  it("경합으로 P2002가 나면 slug-taken으로 접는다 — 사용자에게 예외를 보내지 않는다", async () => {
    // 선조회를 지난 뒤 남이 먼저 만든 경우다. 가짜가 스키마의 `slug @unique`를 흉내내 재현한다.
    db.spies.createProject.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });

    expect(await createProject(createInput())).toEqual({ ok: false, error: "slug-taken" });
    expect(db.members.some((m) => m.userId === OWNER && m.projectId.startsWith("p-"))).toBe(false);
  });

  /**
   * **보관은 슬롯을 비운다** (7단계 — sync-runs design 결정 10). `project-onboarding/spec.md`가
   * "삭제가 비범위라 슬롯을 되찾을 길이 없다"를 이 단계로 넘긴 자리다.
   *
   * ⚠️ **두 집계 모두** 좁혀야 한다 — 선조회만 좁히면 트랜잭션 안 재집계가 보관분을 세어 거부하고,
   * 재집계만 좁히면 선조회가 먼저 거부해 GitHub도 안 읽는다. 둘 중 하나만 고치면 증상이 같다.
   */
  it("보관된 프로젝트는 OWNER 슬롯을 차지하지 않는다", async () => {
    db = createHarness({
      projects: [
        { id: "p1", slug: "a1", name: "A1" },
        { id: "p2", slug: "a2", name: "A2" },
        { id: "p3", slug: "a3", name: "A3", archivedAt: new Date("2026-09-10T00:00:00Z") },
      ],
      members: [
        { projectId: "p1", userId: OWNER, role: "OWNER" },
        { projectId: "p2", userId: OWNER, role: "OWNER" },
        { projectId: "p3", userId: OWNER, role: "OWNER" },
      ],
      users: [{ id: OWNER, email: "o@a.com" }],
    });
    hoisted.prisma = db.prisma;

    const result = await createProject(createInput());
    expect(result).toMatchObject({ ok: true });
    // 두 집계가 같은 조건을 쓴다 — 하나만 좁히면 선조회 통과 뒤 재집계가 거부한다.
    for (const call of db.spies.countMembers.mock.calls) {
      const where = (call[0] as { where: Record<string, unknown> }).where;
      if (where["role"] === "OWNER" && where["userId"] !== undefined) {
        expect(where["project"]).toEqual({ archivedAt: null });
      }
    }
  });

  it("OWNER 셋을 이미 가졌으면 limit-reached다", async () => {
    db = createHarness({
      projects: [
        { id: "p1", slug: "a1", name: "A1" },
        { id: "p2", slug: "a2", name: "A2" },
        { id: "p3", slug: "a3", name: "A3" },
      ],
      members: [
        { projectId: "p1", userId: OWNER, role: "OWNER" },
        { projectId: "p2", userId: OWNER, role: "OWNER" },
        { projectId: "p3", userId: OWNER, role: "OWNER" },
      ],
      users: [{ id: OWNER, email: "o@a.com" }],
    });
    hoisted.prisma = db.prisma;

    expect(await createProject(createInput())).toEqual({ ok: false, error: "limit-reached" });
  });

  /**
   * ⚠️ **선조회만으로는 제한이 우회된다** (2026-09-07 리뷰 🟡7). OWNER 카운트가 트랜잭션 밖이라
   * 두 탭이 동시에 들어오면 둘 다 "슬롯 있음"을 보고 각자 만든다 — 결과는 프로젝트 넷이고
   * 삭제가 비범위라 사용자가 슬롯을 되찾을 수 없다. `createInvitation`·`changeMember`가 프로젝트
   * 행을 잠그는 것과 같은 형태이고, **생성 경로에는 잠글 프로젝트가 없으므로 대상이 `User`다.**
   *
   * 메모리 DB는 잠금을 흉내내지 못하므로 ① 잠금이 생성보다 먼저인 것 ② 트랜잭션 안에서 **다시
   * 세는** 것 ③ 그때 넘치면 쓰기가 되돌아가는 것을 본다.
   */
  it("트랜잭션 안에서 다시 세서 동시 생성을 막는다 — 선조회를 지난 뒤 남이 슬롯을 채운 경우다", async () => {
    // 선조회는 2를 보고 통과하고, 트랜잭션 안의 재집계는 3을 본다.
    db.spies.countMembers.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    expect(await createProject(createInput())).toEqual({ ok: false, error: "limit-reached" });
    // 행도 멤버십도 남지 않는다 — 판정이 쓰기 뒤라도 롤백이 그것을 되돌린다.
    expect(db.projects.some((p) => p.slug === "acme-web")).toBe(false);
    expect(db.members.some((m) => m.userId === OWNER && m.projectId.startsWith("p-"))).toBe(false);

    const sql = db.spies.executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join("?")).join("\n");
    expect(sql).toMatch(/"User"[\s\S]*FOR UPDATE/);
    expect(db.spies.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.spies.createProject.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("EDITOR 셋은 제한에 들지 않는다 — 초대만 받은 사람이 하나도 못 만들면 안 된다", async () => {
    db = createHarness({
      projects: [
        { id: "p1", slug: "a1", name: "A1" },
        { id: "p2", slug: "a2", name: "A2" },
        { id: "p3", slug: "a3", name: "A3" },
      ],
      members: [
        { projectId: "p1", userId: OWNER, role: "EDITOR" },
        { projectId: "p2", userId: OWNER, role: "EDITOR" },
        { projectId: "p3", userId: OWNER, role: "EDITOR" },
      ],
      users: [{ id: OWNER, email: "o@a.com" }],
    });
    hoisted.prisma = db.prisma;

    expect(await createProject(createInput())).toMatchObject({ ok: true });
  });

  /**
   * ⚠️ **연결 거부가 제한 초과보다 앞이다** (`planProjectCreate`의 문서화된 순서). 판정이 어느 층에서
   * 나오든 Action의 관측 순서는 이것이어야 한다 — 거부될 요청에 다른 사유를 덧붙이지 않는다.
   * 이 케이스가 그 순서를 고정한다 (code-review 2026-09-07 🟡1: 같은 매핑이 두 층에 있다).
   */
  it("슬롯이 없고 리포 접근도 없으면 연결 거부가 먼저 나온다", async () => {
    db = createHarness({
      projects: [
        { id: "p1", slug: "a1", name: "A1" },
        { id: "p2", slug: "a2", name: "A2" },
        { id: "p3", slug: "a3", name: "A3" },
      ],
      members: [
        { projectId: "p1", userId: OWNER, role: "OWNER" },
        { projectId: "p2", userId: OWNER, role: "OWNER" },
        { projectId: "p3", userId: OWNER, role: "OWNER" },
      ],
      users: [{ id: OWNER, email: "o@a.com" }],
    });
    hoisted.prisma = db.prisma;
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("someone/else")]);

    // 내 설치에 없는 리포는 한 갈래로 접힌다 (sec-audit 발견 5) — 위 describe의 주석이 근거다.
    expect(await createProject(createInput())).toEqual({ ok: false, error: "repo-not-installed" });
  });

  it("이름이 지나치게 길면 입력 오류다 — 상한 없는 사용자 입력을 저장하지 않는다", async () => {
    expect(await createProject(createInput({ name: "가".repeat(201) }))).toEqual({
      ok: false,
      error: "invalid input",
    });
    expect(db.projects.some((p) => p.slug === "acme-web")).toBe(false);
  });

  it("3중 검증 거부는 행을 만들지 않는다", async () => {
    hoisted.listInstallationRepos.mockResolvedValue([repoRow("someone/else")]);

    expect(await createProject(createInput())).toEqual({ ok: false, error: "repo-not-installed" });
    expect(db.projects.some((p) => p.slug === "acme-web")).toBe(false);
  });

  it("probe 장애는 unavailable로 통과한다 — planProjectCreate가 그것을 거부로 접지 않는다", async () => {
    hoisted.probeRepo.mockResolvedValue({ status: "error" });

    expect(await createProject(createInput())).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("runFirstIngest — awaiting_first_sync에서만 돈다 (design §3.7)", () => {
  beforeEach(() => {
    // 하네스 기본 프로젝트는 포맷이 json-catalog이고, 시드는 "적재 완료"가 기본이다 —
    // 첫 적재 전 상태를 보려면 명시적으로 되돌린다 (`harness.ts`의 `ProjectSeed` 주석).
    db.projects[0]!.lastCommitSha = null;
    db.projects[0]!.repoOwner = "acme";
    db.projects[0]!.repoName = "web";
    db.projects[0]!.baseBranch = "develop";
    db.projects[0]!.installationId = "77";
    db.projects[0]!.pathTemplate = "i18n/{locale}.json";
  });

  /**
   * ⚠️ **무효화가 readiness를 읽는 화면 전부를 덮어야 한다** (2026-09-11 `/doc-check`).
   *
   * 첫 적재가 `lastCommitSha`를 세우는 순간 `planProjectReadiness`가 `ready`로 넘어가는데, 그 판정을
   * 읽는 화면이 **넷**이다 — 설정 · **Home**(`[slug]/page.tsx`) · **번역**(`translations/page.tsx`) ·
   * 목록(`lib/projects/list.ts`). `/projects/<slug>/settings`와 `/projects`만 지우면 앞의 둘이 캐시된
   * `ProjectNotReady`로 남아, **적재를 막 끝낸 사용자가 "아직 준비 안 됐다"를 본다.**
   *
   * 접두가 아니라 **서브트리**여야 하는 이유가 그것이다 — POSTMORTEM 2026-09-09(화면을 옮겼는데
   * 무효화가 안 따라갔다)와 같은 모양이고, `saveTranslation`이 이미 그 형이다.
   */
  it("`/projects/<slug>` 서브트리를 지운다 — settings만으로는 Home·번역이 안 따라온다", async () => {
    expect(await runFirstIngest({ slug: "acme" })).toMatchObject({ ok: true });

    const covered = hoisted.revalidatePath.mock.calls.some(
      ([path, type]) => path === "/projects/acme" && type === "layout",
    );
    expect(covered, JSON.stringify(hoisted.revalidatePath.mock.calls)).toBe(true);
  });

  it("스냅샷·blob을 값으로 넘겨 기존 적재 경로를 지난다", async () => {
    const result = await runFirstIngest({ slug: "acme" });

    expect(result).toEqual({ ok: true, count: 2, failed: 0, errors: [] });

    const [, input] = hoisted.ingestFirstSnapshot.mock.calls[0] ?? [];
    expect(input).toMatchObject({
      projectId: "p1",
      projectSlug: "acme",
      baseLocale: "en",
      headSha: HEAD_SHA,
      // ⚠️ `new Date()`면 CI 첫 push가 `stale-commit` 409다 (design §4).
      headCommittedAt: HEAD_AT,
    });
    expect(input.format).toMatchObject({ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json" });
    expect([...input.format.locales].sort()).toEqual(["en", "fr", "ko"]);
    // 로케일 파일 **전부**를 targets로 넘긴다 — 내려받지 못한 것을 실패로 세는 근거다.
    expect([...input.targets].sort()).toEqual(["i18n/en.json", "i18n/fr.json", "i18n/ko.json"]);
    expect([...input.blobs.keys()].sort()).toEqual(["i18n/en.json", "i18n/fr.json", "i18n/ko.json"]);
  });

  /**
   * ⚠️ **내려받지 못한 로케일 파일이 `targets`에 남아야 한다** (불변식 9 · 2026-09-07 리뷰 🔴2).
   *
   * `ingestTargets`는 `confirmed.format.locales`를 순회하는데 그 locales는 **성공한 blob에서 나온
   * 값**이다 — 재검증이 실패한 다운로드를 조용히 뺐으므로, 그 목록으로 `targets`를 만들면 사라진
   * 로케일이 함께 사라져 `ingest.ts`의 `missing`이 0이 된다. 그러면 화면은 "N개 키를 적재했어요"를
   * 쓰고 `lastCommitSha`가 서서 `ready`가 되며, [다시 시도]는 `not-awaiting`이라 되돌릴 수도 없다.
   *
   * T5의 code-review 🔴①이 `ingest.ts`에 세운 방어선을 이 Action이 무력화하고 있었다.
   */
  it("⚠️ 내려받지 못한 로케일 파일도 `targets`에 실린다 — 실패로 세지 않으면 값이 조용히 빠진다", async () => {
    // `i18n/fr.json`의 blob만 준비하지 않는다 — 5xx·권한 실패가 그 모양이다.
    hoisted.openRepoReader.mockImplementation(async () =>
      reader({ blobs: new Map([["sha-en", CATALOG], ["sha-ko", CATALOG]]) }),
    );

    await runFirstIngest({ slug: "acme" });

    const [, input] = hoisted.ingestFirstSnapshot.mock.calls[0] ?? [];
    // 시도한 목록에는 셋이 다 있고,
    expect([...input.targets].sort()).toEqual(["i18n/en.json", "i18n/fr.json", "i18n/ko.json"]);
    // 받아온 것은 둘뿐이다 — 그 차이가 `ingest.ts`에서 `failed`가 된다.
    expect([...input.blobs.keys()].sort()).toEqual(["i18n/en.json", "i18n/ko.json"]);
  });

  it("적재 결과의 실패 수가 그대로 나온다 — 0이 아니면 화면이 성공 문구를 못 쓴다 (불변식 9)", async () => {
    hoisted.ingestFirstSnapshot.mockResolvedValue({
      count: 2,
      failed: 3,
      errors: [{ path: "i18n/ko.json", message: "중복" }],
    });

    expect(await runFirstIngest({ slug: "acme" })).toEqual({
      ok: true,
      count: 2,
      failed: 3,
      errors: [{ path: "i18n/ko.json", message: "중복" }],
    });
  });

  it("이미 ready면 not-awaiting이다 — strict push라 번역자 편집을 버튼 하나로 덮는다", async () => {
    db.projects[0]!.lastCommitSha = "deadbeef";

    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "not-awaiting" });
    expect(hoisted.ingestFirstSnapshot).not.toHaveBeenCalled();
  });

  it("연결 전(setup)이면 not-awaiting이다 — 읽을 리포가 없다", async () => {
    db.projects[0]!.installationId = null;

    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "not-awaiting" });
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });

  it("EDITOR는 forbidden이다 — 설정 권한이 필요하다", async () => {
    hoisted.session = sessionFor(EDITOR);

    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "forbidden" });
  });

  it("멤버가 아니면 not-found다 — 프로젝트 존재를 노출하지 않는다", async () => {
    hoisted.session = sessionFor("u-nobody");

    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "not-found" });
  });

  it("리포 클라이언트 생성 예외도 진행 표시를 정리하고 목록 캐시를 지운다", async () => {
    hoisted.openRepoReader.mockRejectedValue(new Error("token unavailable"));
    await expect(runFirstIngest({ slug: "acme" })).resolves.toEqual({ ok: false, error: "ingest-failed" });
    expect(db.projects[0]).toMatchObject({ lastImportStartedAt: null, lastImportError: "import-failed" });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects/new");
  });

  it("스냅샷 실패 반환도 실패를 저장하고 목록 캐시를 지운다", async () => {
    hoisted.openRepoReader.mockImplementation(async () => reader({ snapshot: { status: "unavailable" } }));
    await runFirstIngest({ slug: "acme" });
    expect(db.projects[0]).toMatchObject({ lastImportStartedAt: null, lastImportError: "import-failed" });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects");
  });

  it("적재가 던지면 ingest-failed이고 행은 그대로 남는다 — [다시 시도]가 같은 Action이다", async () => {
    hoisted.ingestFirstSnapshot.mockRejectedValue(new Error("boom"));

    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "ingest-failed" });
    expect(db.projects[0]!.lastCommitSha).toBeNull();
  });

  it("스냅샷 실패는 그 갈래로 나간다", async () => {
    hoisted.openRepoReader.mockImplementation(async () => reader({ snapshot: { status: "unavailable" } }));

    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "unavailable" });
  });

  it("저장된 템플릿이 그 리포에서 더 이상 성립하지 않으면 ingest-failed다", async () => {
    db.projects[0]!.pathTemplate = "moved/{locale}.json";

    expect(await runFirstIngest({ slug: "acme" })).toEqual({ ok: false, error: "ingest-failed" });
    expect(hoisted.ingestFirstSnapshot).not.toHaveBeenCalled();
  });
});

describe("rotatePushToken — 원문은 한 번만 돌아온다", () => {
  it("회전하면 옛 해시로는 행을 찾을 수 없다", async () => {
    const first = await rotatePushToken({ slug: "acme" });
    expect(first).toMatchObject({ ok: true });
    const oldHash = hashPushToken((first as { pushToken: string }).pushToken);
    expect(db.projects[0]!.pushTokenHash).toBe(oldHash);

    const second = await rotatePushToken({ slug: "acme" });
    const newToken = (second as { pushToken: string }).pushToken;
    expect(newToken).not.toBe((first as { pushToken: string }).pushToken);
    expect(db.projects[0]!.pushTokenHash).toBe(hashPushToken(newToken));

    expect(await db.prisma.project.findUnique({ where: { pushTokenHash: oldHash } })).toBeNull();
  });

  it("DB엔 해시만 남는다", async () => {
    const result = await rotatePushToken({ slug: "acme" });
    const token = (result as { pushToken: string }).pushToken;

    expect(JSON.stringify(db.projects)).not.toContain(token);
  });

  it("EDITOR는 forbidden이고 해시가 바뀌지 않는다", async () => {
    hoisted.session = sessionFor(EDITOR);
    const before = db.projects[0]!.pushTokenHash;

    expect(await rotatePushToken({ slug: "acme" })).toEqual({ ok: false, error: "forbidden" });
    expect(db.projects[0]!.pushTokenHash).toBe(before);
  });
});

/**
 * **연결 해제 — 사용자 수준** (2026-09-07 리뷰 🟡9. `github-connect.test.ts`에서 옮겼다).
 *
 * ⚠️ **인가가 `project:settings`에서 `requireUser`로 넓어졌다.** 연결이 사용자 수준으로 열린 뒤
 * (`startGithubConnectForUser`) **프로젝트를 하나도 안 만든 사용자**가 생길 수 있고, 그 사람에게는
 * 설정 화면이 없어 해제에 도달할 길이 없었다 — `taken-by-other`가 영구 잠금이 된다(ARCHITECTURE §6.2.1는
 * 자동 병합을 금지하므로 다른 계정으로 옮길 길도 없다). `Account` 행은 사용자 소유라 프로젝트
 * 권한을 요구할 근거가 애초에 없었다.
 */
describe("disconnectGithub — 사용자 수준 (design §3.6의 나머지 절반)", () => {
  /**
   * ⚠️ **무효화 범위가 이 연결을 보이는 화면 전부를 덮어야 한다** (6b-4). 6b-4까지는 화면이 둘이고
   * 둘 다 `/projects` 아래여서 `revalidatePath("/projects", "layout")`으로 충분했는데, **계정 카드가
   * `/account`로 옮겨가면서 그 접두가 주 화면을 놓쳤다.** 놓치면 [Disconnect]를 누른 사용자가
   * `@handle`과 그 버튼을 그대로 보고, 다시 눌러도 행이 이미 없어 조용히 `{ok:true}`가 돌아온다 —
   * "버튼이 안 눌린다"로 보이지만 해제는 이미 됐다 (POSTMORTEM 2026-09-06과 같은 모양).
   */
  it("`/account`까지 덮는 범위로 무효화한다 — `/projects` 접두는 주 화면을 놓친다", async () => {
    expect(await disconnectGithub()).toEqual({ ok: true });

    const covered = hoisted.revalidatePath.mock.calls.some(
      ([path, type]) => path === "/" && type === "layout",
    );
    expect(covered, JSON.stringify(hoisted.revalidatePath.mock.calls)).toBe(true);
  });

  /**
   * **삭제도 `userId`로 좁힌다** (sec-audit 발견 15). 전에는 `findFirst({ userId, provider })`로 읽고
   * `delete({ where: { provider_providerAccountId } })`로 지웠다 — `where`에 `userId`가 없어, 읽기와
   * 삭제 사이에 그 `providerAccountId`의 소유자가 바뀌면 **남의 연결이 지워진다**. 탈취가 아니라
   * 삭제다(`planAccountLink`의 `taken-by-other`가 행이 사는 동안 탈취를 막는다).
   *
   * 창은 좁지만(A가 해제를 두 번 누르는 사이 B가 같은 GitHub 계정을 연결) 이 자리는 POSTMORTEM
   * 2026-09-06이 넓힌 규칙 — **사용자에 속한 행은 `userId`로 좁힌다** — 의 유일한 위반이었다.
   */
  it("`userId`로 좁혀 지운다 — PK만으로 지우면 남의 행에 닿는 창이 열린다", async () => {
    expect(await disconnectGithub()).toEqual({ ok: true });
    expect(db.spies.deleteManyAccounts).toHaveBeenCalledWith({
      where: { userId: OWNER, provider: "github-app" },
    });
    expect(db.spies.deleteAccount).not.toHaveBeenCalled();
  });

  it("같은 provider의 남의 행은 남는다", async () => {
    db = createHarness({
      projects: [],
      members: [],
      users: [{ id: OWNER, email: "o@a.com" }, { id: "other", email: "x@a.com" }],
      accounts: [
        { userId: OWNER, provider: "github-app", providerAccountId: "gh-1" },
        { userId: "other", provider: "github-app", providerAccountId: "gh-2" },
      ],
    });
    hoisted.prisma = db.prisma;

    expect(await disconnectGithub()).toEqual({ ok: true });
    expect(db.accounts.map((a) => a.userId)).toEqual(["other"]);
  });

  it("자기 github-app 행만 지우고 Project는 건드리지 않는다", async () => {
    expect(await disconnectGithub()).toEqual({ ok: true });
    expect(db.accounts.find((a) => a.userId === OWNER)).toBeUndefined();
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ **이 케이스가 뒤집혔다.** 전에는 "EDITOR는 forbidden"이었는데, 그 판정이 곧 위 잠금의 원인이다 —
   * 멤버십은 남의 프로젝트에 대한 권한이고 자기 GitHub 계정과 아무 관계가 없다.
   */
  it("멤버십과 무관하게 자기 행을 지운다 — 프로젝트가 없는 사용자도 도달해야 한다", async () => {
    db = createHarness({
      projects: [],
      members: [],
      users: [{ id: OWNER, email: "o@a.com" }],
      accounts: [{ userId: OWNER, provider: "github-app", providerAccountId: "gh-1" }],
    });
    hoisted.prisma = db.prisma;

    expect(await disconnectGithub()).toEqual({ ok: true });
    expect(db.accounts).toEqual([]);
  });

  it("비로그인은 로그인 화면으로 보낸다 — 값이 아니라 redirect다", async () => {
    hoisted.session = sessionFor(null);

    await expect(disconnectGithub()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(db.accounts.length).toBe(1);
  });

  it("남의 행은 남는다 — 해제는 자기 연결만 끊는다", async () => {
    db = createHarness({
      users: [{ id: OWNER, email: "o@a.com" }],
      accounts: [
        { userId: OWNER, provider: "github-app", providerAccountId: "gh-1" },
        { userId: "u-other", provider: "github-app", providerAccountId: "gh-2" },
      ],
    });
    hoisted.prisma = db.prisma;

    await disconnectGithub();

    expect(db.accounts.map((a) => a.userId)).toEqual(["u-other"]);
  });

  it("로그인용 github 행은 건드리지 않는다 — provider가 다른 별개 인가다", async () => {
    db = createHarness({
      users: [{ id: OWNER, email: "o@a.com" }],
      accounts: [
        { userId: OWNER, provider: "github", providerAccountId: "gh-1" },
        { userId: OWNER, provider: "github-app", providerAccountId: "gh-1" },
      ],
    });
    hoisted.prisma = db.prisma;

    await disconnectGithub();

    expect(db.accounts.map((a) => a.provider)).toEqual(["github"]);
  });

  it("연결이 없어도 성공으로 읽는다 — 원하는 상태가 이미 이뤄져 있다", async () => {
    db = createHarness({ users: [{ id: OWNER, email: "o@a.com" }] });
    hoisted.prisma = db.prisma;

    expect(await disconnectGithub()).toEqual({ ok: true });
  });

  it("삭제가 던지면 unavailable이다 — digest만 있는 오류를 사용자에게 보내지 않는다", async () => {
    db.spies.deleteManyAccounts.mockRejectedValueOnce(new Error("Can't reach database server"));

    expect(await disconnectGithub()).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("ready가 아닌 프로젝트의 번역 Action은 not-ready다 (design §3.7)", () => {
  /**
   * 첫 적재 전에는 저장할 키가 없어 화면으로는 도달하지 않는다 — **URL 직접 호출**과 적재 실패 후의
   * 재방문을 막는다. 거부가 화면에 닿아야 하므로 사유는 문구를 가진 갈래로 돌려준다
   * (POSTMORTEM 2026-09-06).
   */
  beforeEach(() => {
    db.projects[0]!.lastCommitSha = null;
  });

  it("saveTranslation이 거부하고 아무것도 쓰지 않는다", async () => {
    expect(
      await saveTranslation({ slug: "acme", keyId: "k-greet", localeCode: "ko", value: "안녕" }),
    ).toEqual({ ok: false, error: "not-ready" });
    expect(db.translations).toEqual([]);
  });

  it("triggerPullAction이 거부하고 pull을 부르지 않는다", async () => {
    expect(await triggerPullAction("acme")).toEqual({ status: "failed", error: "not-ready" });
    expect(hoisted.triggerPull).not.toHaveBeenCalled();
  });

  it("ready면 둘 다 지나간다 — 판정이 항상 거부하지 않는다", async () => {
    db.projects[0]!.lastCommitSha = "deadbeef";
    hoisted.triggerPull.mockResolvedValue({ status: "skipped" });


    expect(
      await saveTranslation({ slug: "acme", keyId: "k-greet", localeCode: "ko", value: "안녕" }),
    ).toEqual({ ok: true, value: "안녕" });
    expect(await triggerPullAction("acme")).toEqual({ status: "skipped" });
  });
});

it("탐지 예산 초과는 화면용 오류이며 DB에 쓰지 않는다", async () => {
  hoisted.openRepoReader.mockImplementation(async () => reader({ snapshot: { status: "ok", headSha: HEAD_SHA, headCommittedAt: HEAD_AT, files: [{path:"i18n/en.json",sha:"sha-en",size:2_000_001},{path:"i18n/ko.json",sha:"sha-ko",size:2_000_001}] } }));
  expect(await detectRepoFormats({ owner: "acme", repo: "web" })).toEqual({ok:false,error:"resource-limit"});
});

describe("모달 Action의 세션 만료 — 예외 J", () => {
  it.each([
    () => detectRepoFormats({ owner: "acme", repo: "web" }),
    () => listRepoBranches({ owner: "acme", repo: "web" }),
    () => loadCandidateSample({ owner: "acme", repo: "web", ref: "develop", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locale: "en" }),
    () => createProject(createInput()),
  ])("redirect하지 않고 unauthorized를 반환한다 %#", async (action) => {
    hoisted.session = sessionFor(null);
    await expect(action()).resolves.toEqual({ ok: false, error: "unauthorized" });
    expect(hoisted.redirect).not.toHaveBeenCalled();
    expect(hoisted.openRepoReader).not.toHaveBeenCalled();
  });
});

it("브랜치 목록 실패에도 이미 확인한 기본 브랜치를 보존한다", async () => {
  hoisted.listBranches.mockResolvedValue({ status: "unavailable" });
  expect(await listRepoBranches({ owner: "acme", repo: "web" })).toMatchObject({
    ok: false, error: "unavailable", defaultBranch: "develop",
  });
});

function sampleProof(over: Partial<{ userId: string; repositoryId: string; installationId: string; ref: string; headSha: string }> = {}) {
  return signSampleConfirmation({
    userId: OWNER, repositoryId: PROBE_OK.repositoryId, installationId: PROBE_OK.installationId,
    ref: "develop", headSha: HEAD_SHA, ...over,
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en", "fr", "ko"] },
  }, "test-secret-0123456789abcdef");
}

const sampleRequest = () => ({ owner: "acme", repo: "web", ref: "develop", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locale: "ko", confirmation: sampleProof() });

it("샘플은 확인값 검증 후 요청 언어의 blob 하나만 읽는다", async () => {
  expect((await loadCandidateSample(sampleRequest())).ok).toBe(true);
  const opened = await hoisted.openRepoReader.mock.results[0]?.value;
  expect(opened.blob.mock.calls).toEqual([["sha-ko"]]);
});

it.each([
  { confirmation: "forged" },
  { confirmation: sampleProof({ userId: EDITOR }) },
  { confirmation: sampleProof({ headSha: "old" }) },
  { pathTemplate: "{locale}" },
  { locale: "de" },
])("샘플의 조작·다른 사용자·낡은 스냅샷은 blob 전에 거부한다 %#", async (over) => {
  expect((await loadCandidateSample({ ...sampleRequest(), ...over })).ok).toBe(false);
  for (const call of hoisted.openRepoReader.mock.results) {
    const opened = await call.value;
    expect(opened.blob).not.toHaveBeenCalled();
  }
});

it("탐지된 후보가 발급한 확인값으로 lazy 샘플을 읽을 수 있다", async () => {
  const detected = await detectRepoFormats({ owner: "acme", repo: "web", ref: "develop" });
  expect(detected.ok).toBe(true);
  if (!detected.ok) throw new Error("Expected candidates");
  expect(detected.candidates[0]?.confirmation).toEqual(expect.any(String));
  expect((await loadCandidateSample({ ...sampleRequest(), confirmation: detected.candidates[0]?.confirmation })).ok).toBe(true);
});

it("수동 지정은 재검증한 초기 샘플과 확인값을 돌려준다", async () => {
  const result = await confirmManualFormat({ owner: "acme", repo: "web", ref: "develop", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "ko" });
  expect(result).toMatchObject({ ok: true, candidate: { baseLocale: "ko", confirmation: expect.any(String) } });
});

it("빈 샘플은 0행 성공이고 파싱 실패는 unavailable이다", async () => {
  hoisted.openRepoReader.mockImplementation(async () => reader({ blobs: new Map([["sha-ko", "{}"]]) }));
  expect(await loadCandidateSample(sampleRequest())).toEqual({ ok: true, rows: [], total: 0 });
  hoisted.openRepoReader.mockImplementation(async () => reader({ blobs: new Map([["sha-ko", "{invalid"]]) }));
  expect(await loadCandidateSample(sampleRequest())).toEqual({ ok: false, error: "unavailable" });
});

/**
 * ⚠️ **엔트리 오류 하나가 파일 전체를 가리지 않는다** (ARCHITECTURE §4 — 남의 리포를 우리 파서
 * 규칙으로 탈락시키지 않는다). 903키 중 하나가 문자열이 아니면 나머지 902개는 여전히 보여야 하고,
 * 화면의 "We couldn't read this file."은 **파일을 못 읽은 것**만 말해야 한다 — 그 문구가 뜨면
 * 사용자는 경로나 포맷을 고치려 든다(POSTMORTEM 2026-09-03의 형).
 */
it("엔트리 오류가 있어도 읽어낸 행은 보여 준다 — '못 읽었다'는 파일 단위다", async () => {
  hoisted.openRepoReader.mockImplementation(async () =>
    reader({ blobs: new Map([["sha-ko", JSON.stringify({ ok: "값", broken: 12 })]]) }),
  );

  expect(await loadCandidateSample(sampleRequest())).toEqual({
    ok: true,
    rows: [{ key: "ok", value: "값" }],
    total: 1,
  });
});

it("수동 기준 언어가 초기 세 언어 밖이어도 그 언어의 샘플을 준다", async () => {
  const extra = { path: "i18n/ja.json", sha: "sha-ja", size: 100 };
  const tree = [...TREE, extra];
  hoisted.openRepoReader.mockImplementation(async () => reader({
    snapshot: { status: "ok", headSha: HEAD_SHA, headCommittedAt: HEAD_AT, files: tree },
    blobs: new Map(tree.map((file) => [file.sha, CATALOG])),
  }));
  const result = await confirmManualFormat({ owner: "acme", repo: "web", ref: "develop", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "ko" });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected confirmed format");
  expect(result.candidate.samples.some((sample) => sample.locale === "ko")).toBe(true);
});

it.each([
  { ref: "bad ref" }, { baseLocale: "../en" }, { adapter: "unknown" }, { pathTemplate: "README.md" },
])("수동 확정은 잘못된 입력을 확인값으로 승격하지 않는다 %#", async (over) => {
  const result = await confirmManualFormat({ owner: "acme", repo: "web", ref: "develop", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", ...over });
  expect(result.ok).toBe(false);
});

it("수동 확정도 세션이 없거나 리포 접근이 거부되면 blob을 읽지 않는다", async () => {
  const raw = { owner: "acme", repo: "web", ref: "develop", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" };
  hoisted.session = sessionFor(null);
  expect(await confirmManualFormat(raw)).toEqual({ ok: false, error: "unauthorized" });
  expect(hoisted.redirect).not.toHaveBeenCalled();
  hoisted.session = sessionFor(OWNER);
  hoisted.listInstallationRepos.mockResolvedValue([repoRow("acme/other")]);
  expect(await confirmManualFormat(raw)).toEqual({ ok: false, error: "repo-not-installed" });
  expect(hoisted.openRepoReader).not.toHaveBeenCalled();
});
