import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor } from "./harness";

/**
 * **기준 브랜치**(설정 화면)와 **기준 로케일**(로케일 화면) — 6b-3이 한 Action이던 것을 6b-5가
 * 갈랐다 (PRODUCT §7.7 결정 4: 기준 로케일의 소유자가 `settings` → `locales`로 옮겨졌다).
 *
 * ⚠️ **화면이 갈리면 Action도 갈라야 한다.** 인자를 optional로 만들면 서버가 "무엇을 안 보냈나"를
 * 추측하게 되고, 그 추측이 곧 malmoi#20의 모양이다 — 화면이 기본값으로 채운 값과 사람이 고른 값을
 * 서버는 구별할 수 없다.
 *
 * ⚠️ **`updateBaseLocale`의 요지는 "무엇을 쓰지 않는가"다.** `baseLocale`은 **선언 컬럼에만** 간다 —
 * `Project.baseLocale`(현실)을 여기서 바꾸면 야간 pull이 그것을 즉시 진실로 읽어 **옛 base의
 * 원문이 새 base 파일에 실린 PR**을 낸다. 그래서 성공 경로가 두 컬럼을 각각 단언한다.
 *
 * ⚠️ **거부만 검증하면 "항상 거부하는 Action"도 전부 통과한다** (POSTMORTEM 2026-09-06).
 *
 * 별도 파일인 이유: 두 Action 다 GitHub을 부르지 않아 `github-connect.test.ts`의 mock 셋이
 * 필요 없다(`publish-failure.test.ts`와 같은 분리).
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  revalidated: [] as string[],
  failRevalidate: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { if (hoisted.failRevalidate) throw new Error("cache unavailable"); hoisted.revalidated.push(p); } }));
// 이 Action은 쿠키·redirect 경로를 지나지 않지만, 같은 파일의 `startGithubConnect`가 그것들을 물어 온다.
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {} }), headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("NEXT_REDIRECT"); } }));

const { updateRepositorySettings } = await import("../projects/[slug]/settings/actions");
const { updateBaseLocale } = await import("../projects/[slug]/sources/actions");

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
  hoisted.failRevalidate = false;
});

const alpha = () => db.projects.find((p) => p.id === "pA")!;

describe("updateRepositorySettings — 기준 브랜치만 받는다 (6b-5에서 갈렸다)", () => {
  it("EDITOR는 forbidden이다 — project:settings 뒤다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "dev" });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(alpha().baseBranch).toBe("main");
  });

  it("남의 프로젝트는 not-found다 — 존재 여부를 말하지 않는다", async () => {
    const result = await updateRepositorySettings({ slug: "beta", baseBranch: "dev" });
    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(db.projects.find((p) => p.id === "pB")!.baseBranch).toBe("main");
  });

  it("비로그인은 unauthorized다", async () => {
    hoisted.session = sessionFor(null);
    expect(await updateRepositorySettings({ slug: "alpha", baseBranch: "dev" })).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("잘못된 브랜치 이름은 invalid-branch고 아무것도 쓰지 않는다", async () => {
    const result = await updateRepositorySettings({ slug: "alpha", baseBranch: "a b" });
    expect(result).toEqual({ ok: false, error: "invalid-branch" });
    expect(alpha().baseBranch).toBe("main");
  });

  /** 트림하면 화면의 값과 저장값이 갈리고 그 차이가 `checkFormat`의 조용한 409가 된다. */
  it("앞뒤 공백도 거부다 — 조용히 트림하지 않는다", async () => {
    expect(await updateRepositorySettings({ slug: "alpha", baseBranch: " dev" })).toEqual({
      ok: false,
      error: "invalid-branch",
    });
  });

  it("빈 입력은 invalid input이다 — 외부에서 오는 값이라 조용히 통과시키지 않는다", async () => {
    expect(await updateRepositorySettings({ slug: "alpha", baseBranch: "" })).toEqual({
      ok: false,
      error: "invalid input",
    });
  });

  it("유효한 브랜치는 즉시 쓴다 — `checkFormat`이 보지 않는 축이라 대기 개념이 없다", async () => {
    expect(await updateRepositorySettings({ slug: "alpha", baseBranch: "release/2.0" })).toEqual({ ok: true });
    expect(alpha().baseBranch).toBe("release/2.0");
  });

  /**
   * ⚠️ **기준 로케일을 건드리지 않는다** — 갈라진 뒤로 이 Action은 선언 컬럼을 모른다. 건드리면
   * 대기 중에 브랜치만 고친 저장이 그 선언을 지우고, 그것이 정확히 malmoi#20이다.
   */
  it("선언 컬럼을 건드리지 않는다 — 대기 중에 브랜치만 고쳐도 선언이 살아 있다", async () => {
    db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale = "ko";

    expect(await updateRepositorySettings({ slug: "alpha", baseBranch: "dev" })).toEqual({ ok: true });

    expect(db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale).toBe("ko");
    expect(alpha().baseLocale).toBe("en");
  });

  it("현재 값 그대로면 ok이지만 쓰지 않는다", async () => {
    expect(await updateRepositorySettings({ slug: "alpha", baseBranch: "main" })).toEqual({ ok: true });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });
});

/**
 * **기준 로케일 — `/projects/:slug/locales`가 소유한다** (6b-5).
 *
 * ⚠️ **인가는 여전히 `project:settings`다.** 그 화면의 **페이지** 게이트는 `translation:write`이지만
 * (EDITOR도 목록과 orphaned 사유를 본다) **판정은 Action**이 한다 — 6b-2가 멤버 화면에서 세운
 * 관용구이고, 노출을 차단으로 착각하면 그 차이가 구멍이 된다.
 */
describe("updateBaseLocale — 인가", () => {
  it("EDITOR는 forbidden이다 — 페이지는 들어오지만 판정은 Action이 한다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ko" });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale).toBeNull();
  });

  it("남의 프로젝트는 not-found다 — 존재 여부를 말하지 않는다", async () => {
    const result = await updateBaseLocale({ surfaceSlug: "default", slug: "beta", baseLocale: "ko" });
    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("비로그인은 unauthorized다", async () => {
    hoisted.session = sessionFor(null);
    expect(await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ko" })).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("빈 입력은 invalid input이다", async () => {
    expect(await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "" })).toEqual({
      ok: false,
      error: "invalid input",
    });
  });
});

describe("updateBaseLocale — 판정", () => {
  it("리포에 없는 로케일은 unknown-locale이다", async () => {
    const result = await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ja" });
    expect(result).toEqual({ ok: false, error: "unknown-locale" });
    expect(db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale).toBeNull();
  });

  /**
   * ⚠️ orphaned 로케일을 base로 세우면 **다음 push가 그 파일을 못 읽어 키 집합이 0**이 되고 살아
   * 있던 키 전부가 orphaned로 떨어진다. 화면은 그것을 목록에서 빼지만 방어는 여기다.
   */
  it("orphaned 로케일은 orphaned-locale이다 — 목록에서 감추는 것은 편의일 뿐이다", async () => {
    const result = await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "fr" });
    expect(result).toEqual({ ok: false, error: "orphaned-locale" });
    expect(db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale).toBeNull();
  });
});

describe("updateBaseLocale — 저장", () => {
  it("선언에만 쓴다 — 현실은 push가 소유한다", async () => {
    expect(await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ko" })).toEqual({ ok: true });
    expect(db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale).toBe("ko");
    // ⚠️ **현실은 그대로다.** 바꾸면 pull이 옛 base의 원문을 새 base 파일에 실어 보낸다 (ARCHITECTURE §5.5.5).
    expect(alpha().baseLocale).toBe("en");
  });

  it("`baseBranch`를 건드리지 않는다 — 갈라진 뒤로 이 Action은 브랜치를 모른다", async () => {
    await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ko" });
    expect(alpha().baseBranch).toBe("main");
  });

  it("`Locale.isBase`도 건드리지 않는다 — 편집 화면의 base 열은 push가 옮긴다", async () => {
    await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ko" });
    expect(db.locales.map((l) => [l.code, l.isBase ?? false])).toEqual([
      ["en", true],
      ["ko", false],
      ["fr", false],
    ]);
  });

  /**
   * ⚠️ **`declaredBaseLocale`을 읽는 화면이 셋이다** (POSTMORTEM 2026-09-09 — 접두 기반 무효화가
   * 화면 이동에 조용히 깨진다): 로케일 화면(필드 + 대기 Alert) · 번역 화면(배너) · **설정 화면**
   * (워크플로 YAML이 대기 중 `base-locale:`을 박는다). 셋이 전부 `/projects/<slug>` 아래이므로
   * 그 세그먼트의 레이아웃을 무효화해 하나도 빠뜨리지 않는다.
   */
  it("무효화가 세 화면을 덮는다 — 설정의 워크플로 YAML도 이 값을 읽는다", async () => {
    await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ko" });
    expect(hoisted.revalidated).toContain("/projects/alpha");
  });

  /** `noop` — 현재 값을 다시 저장했다. 거부가 아니고, 쓸 것도 없다. */
  it("현재 base를 그대로 고르면 ok이지만 쓰지 않는다", async () => {
    expect(await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "en" })).toEqual({ ok: true });
    expect(db.spies.updateProject).not.toHaveBeenCalled();
  });

  /**
   * **되돌리는 경로다** (DESIGN §6.66: "B로 선언했다가 A로 다시 저장하면 대기가 사라진다").
   * 별도 취소 버튼을 두지 않는 근거가 이 케이스다.
   */
  it("대기 중에 현재 base를 다시 저장하면 선언이 비워진다 — 취소 버튼이 없는 이유다", async () => {
    await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "ko" });
    expect(db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale).toBe("ko");

    expect(await updateBaseLocale({ surfaceSlug: "default", slug: "alpha", baseLocale: "en" })).toEqual({ ok: true });
    expect(db.surfaces.find(s => s.projectId === "pA")!.declaredBaseLocale).toBeNull();
  });
});

it("동일한 기준 언어 선언을 재저장해도 사건이 늘지 않는다", async () => {
  await updateBaseLocale({ slug: "alpha", surfaceSlug: "default", baseLocale: "ko" });
  await updateBaseLocale({ slug: "alpha", surfaceSlug: "default", baseLocale: "ko" });
  expect(db.projectEvents).toHaveLength(1);
});

it("브랜치 사건의 before는 잠금 뒤 읽은 값이다", async () => {
  db.spies.executeRaw.mockImplementationOnce(async () => {
    alpha().baseBranch = "release";
    return 1;
  });
  await updateRepositorySettings({ slug: "alpha", baseBranch: "dev" });
  expect(db.projectEvents[0]?.payload).toMatchObject({ value: { before: "release", after: "dev" } });
});

it("기준 언어 커밋 뒤 캐시 예외가 저장 결과를 뒤집지 않는다", async () => {
  hoisted.failRevalidate = true;
  expect(await updateBaseLocale({ slug: "alpha", surfaceSlug: "default", baseLocale: "ko" })).toEqual({ ok: true });
});
