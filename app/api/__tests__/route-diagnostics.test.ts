import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/failure";
import { hashPushToken } from "@/lib/push/token";

import { createHarness } from "../../(edit)/__tests__/harness";

/**
 * **외부 진입점의 실패가 진단 가능한 응답을 내야 한다.**
 *
 * 두 라우트의 호출자는 사람이 아니라 GitHub Actions와 Vercel Cron이고, 그쪽에 남는 것은
 * HTTP 응답뿐이다. 설정 누락이 **본문 없는 500**으로 나가면 로그에 원인이 없어 추측만 남는다 —
 * 2026-09-03 Vercel 첫 배포에서 실제로 그 상태였다(`ACTIVE_PROJECT_SLUG`가 `try` 밖이었다).
 *
 * ⚠️ **push의 인증은 2026-09-07부터 `Project.pushTokenHash` 조회다** (design §3.8). 토큰이 프로젝트를 정하고
 * slug는 그 뒤에 대조된다 — 페이로드 slug로 행을 찾으면 **오배송 페이로드가 인증 대상을 고른다.** 그래서
 * "토큰 없음"·"틀린 토큰"·"미발급 프로젝트"가 전부 401이고 **프로젝트 존재를 노출하지 않는다**(404가 사라졌다).
 *
 * ⚠️ 시크릿을 응답에 싣지 않는다. **우리가 문구를 정한 오류만**(`AppError`·`MissingEnvError`)
 * 본문에 실리고 남의 라이브러리 메시지는 `ref`로만 나간다 — 이 응답이 임의의 대상 리포
 * Actions 로그로 흘러가고 그 리포가 public일 수 있다 (ARCHITECTURE §6.0).
 */

const hoisted = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  runSync: vi.fn(),
  applyPush: vi.fn(),
  prisma: {
    translationSurface: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    // 보류 사전 집계(sync-edit-protection T7) — 0이면 기존 적재 경로다.
    translation: { count: vi.fn().mockResolvedValue(0) },
    // ⚠️ `findMany`가 없으면 pull 라우트가 TypeError로 죽는다 — 순회의 유일한 조회다.
    // ⚠️ `update`·`updateMany`는 임포트 진행 표시가 쓴다 (projects-list design §3.35) — 없으면
    // push 라우트가 적재에 닿기 전에 TypeError로 죽어 정상 경로가 통째로 500이 된다.
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
// 목록 둘의 무효화가 push 경로에 붙었다 (projects-list §3) — 테스트 환경에는 그 컨텍스트가 없다.
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock("@/lib/sync/run", () => ({ runSync: hoisted.runSync }));
// 라우트는 보호 적재(`applyProtectedPush`)를 부른다 — 여기서는 보류 판정 밖(적용 결과·오류 본문)을 보므로 applied로 감싼다.
// 보류 자체는 `lib/keys/__tests__/sync-edit-protection.integration.ts`가 실제 PostgreSQL로 잰다.
vi.mock("@/lib/push/apply", () => ({
  applyPush: hoisted.applyPush,
  applyProtectedPush: async (...args: unknown[]) => ({ status: "applied", outcome: await hoisted.applyPush(...args) }),
}));

const { GET: pullGet } = await import("../pull/route");
const { POST: pushPost } = await import("../push/route");

const SECRET = "s".repeat(32);
/** 그 프로젝트의 push 토큰 원문. 서버는 이 값의 sha256으로 행을 찾는다. */
const TOKEN = "push-token-original-value";

/** 스키마를 통과하는 최소 페이로드. */
const payload = (over: Record<string, unknown> = {}) => ({
  projectSlug: "acme",
  surfaceSlug: "default",
  commitSha: "a".repeat(40),
  commitAt: "2026-09-03T00:00:00+09:00",
  format: { adapter: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", nested: false, baseLocale: "en" },
  locales: ["en"],
  keys: [{ key: "a", sourceText: "A", namespace: "_root" }],
  translations: [],
  refs: [],
  ...over,
});

/**
 * 토큰 조회가 돌려주는 행. **포맷 컬럼 셋을 null로 든다** — Prisma는 `select`한 컬럼을 값이 없어도
 * null로 주고, 그 상태가 "아직 push가 채우지 않았다"다(`checkFormat`이 통과시키는 유일한 경우).
 * 가짜가 그 컬럼을 아예 빼면 실제보다 관대해져 **표면 교체 거부를 볼 수 없다**
 * (POSTMORTEM 2026-09-05 — 가짜가 실제 제약보다 관대하면 결함을 볼 수조차 없다).
 */
const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  slug: "acme",
  lastCommitAt: null,
  adapterName: null,
  pathTemplate: null,
  baseLocale: null,
  // ⚠️ **`null`이지 부재가 아니다** (7단계). `checkArchived`는 fail-closed라 `undefined`를 보관으로
  // 읽는데, 실제 Prisma는 `select`한 컬럼을 항상 값으로 준다 — 여기서 빼면 가짜가 실제보다 **엄격**해져
  // 정상 push가 전부 409로 보인다.
  archivedAt: null,
  ...over,
});

/** `createHarness`의 시드 포맷 (`harness.ts`의 `FORMAT`). 그 행에 보내는 페이로드는 이 표면이어야 한다. */
const HARNESS_FORMAT = {
  adapter: "json-catalog",
  pathTemplate: "i18n/{locale}.json",
  nested: false,
  baseLocale: "en",
};

const pushRequest = (body: unknown, token = TOKEN) =>
  new Request("https://x/api/push", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const pullRequest = (token = SECRET) =>
  new Request("https://x/api/pull", { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // `PUSH_TOKEN`은 이제 push 라우트가 읽지 않는다 — `/api/pull`의 `CRON_SECRET`만 env다.
  vi.stubEnv("CRON_SECRET", SECRET);
  // `ACTIVE_PROJECT_SLUG`는 stub하지 않는다 — 두 라우트 모두 그 값을 읽지 않게 됐다(T3·T4).
  // 죽은 stub을 남기면 "설정이 필요하다"는 인상이 테스트에 남는다.
  // ⚠️ **기본 stub은 fail-closed다** — "아무 토큰이나 인증 성공"을 기본값으로 두면 앞으로 추가되는 케이스가
  // 인증을 공짜로 통과하고, 그게 이 리포가 두 번 밟은 "가짜가 실제보다 관대하다"의 형태다
  // (POSTMORTEM 2026-09-05·2026-09-06). 인증이 필요한 케이스가 **명시적으로** 행을 준다.
  hoisted.prisma.project.findUnique.mockResolvedValue(null);
  hoisted.prisma.translationSurface.findFirst.mockImplementation(async () => {
    const row = await hoisted.prisma.project.findUnique.mock.results.at(-1)?.value;
    return row ? { ...row, id: "surface-p1", projectId: row.id, slug: "default" } : null;
  });
  // pull 순회의 기본값도 fail-closed다 — 대상을 안 준 케이스가 남의 프로젝트를 돌리지 않는다.
  hoisted.prisma.project.findMany.mockResolvedValue([]);
});

/**
 * 순회 대상이 되는 행 모양. `selectPullTargets`가 보는 컬럼만 있으면 된다.
 *
 * ⚠️ **`syncRuns`가 빈 배열이다** — "한 번도 안 돈 프로젝트가 맨 앞"이라 전부 동점이고, 그러면
 * 정렬이 slug로 떨어진다(7단계). 아래 순서 단언이 그 위에 서 있다.
 */
const ready = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  installationId: "1",
  surfaces: [{ archivedAt: null, lastCommitSha: "a".repeat(40) }],
  archivedAt: null,
  syncRuns: [] as { startedAt: Date }[],
});

describe("/api/pull — 전 프로젝트를 순회한다 (design §3.9)", () => {
  /**
   * ⚠️ **응답 모양이 `{ results, unprocessed }`다** (2026-09-09, sec-audit 발견 26). 전에는 배열
   * 자체였는데, 순회 상한이 붙으면서 **못 돈 수**를 실을 자리가 필요했다 — 항목으로 섞으면
   * `PullItem` 계약이 흔들리고 소비자가 그것을 프로젝트 하나로 센다. cron은 본문을 버리므로
   * 실질 소비자는 없지만, 계약이 바뀐 것은 사실이라 여기 적는다.
   */
  it("대상이 0개면 빈 결과 200이다 — 오류가 아니다", async () => {
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ results: [], unprocessed: 0 });
    expect(hoisted.runSync).not.toHaveBeenCalled();
  });

  it("준비된 프로젝트마다 한 번씩, `slug` 오름차순으로 부른다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("zulu"), ready("alpha")]);
    hoisted.runSync.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    expect(hoisted.runSync.mock.calls.map((c) => (c[1] as { slug: string }).slug)).toEqual(["alpha", "zulu"]);
    await expect(res.json()).resolves.toEqual({
      results: [
        { slug: "alpha", status: "skipped", reason: "no-edits" },
        { slug: "zulu", status: "skipped", reason: "no-edits" },
      ],
      unprocessed: 0,
    });
  });

  it("준비 안 된 프로젝트는 부르지 않는다 — 돌리면 `runPull`이 던져 매일 밤 로그를 채운다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([
      { ...ready("skillflo-web"), installationId: null, lastCommitSha: "deadbeef" },
      ready("order-check"),
    ]);
    hoisted.runSync.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    await pullGet(pullRequest());
    expect(hoisted.runSync.mock.calls.map((c) => (c[1] as { slug: string }).slug)).toEqual(["order-check"]);
  });

  it("한 프로젝트가 던져도 나머지가 돈다 — 그 항목만 `failed` + `ref`다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a"), ready("b"), ready("c")]);
    hoisted.runSync
      .mockResolvedValueOnce({ status: "skipped", reason: "no-edits" })
      .mockRejectedValueOnce(new Error("GitHub App 토큰 발급 실패"))
      .mockResolvedValueOnce({ status: "committed", commitSha: "abc", prUrl: "u", changed: [] });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pullGet(pullRequest());

    expect(res.status).toBe(200);
    const { results: body } = await res.json();
    expect(body).toHaveLength(3);
    expect(body[0]).toMatchObject({ slug: "a", status: "skipped" });
    expect(body[2]).toMatchObject({ slug: "c", status: "committed" });
    // 실패 항목: 전문은 본문에 없고 `ref`만 있다 (2026-09-04 audit #15).
    expect(body[1]).toMatchObject({ slug: "b", status: "failed" });
    expect(body[1].ref).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(body)).not.toContain("GitHub App");
    // 버리지 않는다 — 운영자가 그 ref로 Vercel 로그에서 찾는다.
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("GitHub App 토큰 발급 실패");
    expect(logged).toContain(body[1].ref);
    expect(logged).toContain("[pull:b]");
    spy.mockRestore();
  });

  it("우리 도메인 오류(AppError)는 그 항목의 메시지로 실린다 — slug·경로는 시크릿이 아니다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("order-check")]);
    hoisted.runSync.mockRejectedValue(new AppError("프로젝트를 찾을 수 없다: order-check"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      results: [{ slug: "order-check", status: "failed", error: "프로젝트를 찾을 수 없다: order-check" }],
      unprocessed: 0,
    });
    spy.mockRestore();
  });

  it("⚠️ **안전한 실패도 로그를 남긴다** — cron은 본문을 버리므로 로그가 유일한 신호다", async () => {
    // 응답이 200 배열이라 cron 실행은 성공으로 표시된다. `AppError` 갈래가 로그를 안 남기면
    // **전 프로젝트가 매일 밤 실패해도 관측값이 성공과 동일하다** (code-review 2026-09-07 🔴1 ·
    // POSTMORTEM 2026-09-06 "리다이렉트 횟수로 검증해 전면 장애를 정상으로 읽었다"와 같은 형태).
    // 2026-09-06 개인키 사고의 증상이 정확히 이 갈래였다: "base 브랜치를 읽을 수 없다".
    hoisted.prisma.project.findMany.mockResolvedValue([ready("order-check")]);
    hoisted.runSync.mockRejectedValue(new AppError("base 브랜치를 읽을 수 없다: main"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await pullGet(pullRequest());
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("[pull:order-check]");
    expect(logged).toContain("base 브랜치를 읽을 수 없다");
    spy.mockRestore();
  });

  it("순회 요약을 한 줄 남긴다 — '전 프로젝트 실패'가 로그 grep 하나로 잡혀야 한다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a"), ready("b")]);
    hoisted.runSync
      .mockResolvedValueOnce({ status: "skipped", reason: "no-edits" })
      .mockRejectedValueOnce(new AppError("base 브랜치를 읽을 수 없다: main"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await pullGet(pullRequest());
    const all = [...errSpy.mock.calls, ...logSpy.mock.calls].map((c) => String(c[0])).join("\n");
    expect(all).toMatch(/\[pull\].*2.*1/s);
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("Error가 아닌 값을 던져도 루프가 멈추지 않는다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a"), ready("b")]);
    hoisted.runSync
      .mockRejectedValueOnce("문자열 throw")
      .mockResolvedValueOnce({ status: "skipped", reason: "no-edits" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { results: body } = await (await pullGet(pullRequest())).json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ slug: "a", status: "failed" });
    expect(body[1]).toMatchObject({ slug: "b", status: "skipped" });
    spy.mockRestore();
  });

  it("`runSync`에 라우트가 만든 prisma 인스턴스를 넘긴다 — 두 클라이언트를 만들지 않는다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a")]);
    hoisted.runSync.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    await pullGet(pullRequest());
    expect(hoisted.runSync.mock.calls[0]?.[0]).toBe(hoisted.prisma);
  });

  it("`runSync`가 실패를 **값**으로 주면 그대로 배열에 남는다 — 던지는 경우와 구별한다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a")]);
    hoisted.runSync.mockResolvedValue({ status: "skipped", reason: "no-changes", warnings: ["w"] });
    await expect((await pullGet(pullRequest())).json()).resolves.toEqual({
      results: [{ slug: "a", status: "skipped", reason: "no-changes", warnings: ["w"] }],
      unprocessed: 0,
    });
  });

  it("조회 자체가 실패하면 500이다 — 순회 전이라 배열을 만들 수 없다", async () => {
    hoisted.prisma.project.findMany.mockRejectedValue(new Error("Can't reach database server at `pooler.supabase.com`"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "internal" });
    expect(JSON.stringify(body)).not.toContain("pooler.supabase.com");
    spy.mockRestore();
  });

  it("인증 실패는 그대로다 — 순회에 들어가지 않는다", async () => {
    const res = await pullGet(pullRequest("wrong"));
    expect(res.status).toBe(401);
    expect(hoisted.prisma.project.findMany).not.toHaveBeenCalled();
  });

  it("`CRON_SECRET`이 비어 있으면 500이고 순회하지 않는다 — fail-closed", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(500);
    expect(hoisted.prisma.project.findMany).not.toHaveBeenCalled();
  });

  it("서버 env `ACTIVE_PROJECT_SLUG`가 없어도 돈다 — cron이 그 값을 더 읽지 않는다", async () => {
    vi.stubEnv("ACTIVE_PROJECT_SLUG", "");
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a")]);
    hoisted.runSync.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    expect((await pullGet(pullRequest())).status).toBe(200);
  });
});

describe("/api/push — 토큰이 프로젝트를 정한다 (design §3.8)", () => {
  it("빈 토큰(`Bearer `)은 DB를 조회하지 않고 401이다 — 공짜 왕복을 내주지 않는다", async () => {
    const res = await pushPost(pushRequest(payload(), ""));
    expect(res.status).toBe(401);
    expect(hoisted.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("인증이 JSON 파싱보다 **먼저**다 — 무효 토큰 하나로 대용량 페이로드를 파싱시키지 않는다", async () => {
    // `maxDuration = 60`인 공개 엔드포인트다. 본문이 아예 JSON이 아니어도 인증 실패가 먼저 나와야 한다
    // (code-review 2026-09-07 🟡3 · design §3.8의 순서 그림).
    const res = await pushPost(
      new Request("https://x/api/push", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer bogus" },
        body: "{ this is not json",
      }),
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("헤더가 없으면 401이고 DB를 조회하지 않는다", async () => {
    const res = await pushPost(
      new Request("https://x/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      }),
    );
    expect(res.status).toBe(401);
    expect(hoisted.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("어느 프로젝트의 것도 아닌 토큰은 401이다 — 프로젝트 존재를 노출하지 않는다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(null);
    const res = await pushPost(pushRequest(payload(), "not-a-real-token"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthorized" });
    // 조회는 **해시**로 한다 — 원문이 쿼리에 실리지 않는다.
    expect(hoisted.prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pushTokenHash: hashPushToken("not-a-real-token") } }),
    );
  });

  it("토큰을 발급받지 않은 프로젝트는 통과하지 못한다 — 행이 **있는데도** 401이다 (fail-closed)", async () => {
    // ⚠️ 이 케이스만 메모리 DB를 쓴다. `mockResolvedValue(null)`로는 "틀린 토큰"과 바이트 단위로 같은 것을
    // 검사하게 되어 이름만 미발급이다 (code-review 2026-09-07 🟡2 · POSTMORTEM 2026-09-03 "테스트의 이름만").
    // 하네스는 `pushTokenHash`가 NULL인 행을 어떤 해시로도 돌려주지 않는다 — Postgres unique의 성질이다.
    const { prisma } = createHarness({ projects: [{ id: "p1", slug: "acme", pushTokenHash: null }] });
    hoisted.prisma.project.findUnique.mockImplementation(prisma.project.findUnique);
    const res = await pushPost(pushRequest(payload(), TOKEN));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    // 그 행은 실재한다 — slug로는 찾힌다. 그런데도 401인 것이 이 테스트의 요지다.
    await expect(prisma.project.findUnique({ where: { slug: "acme" } })).resolves.toMatchObject({ id: "p1" });
  });

  it("발급된 토큰은 그 행을 찾는다 — 하네스가 해시로 조회한다", async () => {
    const { prisma } = createHarness({
      projects: [{ id: "p1", slug: "acme", pushTokenHash: hashPushToken(TOKEN) }],
    });
    hoisted.prisma.project.findUnique.mockImplementation(prisma.project.findUnique);
    hoisted.applyPush.mockResolvedValue({
      inserted: 1, updated: 0, orphaned: 0, unorphaned: 0,
      staleTranslations: 0, translationsFilled: 0, refs: 0, plan: {},
    });
    // ⚠️ **하네스 프로젝트는 포맷이 채워진 행이다**(`json-catalog`·`i18n/{locale}.json`·`en`) — 그래서
    // 페이로드도 그 표면이어야 통과한다. 다른 것을 보내면 `checkFormat`이 409다(아래 describe).
    expect((await pushPost(pushRequest(payload({ format: HARNESS_FORMAT }), TOKEN))).status).toBe(200);
    // 다른 토큰은 같은 행을 못 찾는다.
    expect((await pushPost(pushRequest(payload({ format: HARNESS_FORMAT }), "another-token"))).status).toBe(401);
  });

  it("서버 env `PUSH_TOKEN`·`ACTIVE_PROJECT_SLUG`가 없어도 정상 동작한다 — 인증 근거가 DB로 옮겨갔다", async () => {
    vi.stubEnv("PUSH_TOKEN", "");
    vi.stubEnv("ACTIVE_PROJECT_SLUG", "");
    hoisted.prisma.project.findUnique.mockResolvedValue(project());
    hoisted.applyPush.mockResolvedValue({
      inserted: 1, updated: 0, orphaned: 0, unorphaned: 0,
      staleTranslations: 0, translationsFilled: 0, refs: 0, plan: {},
    });
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(200);
  });

  it("DB 접속 오류의 호스트·유저가 본문에 없다 — 대상 리포가 public이면 그 로그를 누구나 읽는다", async () => {
    hoisted.prisma.project.findUnique.mockRejectedValue(
      new Error("Can't reach database server at `aws-0-ap-northeast-1.pooler.supabase.com:5432`"),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "internal" });
    expect(JSON.stringify(body)).not.toContain("pooler.supabase.com");
    expect(spy.mock.calls[0]?.[0]).toContain("pooler.supabase.com");
    spy.mockRestore();
  });

  it("applyPush가 던지면 ref가 담긴 500이다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(project());
    hoisted.applyPush.mockRejectedValue(new Error("unnest 인자 개수 불일치"));
    hoisted.revalidatePath.mockClear();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "internal" });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/projects/new");
    spy.mockRestore();
  });

  it("오배송은 409다 — 기준이 서버 env가 아니라 **토큰의 프로젝트**다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(project());
    const res = await pushPost(pushRequest(payload({ projectSlug: "other" })));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "project mismatch", expected: "acme", got: "other" });
    // 오배송이면 적재까지 가지 않는다.
    expect(hoisted.applyPush).not.toHaveBeenCalled();
  });

  /**
   * **보관 중 CI push는 409** (7단계 — sync-runs design §4, 결정 9). 대상 리포 CI가 red가 되는 것은
   * 의도된 신호다 — 워크플로를 떼라는 뜻이고, 조용히 200을 주면 보관이 "멈춘다"를 뜻하지 않게 된다.
   */
  it("보관된 프로젝트는 409다 — 오배송·표면 검사보다 앞이다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(
      project({ archivedAt: new Date("2026-09-10T00:00:00Z") }),
    );
    // 오배송 페이로드를 보내도 보관이 먼저 답한다 — 멈춘 프로젝트에서는 그것이 답할 질문이 아니다.
    const res = await pushPost(pushRequest({ ...payload(), projectSlug: "other" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "archived" });
    expect(hoisted.applyPush).not.toHaveBeenCalled();
  });

  it("역행은 409다 — 판정은 그대로다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(project({ lastCommitAt: new Date("2026-09-05T00:00:00Z") }));
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "stale commit" });
    expect(hoisted.applyPush).not.toHaveBeenCalled();
  });

  it("네 실패가 각자 다른 응답을 낸다 — 401 / 401 / 409 / 409", async () => {
    // 무헤더·잘못된 토큰은 위에서 각각 401을 냈고, 여기서는 그 넷이 서로 접히지 않는지만 본다.
    hoisted.prisma.project.findUnique.mockResolvedValue(null);
    const noToken = await pushPost(pushRequest(payload(), "zzz"));
    hoisted.prisma.project.findUnique.mockResolvedValue(project());
    const misrouted = await pushPost(pushRequest(payload({ projectSlug: "other" })));
    expect([noToken.status, misrouted.status]).toEqual([401, 409]);
  });

  it("스키마 위반은 400이고 issues가 남는다 — 인증을 통과한 뒤의 400이다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(project());
    const res = await pushPost(pushRequest(payload({ keys: [] })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid payload");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("틀린 토큰은 401이고 적재까지 가지 않는다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(null);
    const res = await pushPost(pushRequest(payload(), "wrong"));
    expect(res.status).toBe(401);
    expect(hoisted.applyPush).not.toHaveBeenCalled();
  });

  /**
   * **확정한 번역 표면을 CI가 갈아치우지 못한다** (2026-09-07). `applyPush`가 페이로드 포맷으로
   * `Project`의 컬럼 셋을 덮으므로, 자동 후보의 YAML(=`adapter:` 없음)로 도는 CI가 1순위 표면을
   * 보내면 2순위를 확정한 프로젝트의 키가 **전부 orphan된다.** 되돌릴 수 없어 409다.
   */
  describe("포맷 교체 거부 (checkFormat)", () => {
    // ⚠️ `declaredBaseLocale`을 빼지 않는다 — 라우트의 `select`가 그 컬럼을 들고 있으므로, mock이
    // 그것을 생략하면 가짜가 실제보다 **좁아져** 응답 본문의 그 필드가 조용히 사라진다 (6b-3).
    const STORED = {
      adapterName: "code-dict",
      pathTemplate: "src/i18n/{locale}.ts",
      baseLocale: "en",
      declaredBaseLocale: null,
    };
    const stored = (over: Record<string, unknown> = {}) => project({ ...STORED, ...over });

    it("저장된 표면과 다른 어댑터는 409이고 적재까지 가지 않는다", async () => {
      hoisted.prisma.project.findUnique.mockResolvedValue(stored());
      const res = await pushPost(pushRequest(payload({ format: HARNESS_FORMAT })));
      expect(res.status).toBe(409);
      // CI 로그에서 무엇을 고쳐야 하는지 보여야 한다 — 이미 그 프로젝트의 토큰을 든 호출자다.
      await expect(res.json()).resolves.toMatchObject({
        error: "format mismatch",
        // 선언도 싣는다 — 대기 중이면 그 값도 받아들여지므로 CI 로그에 보여야 한다 (6b-3).
        expected: {
          adapter: "code-dict",
          pathTemplate: "src/i18n/{locale}.ts",
          baseLocale: "en",
          declaredBaseLocale: null,
        },
        got: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" },
      });
      expect(hoisted.applyPush).not.toHaveBeenCalled();
    });

    it("기준 로케일만 달라도 409다 — 키 집합이 바뀌어 진짜 base의 키가 빠진다", async () => {
      hoisted.prisma.project.findUnique.mockResolvedValue(stored({ baseLocale: "ko" }));
      const res = await pushPost(
        pushRequest(
          payload({
            format: { adapter: "code-dict", pathTemplate: "src/i18n/{locale}.ts", nested: false, baseLocale: "en" },
          }),
        ),
      );
      expect(res.status).toBe(409);
      expect(hoisted.applyPush).not.toHaveBeenCalled();
    });

    it("같은 표면이면 통과한다 — 판정이 항상 거부하지 않는다", async () => {
      hoisted.prisma.project.findUnique.mockResolvedValue(stored());
      hoisted.applyPush.mockResolvedValue({
        inserted: 1, updated: 0, orphaned: 0, unorphaned: 0,
        staleTranslations: 0, translationsFilled: 0, refs: 0, plan: {},
      });
      const res = await pushPost(
        pushRequest(
          payload({
            format: { adapter: "code-dict", pathTemplate: "src/i18n/{locale}.ts", nested: false, baseLocale: "en" },
          }),
        ),
      );
      expect(res.status).toBe(200);
    });

    it("포맷 컬럼이 비어 있으면 통과한다 — 첫 push가 그 값을 채우는 것이 옛 계약이다", async () => {
      hoisted.prisma.project.findUnique.mockResolvedValue(project());
      hoisted.applyPush.mockResolvedValue({
        inserted: 1, updated: 0, orphaned: 0, unorphaned: 0,
        staleTranslations: 0, translationsFilled: 0, refs: 0, plan: {},
      });
      expect((await pushPost(pushRequest(payload()))).status).toBe(200);
    });

    it("오배송(slug)이 포맷보다 먼저 판정된다 — 토큰과 slug가 어긋난 것이 더 근본적이다", async () => {
      hoisted.prisma.project.findUnique.mockResolvedValue(stored());
      const res = await pushPost(pushRequest(payload({ projectSlug: "other", format: HARNESS_FORMAT })));
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({ error: "project mismatch" });
    });
  });

  it("정상 경로는 결과를 낸다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue(project());
    hoisted.applyPush.mockResolvedValue({
      inserted: 1, updated: 0, orphaned: 0, unorphaned: 0,
      staleTranslations: 0, translationsFilled: 0, refs: 0, plan: {},
    });
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ projectId: "p1", inserted: 1 });
  });
});
