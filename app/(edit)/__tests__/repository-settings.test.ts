import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor } from "./harness";

/**
 * **기준 브랜치·기준 로케일 저장** (6b-3 — translation-ui design §3.13).
 *
 * ⚠️ **이 Action의 요지는 "무엇을 쓰지 않는가"다.** `baseLocale`은 **선언 컬럼에만** 간다 —
 * `Project.baseLocale`(현실)을 여기서 바꾸면 야간 pull이 그것을 즉시 진실로 읽어 **옛 base의
 * 원문이 새 base 파일에 실린 PR**을 낸다. 그래서 성공 경로가 두 컬럼을 각각 단언한다.
 *
 * ⚠️ **거부만 검증하면 "항상 거부하는 Action"도 전부 통과한다** (POSTMORTEM 2026-09-06).
 *
 * 별도 파일인 이유: 이 Action은 GitHub을 부르지 않아 `github-connect.test.ts`의 mock 셋이
 * 필요 없다(`publish-failure.test.ts`와 같은 분리).
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => hoisted.revalidated.push(p) }));
// 이 Action은 쿠키·redirect 경로를 지나지 않지만, 같은 파일의 `startGithubConnect`가 그것들을 물어 온다.
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {} }), headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("NEXT_REDIRECT"); } }));

const { updateRepositorySettings } = await import("../projects/[slug]/settings/actions");

function seeded() {
  return createHarness({
    projects: [
      { id: "pA", slug: "alpha", baseLocale: "en" },
      { id: "pB", slug: "beta", baseLocale: "en" },
    ],
    members: [
      { projectId: "pA", userId: "u-owner", role: "OWNER" },
      { projectId: "pA", userId: "u-editor", role: "EDITOR" },
      { projectId: "pB", userId: "u-other", role: "OWNER" },
    ],
    locales: [
      { projectId: "pA", code: "en", isBase: true },
      { projectId: "pA", code: "ko" },
      { projectId: "pA", code: "fr", orphaned: true },
    ],
  });
}

let db: ReturnType<typeof createHarness>;

beforeEach(() => {
  db = seeded();
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-owner");
  hoisted.revalidated = [];
});

const alpha = () => db.projects.find((p) => p.id === "pA")!;

describe("updateRepositorySettings — 인가", () => {
  it("EDITOR는 forbidden이다 — project:settings 뒤다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "dev", baseLocale: "ko" });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(alpha().baseBranch).toBe("main");
  });

  it("남의 프로젝트는 not-found다 — 존재 여부를 말하지 않는다", async () => {
    hoisted.session = sessionFor("u-owner");
    const result = await updateRepositorySettings({ slug: "beta", baseBranch: "dev", baseLocale: "ko" });
    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(db.projects.find((p) => p.id === "pB")!.baseBranch).toBe("main");
  });

  it("비로그인은 unauthorized다", async () => {
    hoisted.session = sessionFor(null);
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "dev", baseLocale: "ko" });
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });
});

describe("updateRepositorySettings — 형식", () => {
  it("잘못된 브랜치 이름은 invalid-branch고 아무것도 쓰지 않는다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "a b", baseLocale: "ko" });
    expect(result).toEqual({ ok: false, error: "invalid-branch" });
    expect(alpha().baseBranch).toBe("main");
    expect(alpha().declaredBaseLocale).toBeNull();
  });

  /** 트림하면 화면의 값과 저장값이 갈리고 그 차이가 `checkFormat`의 조용한 409가 된다. */
  it("앞뒤 공백도 거부다 — 조용히 트림하지 않는다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: " dev", baseLocale: "en" });
    expect(result).toEqual({ ok: false, error: "invalid-branch" });
  });

  it("리포에 없는 로케일은 unknown-locale이다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "main", baseLocale: "ja" });
    expect(result).toEqual({ ok: false, error: "unknown-locale" });
    expect(alpha().declaredBaseLocale).toBeNull();
  });

  /**
   * ⚠️ orphaned 로케일을 base로 세우면 **다음 push가 그 파일을 못 읽어 키 집합이 0**이 되고 살아
   * 있던 키 전부가 orphaned로 떨어진다. 화면은 그것을 목록에서 빼지만 방어는 여기다.
   */
  it("orphaned 로케일은 orphaned-locale이다 — 목록에서 감추는 것은 편의일 뿐이다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "main", baseLocale: "fr" });
    expect(result).toEqual({ ok: false, error: "orphaned-locale" });
    expect(alpha().declaredBaseLocale).toBeNull();
  });
});

describe("updateRepositorySettings — 저장", () => {
  it("브랜치는 즉시 쓰고 로케일은 선언에만 쓴다 — 현실은 push가 소유한다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "release/2.0", baseLocale: "ko" });
    expect(result).toEqual({ ok: true });
    expect(alpha().baseBranch).toBe("release/2.0");
    expect(alpha().declaredBaseLocale).toBe("ko");
    // ⚠️ **현실은 그대로다.** 바꾸면 pull이 옛 base의 원문을 새 base 파일에 실어 보낸다 (design §3.13).
    expect(alpha().baseLocale).toBe("en");
  });

  it("`Locale.isBase`도 건드리지 않는다 — 편집 화면의 base 열은 push가 옮긴다", async () => {
    await updateRepositorySettings({ slug: "alpha", baseBranch: "main", baseLocale: "ko" });
    expect(db.locales.map((l) => [l.code, l.isBase ?? false])).toEqual([
      ["en", true],
      ["ko", false],
      ["fr", false],
    ]);
  });

  it("두 화면을 갱신한다 — 대기 배너가 번역 화면에도 있다", async () => {
    await updateRepositorySettings({ slug: "alpha", baseBranch: "main", baseLocale: "ko" });
    expect(hoisted.revalidated).toEqual(["/projects/alpha/settings", "/projects/alpha/translations"]);
  });

  /** `noop` — 현재 값을 다시 저장했다. 거부가 아니고, 쓸 것도 없다. */
  it("현재 값 그대로면 ok이지만 쓰지 않는다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "main", baseLocale: "en" });
    expect(result).toEqual({ ok: true });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  /**
   * **되돌리는 경로다** (design §3.13: "B로 선언했다가 A로 다시 저장하면 대기가 사라진다").
   * 별도 취소 버튼을 두지 않는 근거가 이 케이스다.
   */
  it("대기 중에 현재 base를 다시 저장하면 선언이 비워진다 — 취소 버튼이 없는 이유다", async () => {
    await updateRepositorySettings({ slug: "alpha", baseBranch: "main", baseLocale: "ko" });
    expect(alpha().declaredBaseLocale).toBe("ko");

    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "main", baseLocale: "en" });
    expect(result).toEqual({ ok: true });
    expect(alpha().declaredBaseLocale).toBeNull();
  });

  it("빈 입력은 invalid input이다 — 외부에서 오는 값이라 조용히 통과시키지 않는다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "", baseLocale: "ko" });
    expect(result).toEqual({ ok: false, error: "invalid input" });
  });
});
