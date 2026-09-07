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
  triggerPull: vi.fn(),
  applyPush: vi.fn(),
  prisma: {
    // ⚠️ `findMany`가 없으면 pull 라우트가 TypeError로 죽는다 — 순회의 유일한 조회다.
    project: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: hoisted.triggerPull }));
vi.mock("@/lib/push/apply", () => ({ applyPush: hoisted.applyPush }));

const { GET: pullGet } = await import("../pull/route");
const { POST: pushPost } = await import("../push/route");

const SECRET = "s".repeat(32);
/** 그 프로젝트의 push 토큰 원문. 서버는 이 값의 sha256으로 행을 찾는다. */
const TOKEN = "push-token-original-value";

/** 스키마를 통과하는 최소 페이로드. */
const payload = (over: Record<string, unknown> = {}) => ({
  projectSlug: "acme",
  commitSha: "a".repeat(40),
  commitAt: "2026-09-03T00:00:00+09:00",
  format: { adapter: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", nested: false, baseLocale: "en" },
  locales: ["en"],
  keys: [{ key: "a", sourceText: "A", namespace: "_root" }],
  translations: [],
  refs: [],
  ...over,
});

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
  // pull 순회의 기본값도 fail-closed다 — 대상을 안 준 케이스가 남의 프로젝트를 돌리지 않는다.
  hoisted.prisma.project.findMany.mockResolvedValue([]);
});

/** 순회 대상이 되는 행 모양. `selectPullTargets`가 보는 세 컬럼만 있으면 된다. */
const ready = (slug: string) => ({ slug, installationId: "1", lastCommitSha: "a".repeat(40) });

describe("/api/pull — 전 프로젝트를 순회한다 (design §3.9)", () => {
  it("대상이 0개면 빈 배열 200이다 — 오류가 아니다", async () => {
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
    expect(hoisted.triggerPull).not.toHaveBeenCalled();
  });

  it("준비된 프로젝트마다 한 번씩, `slug` 오름차순으로 부른다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("zulu"), ready("alpha")]);
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    expect(hoisted.triggerPull.mock.calls.map((c) => c[1])).toEqual(["alpha", "zulu"]);
    await expect(res.json()).resolves.toEqual([
      { slug: "alpha", status: "skipped", reason: "no-edits" },
      { slug: "zulu", status: "skipped", reason: "no-edits" },
    ]);
  });

  it("준비 안 된 프로젝트는 부르지 않는다 — 돌리면 `runPull`이 던져 매일 밤 로그를 채운다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([
      { slug: "skillflo-web", installationId: null, lastCommitSha: "deadbeef" },
      ready("order-check"),
    ]);
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    await pullGet(pullRequest());
    expect(hoisted.triggerPull.mock.calls.map((c) => c[1])).toEqual(["order-check"]);
  });

  it("한 프로젝트가 던져도 나머지가 돈다 — 그 항목만 `failed` + `ref`다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a"), ready("b"), ready("c")]);
    hoisted.triggerPull
      .mockResolvedValueOnce({ status: "skipped", reason: "no-edits" })
      .mockRejectedValueOnce(new Error("GitHub App 토큰 발급 실패"))
      .mockResolvedValueOnce({ status: "committed", commitSha: "abc", prUrl: "u", changed: [] });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pullGet(pullRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
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
    hoisted.triggerPull.mockRejectedValue(new AppError("프로젝트를 찾을 수 없다: order-check"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      { slug: "order-check", status: "failed", error: "프로젝트를 찾을 수 없다: order-check" },
    ]);
    spy.mockRestore();
  });

  it("⚠️ **안전한 실패도 로그를 남긴다** — cron은 본문을 버리므로 로그가 유일한 신호다", async () => {
    // 응답이 200 배열이라 cron 실행은 성공으로 표시된다. `AppError` 갈래가 로그를 안 남기면
    // **전 프로젝트가 매일 밤 실패해도 관측값이 성공과 동일하다** (code-review 2026-09-07 🔴1 ·
    // POSTMORTEM 2026-09-06 "리다이렉트 횟수로 검증해 전면 장애를 정상으로 읽었다"와 같은 형태).
    // 2026-09-06 개인키 사고의 증상이 정확히 이 갈래였다: "base 브랜치를 읽을 수 없다".
    hoisted.prisma.project.findMany.mockResolvedValue([ready("order-check")]);
    hoisted.triggerPull.mockRejectedValue(new AppError("base 브랜치를 읽을 수 없다: main"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await pullGet(pullRequest());
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("[pull:order-check]");
    expect(logged).toContain("base 브랜치를 읽을 수 없다");
    spy.mockRestore();
  });

  it("순회 요약을 한 줄 남긴다 — '전 프로젝트 실패'가 로그 grep 하나로 잡혀야 한다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a"), ready("b")]);
    hoisted.triggerPull
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
    hoisted.triggerPull
      .mockRejectedValueOnce("문자열 throw")
      .mockResolvedValueOnce({ status: "skipped", reason: "no-edits" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await pullGet(pullRequest())).json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ slug: "a", status: "failed" });
    expect(body[1]).toMatchObject({ slug: "b", status: "skipped" });
    spy.mockRestore();
  });

  it("`triggerPull`에 라우트가 만든 prisma 인스턴스를 넘긴다 — 두 클라이언트를 만들지 않는다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a")]);
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    await pullGet(pullRequest());
    expect(hoisted.triggerPull.mock.calls[0]?.[0]).toBe(hoisted.prisma);
  });

  it("`triggerPull`이 실패를 **값**으로 주면 그대로 배열에 남는다 — 던지는 경우와 구별한다", async () => {
    hoisted.prisma.project.findMany.mockResolvedValue([ready("a")]);
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-changes", warnings: ["w"] });
    await expect((await pullGet(pullRequest())).json()).resolves.toEqual([
      { slug: "a", status: "skipped", reason: "no-changes", warnings: ["w"] },
    ]);
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
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
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
    expect((await pushPost(pushRequest(payload(), TOKEN))).status).toBe(200);
    // 다른 토큰은 같은 행을 못 찾는다.
    expect((await pushPost(pushRequest(payload(), "another-token"))).status).toBe(401);
  });

  it("서버 env `PUSH_TOKEN`·`ACTIVE_PROJECT_SLUG`가 없어도 정상 동작한다 — 인증 근거가 DB로 옮겨갔다", async () => {
    vi.stubEnv("PUSH_TOKEN", "");
    vi.stubEnv("ACTIVE_PROJECT_SLUG", "");
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", slug: "acme", lastCommitAt: null });
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
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", slug: "acme", lastCommitAt: null });
    hoisted.applyPush.mockRejectedValue(new Error("unnest 인자 개수 불일치"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "internal" });
    spy.mockRestore();
  });

  it("오배송은 409다 — 기준이 서버 env가 아니라 **토큰의 프로젝트**다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", slug: "acme", lastCommitAt: null });
    const res = await pushPost(pushRequest(payload({ projectSlug: "other" })));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "project mismatch", expected: "acme", got: "other" });
    // 오배송이면 적재까지 가지 않는다.
    expect(hoisted.applyPush).not.toHaveBeenCalled();
  });

  it("역행은 409다 — 판정은 그대로다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue({
      id: "p1", slug: "acme", lastCommitAt: new Date("2026-09-05T00:00:00Z"),
    });
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "stale commit" });
    expect(hoisted.applyPush).not.toHaveBeenCalled();
  });

  it("네 실패가 각자 다른 응답을 낸다 — 401 / 401 / 409 / 409", async () => {
    // 무헤더·잘못된 토큰은 위에서 각각 401을 냈고, 여기서는 그 넷이 서로 접히지 않는지만 본다.
    hoisted.prisma.project.findUnique.mockResolvedValue(null);
    const noToken = await pushPost(pushRequest(payload(), "zzz"));
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", slug: "acme", lastCommitAt: null });
    const misrouted = await pushPost(pushRequest(payload({ projectSlug: "other" })));
    expect([noToken.status, misrouted.status]).toEqual([401, 409]);
  });

  it("스키마 위반은 400이고 issues가 남는다 — 인증을 통과한 뒤의 400이다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", slug: "acme", lastCommitAt: null });
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

  it("정상 경로는 결과를 낸다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", slug: "acme", lastCommitAt: null });
    hoisted.applyPush.mockResolvedValue({
      inserted: 1, updated: 0, orphaned: 0, unorphaned: 0,
      staleTranslations: 0, translationsFilled: 0, refs: 0, plan: {},
    });
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ projectId: "p1", inserted: 1 });
  });
});
