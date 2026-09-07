import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/failure";
import { hashPushToken } from "@/lib/push/token";

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
    project: { findUnique: vi.fn() },
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
  // `PUSH_TOKEN`은 이제 push 라우트가 읽지 않는다 — `/api/pull`의 `CRON_SECRET`만 env다.
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("ACTIVE_PROJECT_SLUG", "acme");
  // 기본 stub: 어떤 해시로 조회하든 그 프로젝트를 돌려준다. 케이스마다 덮어쓴다.
  hoisted.prisma.project.findUnique.mockResolvedValue({ id: "p1", slug: "acme", lastCommitAt: null });
});

describe("/api/pull — 실패가 본문을 갖는다", () => {
  it("ACTIVE_PROJECT_SLUG가 없으면 변수 이름이 담긴 500이다", async () => {
    vi.stubEnv("ACTIVE_PROJECT_SLUG", "");
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("ACTIVE_PROJECT_SLUG") });
  });

  it("triggerPull이 던지면 ref가 담긴 500이고 메시지는 본문에 없다 — 전문은 서버 로그로 간다", async () => {
    // 2026-09-04 audit #15: 이 본문이 대상 리포 Actions 로그로 흘러가고 그 리포가 public일 수 있다.
    hoisted.triggerPull.mockRejectedValue(new Error("GitHub App 토큰 발급 실패"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal");
    expect(body.ref).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(body)).not.toContain("GitHub App");
    // 버리지 않는다 — 운영자가 그 ref로 Vercel 로그에서 찾는다.
    expect(spy.mock.calls[0]?.[0]).toContain("GitHub App 토큰 발급 실패");
    expect(spy.mock.calls[0]?.[0]).toContain(body.ref);
    spy.mockRestore();
  });

  it("우리 도메인 오류(AppError)는 메시지가 본문에 실린다 — 실물 500 진단에 Vercel 로그가 필요했다", async () => {
    // 2026-09-04 실측: 프로덕션이 `프로젝트를 찾을 수 없다: order-check`로 죽었는데 본문이
    // `{error:"internal",ref}`뿐이라 원인을 로그에서 찾아야 했다. slug는 시크릿이 아니고 CI가
    // 이미 입력으로 아는 값이다 (#15 후속).
    hoisted.triggerPull.mockRejectedValue(new AppError("프로젝트를 찾을 수 없다: order-check"));
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "프로젝트를 찾을 수 없다: order-check" });
  });

  it("정상 경로는 결과를 그대로 흘린다", async () => {
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    const res = await pullGet(pullRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "skipped", reason: "no-edits" });
  });
});

describe("/api/push — 토큰이 프로젝트를 정한다 (design §3.8)", () => {
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

  it("토큰을 발급받지 않은 프로젝트는 통과하지 못한다 — fail-closed (401이지 500이 아니다)", async () => {
    // `pushTokenHash`가 null인 행은 어떤 해시로도 조회되지 않는다 — 그 결과가 이 401이다.
    hoisted.prisma.project.findUnique.mockResolvedValue(null);
    const res = await pushPost(pushRequest(payload(), TOKEN));
    expect(res.status).toBe(401);
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

  it("스키마 위반은 400이고 issues가 남는다", async () => {
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
