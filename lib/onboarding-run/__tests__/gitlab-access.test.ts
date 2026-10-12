import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createFakeGitLabFetch, type FakeRoute } from "@/lib/gitlab/__tests__/fake-fetch";

/**
 * **호출자 GitLab 권한의 생산자 갈래** (audit E3). 순수 판정(`planProjectMeta`·`planMemberAccess`)은 따로 잰다 — 여기서는 실제 transport·fetch를 지나
 * switch 매핑과 `requirePush && archived` 순서를 잰다. 연결은 mock이고 GitLab은 가짜 전역 fetch다(`checkGitLabAccess`는 fetch를 주입받지 않는다).
 */
const h = vi.hoisted(() => ({ openGitLabConnection: vi.fn(), logFailure: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/gitlab-connect/connection", () => ({ openGitLabConnection: h.openGitLabConnection }));
vi.mock("@/lib/github-connect/log", () => ({ logFailure: h.logFailure }));
vi.mock("@/lib/github", () => ({ probeRepo: vi.fn() }));
vi.mock("@/lib/github-connect/token-store", () => ({ ensureUserToken: vi.fn() }));
vi.mock("@/lib/github-connect/user", () => ({ listInstallationRepos: vi.fn(), listUserInstallations: vi.fn() }));
const { checkRepoAccess } = await import("../access");

const REPO = "87515176";
const prisma = {} as PrismaClient;
const connection = { connectionId: "c-caller", userId: "u1", gitlabUserId: "202", expiresAt: null as Date | null, token: "glpat-caller" };

beforeEach(() => {
  h.openGitLabConnection.mockReset().mockResolvedValue(connection);
  h.logFailure.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function projectBody(meta: Partial<{ archived: boolean; format: string }> = {}) {
  return { id: Number(REPO), path_with_namespace: "group/sub/app", default_branch: "main", archived: meta.archived ?? false, repository_object_format: meta.format ?? "sha1" };
}
function routes(project: FakeRoute, member: FakeRoute = { status: 200, body: { id: 202, access_level: 40 } }) {
  const fake = createFakeGitLabFetch({ [`GET /projects/${REPO}`]: project, [`GET /projects/${REPO}/members/all/202`]: member });
  vi.stubGlobal("fetch", fake.fetch);
  return fake;
}
const check = (requirePush: boolean) => checkRepoAccess(prisma, "u1", { host: "gitlab", repositoryId: REPO }, { requirePush });

describe("checkGitLabAccess — 생산자 갈래", () => {
  it("Maintainer면 ok — 호출자 자신의 연결 id와 확인한 주소를 싣고, 호출자 PAT로 묻는다", async () => {
    const fake = routes({ status: 200, body: projectBody() });
    expect(await check(true)).toEqual({ status: "ok", host: "gitlab", connectionId: "c-caller", repositoryId: REPO, repoOwner: "group/sub", repoName: "app", defaultBranch: "main" });
    expect(h.openGitLabConnection).toHaveBeenCalledWith(prisma, { userId: "u1" });
    expect(fake.calls.map((call) => call.headers.get("PRIVATE-TOKEN"))).toEqual(["glpat-caller", "glpat-caller"]);
  });

  it("⚠️ 보관된 프로젝트는 쓰기 검사만 거부한다(members/all 0회) — 읽기 검사는 통과시키고 보관 거부는 프로젝트 연결의 리더가 든다", async () => {
    const write = routes({ status: 200, body: projectBody({ archived: true }) });
    expect(await check(true)).toEqual({ status: "rejected", error: "gitlab-repo-archived" });
    expect(write.calls).toHaveLength(1);
    routes({ status: 200, body: projectBody({ archived: true }) });
    expect(await check(false)).toMatchObject({ status: "ok", host: "gitlab" });
  });

  it("SHA-256 리포는 gitlab-repo-unsupported다 — 권한을 묻지 않는다", async () => {
    const fake = routes({ status: 200, body: projectBody({ format: "sha256" }) });
    expect(await check(false)).toEqual({ status: "rejected", error: "gitlab-repo-unsupported" });
    expect(fake.calls).toHaveLength(1);
  });

  it("⚠️ 호출자 PAT 401은 gitlab-reconnect다 — 일시 장애로 접지 않는다 · 404는 repo-forbidden(못 보는 것)", async () => {
    routes({ status: 401, body: { message: "401 Unauthorized" } });
    expect(await check(true)).toEqual({ status: "rejected", error: "gitlab-reconnect" });
    routes({ status: 404, body: { message: "404 Project Not Found" } });
    expect(await check(true)).toEqual({ status: "rejected", error: "repo-forbidden" });
  });

  it("members/all 5xx는 unavailable, 401은 gitlab-reconnect, Developer는 쓰기에서 repo-read-only다", async () => {
    routes({ status: 200, body: projectBody() }, { status: 503 });
    expect(await check(true)).toEqual({ status: "rejected", error: "unavailable" });
    routes({ status: 200, body: projectBody() }, { status: 401 });
    expect(await check(true)).toEqual({ status: "rejected", error: "gitlab-reconnect" });
    routes({ status: 200, body: projectBody() }, { status: 200, body: { id: 202, access_level: 30 } });
    expect(await check(true)).toEqual({ status: "rejected", error: "repo-read-only" });
  });

  it("저장 만료·연결 없음·연결 열기 실패는 원격 0이다", async () => {
    const fake = routes({ status: 200, body: projectBody() });
    h.openGitLabConnection.mockResolvedValueOnce({ ...connection, expiresAt: new Date("2020-01-01T00:00:00Z") });
    expect(await check(false)).toEqual({ status: "rejected", error: "gitlab-reconnect" });
    h.openGitLabConnection.mockResolvedValueOnce(null);
    expect(await check(false)).toEqual({ status: "rejected", error: "gitlab-not-connected" });
    h.openGitLabConnection.mockRejectedValueOnce(new Error("envelope"));
    expect(await check(false)).toEqual({ status: "rejected", error: "unavailable" });
    expect(fake.calls).toEqual([]);
  });
});
