import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createFakeGitLabFetch, json, type FakeCall } from "@/lib/gitlab/__tests__/fake-fetch";

/**
 * **①의 GitLab 리포 목록** (audit E1). MCP 단위 테스트는 이 코어를 통째로 mock하고 통합 테스트는 한 페이지 성공·연결 없음만 밟는다 — 여기서 페이지·상한·
 * 중간 실패·재인가·모양 오류·질의 필터·판정 순서를 잰다. 연결·상한 판정은 mock이고 GitLab은 가짜 fetch다(주소 계약을 함께 잰다).
 */
const h = vi.hoisted(() => ({ openGitLabConnection: vi.fn(), projectLimitReached: vi.fn(), logFailure: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/gitlab-connect/connection", () => ({ openGitLabConnection: h.openGitLabConnection }));
vi.mock("../repos", () => ({ projectLimitReached: h.projectLimitReached }));
vi.mock("@/lib/github-connect/log", () => ({ logFailure: h.logFailure }));
const { listGitLabRepositories } = await import("../gitlab-repos");

const prisma = {} as PrismaClient;
const subject = { userId: "u1", credential: { kind: "session" } } as never;
const connection = { connectionId: "c1", userId: "u1", gitlabUserId: "42", expiresAt: null as Date | null, token: "glpat-caller" };

beforeEach(() => {
  h.openGitLabConnection.mockReset().mockResolvedValue(connection);
  h.projectLimitReached.mockReset().mockResolvedValue(false);
  h.logFailure.mockReset();
});

const row = (id: number, path = `group/app-${id}`) => ({ id, path_with_namespace: path, last_activity_at: "2026-10-01T00:00:00Z" });
/** `page` 질의마다 응답을 고른다 — 마지막 페이지는 `x-next-page`가 비었다. */
function pages(answer: (page: number, call: FakeCall) => Response) {
  return createFakeGitLabFetch({ "GET /projects": (call) => answer(Number(call.url.searchParams.get("page")), call) });
}

describe("listGitLabRepositories — 성공", () => {
  it("여러 페이지를 `x-next-page`로 끝까지 읽고 호출자 PAT를 헤더에 싣는다 · Maintainer 이상·보관 제외·id 순 필터", async () => {
    const fake = pages((page) => (page === 1 ? json([row(1), row(2)], 200, { "x-next-page": "2" }) : json([row(3, "a/b/deep")], 200, { "x-next-page": "" })));
    const result = await listGitLabRepositories(prisma, subject, { fetch: fake.fetch });
    expect(result).toEqual({
      ok: true,
      truncated: false,
      repos: [
        { repositoryId: "1", fullName: "group/app-1", owner: "group", name: "app-1", lastActivityAt: "2026-10-01T00:00:00Z" },
        { repositoryId: "2", fullName: "group/app-2", owner: "group", name: "app-2", lastActivityAt: "2026-10-01T00:00:00Z" },
        { repositoryId: "3", fullName: "a/b/deep", owner: "a/b", name: "deep", lastActivityAt: "2026-10-01T00:00:00Z" },
      ],
    });
    expect(h.openGitLabConnection).toHaveBeenCalledWith(prisma, { userId: "u1" });
    expect(fake.calls.map((call) => call.url.searchParams.get("page"))).toEqual(["1", "2"]);
    const [first] = fake.calls;
    expect(Object.fromEntries(first!.url.searchParams)).toEqual({
      membership: "true", min_access_level: "40", archived: "false", simple: "true", order_by: "id", sort: "asc", per_page: "100", page: "1",
    });
    expect(first!.headers.get("PRIVATE-TOKEN")).toBe("glpat-caller");
  });

  it("경로에 네임스페이스가 없는 행은 건너뛴다", async () => {
    const fake = pages(() => json([row(1, "noslash"), row(2)]));
    const result = await listGitLabRepositories(prisma, subject, { fetch: fake.fetch });
    expect(result.ok && result.repos.map((repo) => repo.repositoryId)).toEqual(["2"]);
  });

  it("⚠️ 20쪽에서 멈추고 `truncated`로 말한다 — 21쪽째를 부르지 않는다", async () => {
    const fake = pages((page) => json([row(page)], 200, { "x-next-page": String(page + 1) }));
    const result = await listGitLabRepositories(prisma, subject, { fetch: fake.fetch });
    expect(fake.calls).toHaveLength(20);
    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(result.ok && result.repos).toHaveLength(20);
  });
});

describe("listGitLabRepositories — 실패", () => {
  it("⚠️ 중간 페이지 실패는 목록 전체 실패다 — 이미 읽은 행을 성공으로 돌려주지 않는다", async () => {
    const fake = pages((page) => (page === 1 ? json([row(1)], 200, { "x-next-page": "2" }) : json({ message: "503" }, 503)));
    expect(await listGitLabRepositories(prisma, subject, { fetch: fake.fetch })).toEqual({ ok: false, error: "unavailable" });
    expect(fake.calls).toHaveLength(2);
  });

  it("401·`insufficient_scope`는 재연결이고 그 밖의 403은 일시 장애다", async () => {
    const cases = [
      [json({ message: "401 Unauthorized" }, 401), "gitlab-reconnect"],
      [json({ error: "insufficient_scope" }, 403), "gitlab-reconnect"],
      [json({ message: "403 Forbidden" }, 403), "unavailable"],
    ] as const;
    for (const [response, error] of cases) {
      expect(await listGitLabRepositories(prisma, subject, { fetch: pages(() => response.clone()).fetch }), String(response.status)).toEqual({ ok: false, error });
    }
  });

  it("모양이 다른 응답은 일시 장애다 — 배열이 아니거나 id가 없는 행", async () => {
    for (const body of [{ projects: [] }, [{ path_with_namespace: "a/b" }], [{ id: "1", path_with_namespace: "a/b" }]]) {
      expect(await listGitLabRepositories(prisma, subject, { fetch: pages(() => json(body)).fetch }), JSON.stringify(body)).toEqual({ ok: false, error: "unavailable" });
    }
  });
});

describe("listGitLabRepositories — 판정 순서(원격 0)", () => {
  it("상한이 연결보다 먼저다 — 연결을 열지 않고 GitLab을 부르지 않는다", async () => {
    h.projectLimitReached.mockResolvedValue(true);
    const fake = pages(() => json([]));
    expect(await listGitLabRepositories(prisma, subject, { fetch: fake.fetch })).toEqual({ ok: false, error: "limit-reached" });
    expect(h.openGitLabConnection).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);
  });

  it("상한 조회·연결 열기 실패는 일시 장애, 연결 없음은 `gitlab-not-connected`, 저장 만료는 `gitlab-reconnect`다", async () => {
    const fake = pages(() => json([]));
    h.projectLimitReached.mockRejectedValueOnce(new Error("db down"));
    expect(await listGitLabRepositories(prisma, subject, { fetch: fake.fetch })).toEqual({ ok: false, error: "unavailable" });
    h.openGitLabConnection.mockRejectedValueOnce(new Error("envelope"));
    expect(await listGitLabRepositories(prisma, subject, { fetch: fake.fetch })).toEqual({ ok: false, error: "unavailable" });
    h.openGitLabConnection.mockResolvedValueOnce(null);
    expect(await listGitLabRepositories(prisma, subject, { fetch: fake.fetch })).toEqual({ ok: false, error: "gitlab-not-connected" });
    h.openGitLabConnection.mockResolvedValueOnce({ ...connection, expiresAt: new Date("2020-01-01T00:00:00Z") });
    expect(await listGitLabRepositories(prisma, subject, { fetch: fake.fetch })).toEqual({ ok: false, error: "gitlab-reconnect" });
    expect(fake.calls).toEqual([]);
  });
});
