import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **외부 진입점의 실패가 진단 가능한 응답을 내야 한다.**
 *
 * 두 라우트의 호출자는 사람이 아니라 GitHub Actions와 Vercel Cron이고, 그쪽에 남는 것은
 * HTTP 응답뿐이다. 설정 누락이 **본문 없는 500**으로 나가면 로그에 원인이 없어 추측만 남는다 —
 * 2026-09-03 Vercel 첫 배포에서 실제로 그 상태였다(`ACTIVE_PROJECT_SLUG`가 `try` 밖이었다).
 *
 * ⚠️ 시크릿을 응답에 싣지 않는다. `requireEnv`의 메시지는 **변수 이름만** 담는다.
 */

const hoisted = vi.hoisted(() => ({
  triggerPull: vi.fn(),
  applyPush: vi.fn(),
  prisma: {
    project: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: hoisted.triggerPull }));
vi.mock("@/lib/push/apply", () => ({ applyPush: hoisted.applyPush }));

const { GET: pullGet } = await import("../pull/route");
const { POST: pushPost } = await import("../push/route");

const SECRET = "s".repeat(32);

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

const pushRequest = (body: unknown, token = SECRET) =>
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
  vi.stubEnv("PUSH_TOKEN", SECRET);
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("ACTIVE_PROJECT_SLUG", "acme");
});

describe("/api/pull — 실패가 본문을 갖는다", () => {
  it("ACTIVE_PROJECT_SLUG가 없으면 변수 이름이 담긴 500이다", async () => {
    vi.stubEnv("ACTIVE_PROJECT_SLUG", "");
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("ACTIVE_PROJECT_SLUG") });
  });

  it("triggerPull이 던지면 그 메시지가 담긴 500이다", async () => {
    hoisted.triggerPull.mockRejectedValue(new Error("GitHub App 토큰 발급 실패"));
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "GitHub App 토큰 발급 실패" });
  });

  it("정상 경로는 결과를 그대로 흘린다", async () => {
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "skipped", reason: "no-edits" });
  });
});

describe("/api/push — 실패가 본문을 갖는다", () => {
  it("ACTIVE_PROJECT_SLUG가 없으면 변수 이름이 담긴 500이다", async () => {
    vi.stubEnv("ACTIVE_PROJECT_SLUG", "");
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("ACTIVE_PROJECT_SLUG") });
  });

  it("DB 조회가 던지면 그 메시지가 담긴 500이다 — CI 로그에 원인이 남아야 한다", async () => {
    hoisted.prisma.project.findUnique.mockRejectedValue(new Error("Can't reach database server"));
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Can't reach database server" });
  });

  it("applyPush가 던지면 그 메시지가 담긴 500이다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", lastCommitAt: null });
    hoisted.applyPush.mockRejectedValue(new Error("unnest 인자 개수 불일치"));
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "unnest 인자 개수 불일치" });
  });

  it("기존 판정 응답은 500으로 삼켜지지 않는다 — 오배송은 409다", async () => {
    const res = await pushPost(pushRequest(payload({ projectSlug: "other" })));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "project mismatch", expected: "acme", got: "other" });
  });

  it("스키마 위반은 400이고 issues가 남는다", async () => {
    const res = await pushPost(pushRequest(payload({ keys: [] })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid payload");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("인증 실패는 그대로 401이다", async () => {
    const res = await pushPost(pushRequest(payload(), "wrong"));
    expect(res.status).toBe(401);
  });

  it("정상 경로는 결과를 낸다", async () => {
    hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", lastCommitAt: null });
    hoisted.applyPush.mockResolvedValue({
      inserted: 1, updated: 0, orphaned: 0, unorphaned: 0,
      staleTranslations: 0, translationsFilled: 0, refs: 0, plan: {},
    });
    const res = await pushPost(pushRequest(payload()));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ projectId: "p1", inserted: 1 });
  });
});
