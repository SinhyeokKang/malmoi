import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeGitLabFetch, json } from "@/lib/gitlab/__tests__/fake-fetch";
import { createPublishExecution } from "@/lib/sync/execution";

/**
 * **경계의 GitLab 갈래** (`lib/repo-host/index.ts` — gitlab-repositories tasks §3). 확인하는 것:
 * - PAT는 **프로젝트가 참조하는 연결**(`{ connectionId }`)로만 연다 — 호출자 연결(`{ userId }`)이 아니다(design §5).
 * - 렌더 중 원격 조회가 공유 마감(`GITHUB_WAIT_MS`)을 쓴다 — 테스트는 `fast-github-wait`로 갈아 끼운다(POSTMORTEM 2026-10-02 — 타이머 위생).
 * - Publish 실행 수명(`execution.fetch()`)이 GitLab transport까지 간다.
 */

vi.mock("@/lib/github-wait", () => import("@/lib/__tests__/fast-github-wait"));
const open = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gitlab-connect/connection", () => ({ openGitLabConnection: open }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ marker: "prisma" }) }));

const { createGitClient, listBranches, loadConnectionHealth, openRepoReader } = await import("@/lib/repo-host");

const REPO = "87515176";
const P = `/projects/${REPO}`;
const TARGET = { host: "gitlab" as const, owner: "g/sub", name: "app", repositoryId: REPO, connectionId: "conn-ref" };
const META = { id: Number(REPO), path_with_namespace: "g/sub/app", default_branch: "main", archived: false, repository_object_format: "sha1" };

beforeEach(() => {
  open.mockReset().mockResolvedValue({ connectionId: "conn-ref", userId: "connector", gitlabUserId: "7", expiresAt: null, token: "glpat-connector" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("PAT는 프로젝트 참조 연결로만 연다", () => {
  it("createGitClient·openRepoReader·listBranches·loadConnectionHealth 모두 `{ connectionId }`로 열고 그 토큰을 싣는다", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, [`GET ${P}/repository/branches`]: { status: 200, body: [{ name: "main" }] }, [`GET ${P}/members/all/7`]: { status: 200, body: { id: 7, access_level: 30 } } });
    vi.stubGlobal("fetch", fake.fetch);
    await createGitClient(TARGET);
    await openRepoReader(TARGET);
    expect(await listBranches(TARGET)).toEqual({ status: "ok", names: ["main"], truncated: false });
    expect(await loadConnectionHealth({ status: "ok", target: TARGET })).toEqual({ status: "ok" });
    expect(open.mock.calls.map(([, by]) => by)).toEqual(Array(4).fill({ connectionId: "conn-ref" }));
    expect(fake.calls.every((call) => call.headers.get("PRIVATE-TOKEN") === "glpat-connector")).toBe(true);
  });

  it("참조가 가리키는 연결 행이 없으면(해제 경합) 원격 0 — 쓰기·읽기는 재연결 필요(not-installed), 건강성은 connection-removed, 브랜치 목록은 unavailable", async () => {
    open.mockResolvedValue(null);
    const fake = createFakeGitLabFetch({});
    vi.stubGlobal("fetch", fake.fetch);
    await expect(createGitClient(TARGET)).rejects.toMatchObject({ code: "not-installed" });
    await expect(openRepoReader(TARGET)).rejects.toMatchObject({ code: "not-installed" });
    expect(await listBranches(TARGET)).toEqual({ status: "unavailable" });
    expect(await loadConnectionHealth({ status: "ok", target: TARGET })).toEqual({ status: "connection-removed" });
    expect(fake.calls).toEqual([]);
  });

  it("⚠️ 저장된 만료일이 지났으면 건강성이 원격 0으로 connection-unusable", async () => {
    open.mockResolvedValue({ connectionId: "conn-ref", userId: "connector", gitlabUserId: "7", expiresAt: new Date("2000-01-01T00:00:00Z"), token: "glpat-connector" });
    const fake = createFakeGitLabFetch({});
    vi.stubGlobal("fetch", fake.fetch);
    expect(await loadConnectionHealth({ status: "ok", target: TARGET })).toEqual({ status: "connection-unusable" });
    expect(fake.calls).toEqual([]);
  });
});

describe("렌더 중 원격 조회의 마감 · 메모", () => {
  it("⚠️ 응답이 마감을 넘기면 unknown이다(끊김으로 접지 않는다) — 마감은 공유 상수(`GITHUB_WAIT_MS`)다", async () => {
    vi.stubGlobal("fetch", (() => new Promise<Response>(() => {})) as typeof fetch);
    expect(await loadConnectionHealth({ status: "ok", target: TARGET })).toEqual({ status: "unknown" });
  });

  it("Home·번역 메모: 같은 대상의 두 번째 확인은 원격 0 · unknown은 기억하지 않는다", async () => {
    let fail = true;
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: () => (fail ? json({}, 503) : json(META)), [`GET ${P}/members/all/7`]: { status: 200, body: { id: 7, access_level: 30 } } });
    vi.stubGlobal("fetch", fake.fetch);
    const target = { ...TARGET, connectionId: "conn-memo" };
    expect(await loadConnectionHealth({ status: "ok", target }, { memo: true })).toEqual({ status: "unknown" });
    fail = false;
    expect(await loadConnectionHealth({ status: "ok", target }, { memo: true })).toEqual({ status: "ok" });
    expect(await loadConnectionHealth({ status: "ok", target }, { memo: true })).toEqual({ status: "ok" });
    expect(fake.calls.filter((call) => call.url.pathname === `/api/v4${P}`)).toHaveLength(2);
    // 설정 화면(메모 끔)은 언제나 실물을 본다.
    await loadConnectionHealth({ status: "ok", target });
    expect(fake.calls.filter((call) => call.url.pathname === `/api/v4${P}`)).toHaveLength(3);
  });

  it("⚠️ 메모 키에 연결 참조가 든다 — 재연결(참조 교체) 직후 옛 판정이 새 연결에 붙지 않는다", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, [`GET ${P}/members/all/7`]: { status: 200, body: { id: 7, access_level: 30 } } });
    vi.stubGlobal("fetch", fake.fetch);
    await loadConnectionHealth({ status: "ok", target: { ...TARGET, connectionId: "conn-old" } }, { memo: true });
    await loadConnectionHealth({ status: "ok", target: { ...TARGET, connectionId: "conn-new" } }, { memo: true });
    expect(fake.calls.filter((call) => call.url.pathname === `/api/v4${P}`)).toHaveLength(2);
  });
});

describe("쓰기 클라이언트의 토큰 주인 권한 (R-C Astra 🟡1)", () => {
  const member = (level: number) => ({ [`GET ${P}/members/all/7`]: { status: 200, body: { id: 7, access_level: level, state: "active", membership_state: "active" } } });

  it("⚠️ Publish(실행 수명 있음)는 주인이 Reporter면 클라이언트를 열지 않는다 — 연결의 GitLab 사용자 id로 묻는다", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...member(20) });
    vi.stubGlobal("fetch", fake.fetch);
    await expect(createGitClient(TARGET, createPublishExecution())).rejects.toMatchObject({ code: "not-installed" });
    expect(fake.calls.map((call) => call.url.pathname)).toEqual([`/api/v4${P}`, `/api/v4${P}/members/all/7`]);
  });

  it("실행 수명 없는 클라이언트(열린 MR 게이트·원격 신호·미리보기)와 리더(Sync)는 권한을 묻지 않는다", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...member(20) });
    vi.stubGlobal("fetch", fake.fetch);
    await createGitClient(TARGET);
    await openRepoReader(TARGET);
    expect(fake.calls.filter((call) => call.url.pathname.includes("/members/all/"))).toEqual([]);
  });

  it("건강성은 주인 권한까지 본다 — Reporter면 connection-unusable", async () => {
    vi.stubGlobal("fetch", createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...member(20) }).fetch);
    expect(await loadConnectionHealth({ status: "ok", target: TARGET })).toEqual({ status: "connection-unusable" });
  });
});

describe("Publish 실행 수명", () => {
  it("createGitClient(target, execution)의 쓰기가 실행 수명에 세어진다", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, [`GET ${P}/members/all/7`]: { status: 200, body: { id: 7, access_level: 30 } }, [`DELETE ${P}/repository/branches/malmoi-i18n%2Fsync-app`]: { status: 204 } });
    vi.stubGlobal("fetch", fake.fetch);
    const execution = createPublishExecution();
    const client = await createGitClient(TARGET, execution);
    expect(execution.mutationDispatched).toBe(false);
    await client.resetSyncBranch("malmoi-i18n/sync-app", "base");
    expect(execution.mutationDispatched).toBe(true);
  });
});
