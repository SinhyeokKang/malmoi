import { afterEach, describe, expect, it, vi } from "vitest";

import { blobSha } from "@/lib/githash";
import { PR_TITLE, SKIP_MARKER, pullRequestBody } from "@/lib/pull/payload";
import type { RenderKey } from "@/lib/pull/render";
import { closedPrComment, runPull, type PullDeps, type PullState } from "@/lib/pull/run";
import { createPublishExecution, planPublishFailure } from "@/lib/sync/execution";
import { classifySyncError } from "@/lib/sync/plan";

import { createGitLabClient } from "../client";
import { createFakeGitLabRepo, type FakeMergeRequest, type FakeRepoOptions } from "./fake-repo";

/**
 * **GitLab Publish 계약** (gitlab-repositories tasks §3 — 쓰기·MR 생명주기·변경 없음 경로). 실제 `runPull`이 실제 GitLab 클라이언트(`createGitLabClient`)를 상태를 가진 가짜 리포
 * 위에서 부른다 — 판정은 `runPull` 한 벌이고 GitLab 사본이 없다(design §3 "같은 판정의 GitLab 사본을 만들지 않는다").
 */

const REPO = "87515176";
const SYNC = "malmoi-i18n/sync-app";
const BASE = "b".repeat(40);
const EN = '{\n  "a.one": "one"\n}\n';
const KO = '{\n  "a.one": "하나"\n}\n';
const KO_OLD = '{\n  "a.one": "옛"\n}\n';
const KEYS: RenderKey[] = [{ key: "a.one", sourceText: "one", orphaned: false, cells: { ko: { value: "하나" }, en: { value: "one" } } }];

const PROJECT = {
  id: "p1", slug: "app", repoOwner: "g/sub", repoName: "app", baseBranch: "main", repoHost: "gitlab", installationId: null, repositoryId: REPO, gitlabConnectionId: "conn-1",
  adapterName: "json-catalog", pathTemplate: "locales/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en", basePath: null, lastPulledAt: null as Date | null,
};

function state(unpublished = 1): PullState {
  return {
    project: { ...PROJECT },
    surfaces: [{ ...PROJECT, id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: KEYS }],
    maxUpdatedAt: unpublished === 0 ? null : new Date("2026-10-12T10:00:00Z"), unpublished, pendingEdits: [],
  };
}

const ownMr = (over: Partial<FakeMergeRequest> = {}): FakeMergeRequest => ({
  iid: 1, title: PR_TITLE, source_branch: SYNC, target_branch: "main", state: "opened", source_project_id: Number(REPO), target_project_id: Number(REPO),
  web_url: "https://gitlab.com/g/sub/app/-/merge_requests/1", ...over,
});

function setup(over: Partial<FakeRepoOptions> = {}, options: { state?: PullState; fetch?: (repoFetch: typeof fetch) => typeof fetch; requireWrite?: boolean } = {}) {
  const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: { "locales/en.json": EN, "locales/ko.json": KO_OLD } }, ...over });
  const order: string[] = [];
  const saved: { prUrl?: string }[] = [];
  const traced: typeof fetch = async (input, init) => {
    order.push((init?.method ?? "GET").toUpperCase());
    return repo.fetch(input, init);
  };
  const deps: PullDeps = {
    loadState: async () => options.state ?? state(),
    createClient: (target) => {
      if (target.host !== "gitlab") throw new Error("unexpected host");
      return createGitLabClient(target, { token: "glpat-connector", expiresAt: null, gitlabUserId: "101" }, { fetch: options.fetch?.(traced) ?? traced, requireWrite: options.requireWrite });
    },
    saveLastPulledAt: async (_id, _at, published) => { saved.push(published ?? {}); },
    invalidateDelivery: async () => { order.push("invalidate"); },
    syncBranch: SYNC,
  };
  const firstWriteAfterInvalidate = () => {
    const firstWrite = order.findIndex((entry) => entry !== "GET" && entry !== "invalidate");
    return firstWrite === -1 || (order.indexOf("invalidate") !== -1 && order.indexOf("invalidate") < firstWrite);
  };
  return { repo, deps, order, saved, firstWriteAfterInvalidate };
}

const write = (repo: ReturnType<typeof createFakeGitLabRepo>) => repo.writes().map((call) => `${call.method} ${decodeURIComponent(call.url.pathname.replace(/^\/api\/v4\/projects\/\d+/, ""))}`);

afterEach(() => { vi.useRealTimers(); });

describe("변경 없음 경로의 쓰기 0 (ARCHITECTURE §2 — 1층·2층)", () => {
  it("1층: 미전달 0이면 GitLab을 한 번도 부르지 않는다 — 클라이언트 생성의 GET /projects/<id>도 없다", async () => {
    const { repo, deps } = setup({}, { state: state(0) });
    expect(await runPull(deps)).toEqual({ status: "skipped", reason: "no-edits" });
    expect(repo.calls).toEqual([]);
  });

  it("2층: 렌더가 base와 같고 sync 브랜치가 없으면 commit API 0 · 쓰기 0(읽기만)", async () => {
    const { repo, deps, saved } = setup({ commits: { [BASE]: { "locales/en.json": EN, "locales/ko.json": KO } } });
    expect(await runPull(deps)).toEqual({ status: "skipped", reason: "no-changes" });
    expect(repo.writes()).toEqual([]);
    expect(saved).toEqual([{}]);
  });
});

describe("커밋 — 고정 base 위 스냅샷 + MR 하나", () => {
  it("첫 실행: 커밋 parent = 캡처한 base · 변경 외 파일 blob 불변 · MR 생성 1회 · 링크 저장 · 첫 쓰기는 무효화 뒤", async () => {
    const { repo, deps, saved, firstWriteAfterInvalidate } = setup();
    const result = await runPull(deps);
    expect(result).toMatchObject({ status: "committed", pr: "created", prUrl: "https://gitlab.com/g/sub/app/-/merge_requests/1", changed: ["locales/ko.json"] });
    expect(write(repo)).toEqual(["POST /repository/commits", "POST /merge_requests"]);
    const head = repo.branches.get(SYNC)!;
    expect(repo.parents.get(head)).toBe(BASE);
    expect(blobSha(repo.commits.get(head)!.get("locales/en.json")!)).toBe(blobSha(EN));
    expect(repo.commits.get(head)!.get("locales/ko.json")).toBe(KO);
    expect(repo.mergeRequests.filter((mr) => mr.state === "opened")).toHaveLength(1);
    expect(saved).toEqual([{ prUrl: "https://gitlab.com/g/sub/app/-/merge_requests/1" }]);
    expect(firstWriteAfterInvalidate()).toBe(true);
    expect(repo.calls[0]?.url.pathname).toBe(`/api/v4/projects/${REPO}`);
    // ⚠️ GraphQL(POST)은 Publish 실행 안에서 부르지 않는다 — 쓰기로 세어진다(design §3 `sizes`).
    expect(repo.calls.some((call) => call.url.pathname.endsWith("/graphql"))).toBe(false);
  });

  it("두 번째 실행: 열린 MR을 재사용한다 — MR POST 0, 커밋 parent는 여전히 base(옛 sync head가 아니다)", async () => {
    const first = setup();
    await runPull(first.deps);
    const previous = first.repo.branches.get(SYNC)!;
    first.repo.reset();
    const again = await runPull(first.deps);
    expect(again).toMatchObject({ status: "committed", pr: "updated", prUrl: "https://gitlab.com/g/sub/app/-/merge_requests/1" });
    expect(write(first.repo)).toEqual(["POST /repository/commits"]);
    expect(first.repo.parents.get(first.repo.branches.get(SYNC)!)).toBe(BASE);
    expect(first.repo.branches.get(SYNC)).not.toBe(previous);
  });

  it("재사용 MR의 제목에 마커가 없으면 제목만, base가 바뀌었으면 target_branch만 PUT — 같으면 PUT 0", async () => {
    // 설명은 삭제를 말하지 않는다 — 이 스냅샷에도 삭제가 없어 설명을 다시 쓰지 않는다(아래 "열린 MR 본문 갱신").
    const { repo, deps } = setup({ mergeRequests: [ownMr({ title: "sync translations", target_branch: "develop", description: pullRequestBody([{ path: "locales/ko.json", kind: "updated" }]) })], branches: { main: BASE, [SYNC]: BASE } });
    await runPull(deps);
    const puts = repo.writes().filter((call) => call.method === "PUT").map((call) => JSON.parse(call.body!));
    expect(puts).toEqual([{ title: `sync translations ${SKIP_MARKER}` }, { target_branch: "main" }]);
    repo.reset();
    await runPull(deps);
    expect(repo.writes().filter((call) => call.method === "PUT")).toEqual([]);
  });

  it("⚠️ 동명 fork MR만 있으면 재사용하지 않고 자기 MR을 연다 — fork MR은 건드리지 않는다", async () => {
    const fork = ownMr({ iid: 5, source_project_id: 999, web_url: "https://gitlab.com/someone/app/-/merge_requests/5" });
    const { repo, deps } = setup({ mergeRequests: [fork] });
    const result = await runPull(deps);
    expect(result).toMatchObject({ status: "committed", pr: "created" });
    expect(write(repo)).toEqual(["POST /repository/commits", "POST /merge_requests"]);
    expect(repo.mergeRequests.find((mr) => mr.iid === 5)).toMatchObject({ state: "opened", title: PR_TITLE });
  });
});

describe("no-changes 수렴 — 닫기 → sync 브랜치 삭제 (D9)", () => {
  it("되돌린 편집: 무효화 → 이유 노트 → 닫기 → 브랜치 삭제 순서 · 두 번째 실행은 외부 쓰기 0", async () => {
    const stale = "s".repeat(40);
    const { repo, deps, order, firstWriteAfterInvalidate } = setup({
      branches: { main: BASE, [SYNC]: stale },
      commits: { [BASE]: { "locales/en.json": EN, "locales/ko.json": KO }, [stale]: { "locales/en.json": EN, "locales/ko.json": KO_OLD } },
      mergeRequests: [ownMr()],
    });
    const result = await runPull(deps);
    expect(result).toEqual({ status: "skipped", reason: "no-changes", closedPr: { number: 1, url: "https://gitlab.com/g/sub/app/-/merge_requests/1" } });
    expect(write(repo)).toEqual(["POST /merge_requests/1/notes", "PUT /merge_requests/1", `DELETE /repository/branches/${SYNC}`]);
    expect(repo.notes).toEqual([{ iid: 1, body: closedPrComment("main", "gitlab") }]);
    expect(repo.mergeRequests.filter((mr) => mr.state === "opened")).toHaveLength(0);
    expect(repo.branches.has(SYNC)).toBe(false);
    expect(firstWriteAfterInvalidate()).toBe(true);
    expect(order.filter((entry) => entry === "invalidate")).toHaveLength(1);

    repo.reset();
    expect(await runPull(deps)).toEqual({ status: "skipped", reason: "no-changes" });
    expect(repo.writes()).toEqual([]);
  });

  it("⚠️ fork MR만 있으면 닫지 않는다 — 자기 sync 브랜치만 지운다", async () => {
    const stale = "s".repeat(40);
    const { repo, deps } = setup({
      branches: { main: BASE, [SYNC]: stale },
      commits: { [BASE]: { "locales/en.json": EN, "locales/ko.json": KO }, [stale]: { "locales/en.json": EN } },
      mergeRequests: [ownMr({ iid: 5, source_project_id: 999 })],
    });
    expect(await runPull(deps)).toEqual({ status: "skipped", reason: "no-changes" });
    expect(write(repo)).toEqual([`DELETE /repository/branches/${SYNC}`]);
  });

  it("닫기가 실패하면 브랜치를 지우지 않고 던진다 — 확정도 없다(다음 실행이 같은 판정을 다시 한다)", async () => {
    const stale = "s".repeat(40);
    const { repo, deps, saved } = setup({
      branches: { main: BASE, [SYNC]: stale },
      commits: { [BASE]: { "locales/en.json": EN, "locales/ko.json": KO }, [stale]: { "locales/en.json": EN } },
      mergeRequests: [ownMr()],
      failOn: [{ key: "PUT /merge_requests/:n", status: 500 }],
    });
    await expect(runPull(deps)).rejects.toThrow();
    expect(repo.branches.has(SYNC)).toBe(true);
    expect(saved).toEqual([]);
  });
});

describe("토큰 주인의 쓰기 권한 — 쓰기 전에 막는다 (R-C Astra 🟡1)", () => {
  it("⚠️ Reporter로 강등된 주인: 클라이언트 생성에서 멈춘다 — 무효화·쓰기·확정 0(편집 토큰 보존)", async () => {
    const { repo, deps, order, saved } = setup({ members: { 101: 20 } }, { requireWrite: true });
    await expect(runPull(deps)).rejects.toMatchObject({ code: "not-installed" });
    expect(repo.writes()).toEqual([]);
    expect(order).not.toContain("invalidate");
    expect(saved).toEqual([]);
  });

  it("⚠️ no-changes 정리(닫기·브랜치 삭제)도 같은 문에서 멈춘다", async () => {
    const stale = "s".repeat(40);
    const { repo, deps } = setup({
      members: { 101: 20 }, branches: { main: BASE, [SYNC]: stale },
      commits: { [BASE]: { "locales/en.json": EN, "locales/ko.json": KO }, [stale]: { "locales/en.json": EN } }, mergeRequests: [ownMr()],
    }, { requireWrite: true });
    await expect(runPull(deps)).rejects.toMatchObject({ code: "not-installed" });
    expect(repo.writes()).toEqual([]);
    expect(repo.branches.has(SYNC)).toBe(true);
  });

  it("Developer 주인 + 보호 브랜치(403)는 정상 연결의 Publish 실패다 — 사전 검사를 지나 커밋 POST에서 실패한다", async () => {
    const { repo, deps } = setup({ members: { 101: 30 }, failOn: [{ key: "POST /repository/commits", status: 403 }] }, { requireWrite: true });
    await expect(runPull(deps)).rejects.toThrow(/403/);
    expect(write(repo)).toEqual(["POST /repository/commits"]);
  });
});

describe("실패 — 성공으로 확정하지 않는다 · 재시도 0", () => {
  it.each([
    ["MR 생성 5xx(결과 애매)", { key: "POST /merge_requests", status: 502 }, 1],
    ["MR 생성 409(이미 열린 MR — 응답 유실 뒤)", { key: "POST /merge_requests", status: 409 }, 1],
  ])("%s → 던지고 MR POST는 %i회 · 전달 확인 없음", async (_label, failOn, posts) => {
    const { repo, deps, saved } = setup({ failOn: [failOn] });
    await expect(runPull(deps)).rejects.toThrow();
    expect(repo.writes().filter((call) => call.method === "POST" && call.url.pathname.endsWith("/merge_requests"))).toHaveLength(posts);
    expect(saved).toEqual([]);
  });

  it.each([
    ["토큰 만료·철회(401)", 401],
    ["보호 브랜치·보관 프로젝트(403)", 403],
    ["보호 브랜치 force 금지(400)", 400],
  ])("커밋 %s → 한 번만 보내고 던진다 — MR을 열지 않는다", async (_label, status) => {
    const { repo, deps, saved } = setup({ failOn: [{ key: "POST /repository/commits", status }] });
    await expect(runPull(deps)).rejects.toThrow();
    expect(write(repo)).toEqual(["POST /repository/commits"]);
    expect(saved).toEqual([]);
  });

  it("⚠️ 쓰기 뒤 실패는 결과 미확인(execution-uncertain)이다 — Publish 실행 수명을 지난다(POSTMORTEM 2026-10-09)", async () => {
    const execution = createPublishExecution();
    const { deps, repo } = setup({ failOn: [{ key: "POST /merge_requests", status: 502 }] }, { fetch: (f) => execution.fetch(f) });
    const error = await execution.run(() => runPull(deps)).catch((caught: unknown) => caught);
    expect(execution.mutationDispatched).toBe(true);
    expect(planPublishFailure(classifySyncError(error).code, execution.mutationDispatched)).toBe("execution-uncertain");
    expect(repo.writes().filter((call) => call.url.pathname.endsWith("/merge_requests"))).toHaveLength(1);
  });

  it("쓰기 전 실패(클라이언트 생성 401)는 결과 미확인이 아니다 — 리포에 아무것도 안 보냈다", async () => {
    const execution = createPublishExecution();
    const { deps } = setup({ failOn: [{ key: "GET ", status: 401 }] }, { fetch: (f) => execution.fetch(f) });
    const error = await execution.run(() => runPull(deps)).catch((caught: unknown) => caught);
    expect(execution.mutationDispatched).toBe(false);
    expect(planPublishFailure(classifySyncError(error).code, execution.mutationDispatched)).toBe("not-installed");
  });

  it("⚠️ 예산이 끝난 뒤에는 새 전송이 0건이다 — 커밋 응답이 늦게 와도 MR을 열지 않는다(늦은 성공이 이어지지 않는다)", async () => {
    vi.useFakeTimers();
    const execution = createPublishExecution();
    const { deps, repo } = setup({}, {
      fetch: (f) => execution.fetch(async (input, init) => {
        const response = await f(input, init);
        // 커밋이 리포에 닿은 뒤 응답이 예산을 넘겨 도착한다.
        if (init?.method === "POST") vi.setSystemTime(Date.now() + 240_000);
        return response;
      }),
    });
    await expect(execution.run(() => runPull(deps))).rejects.toThrow();
    expect(execution.mutationDispatched).toBe(true);
    expect(repo.writes().map((call) => call.url.pathname.split("/").slice(-2).join("/"))).toEqual(["repository/commits"]);
  });
});

/**
 * **delete 계약** (locale-add design §2 Publish 변경 union) — 명시적 delete가 실제 GitLab 클라이언트를 지나 상태를 가진 가짜 리포에서 그 파일만 지운다.
 * Chrome 디렉터리 레이아웃(`_locales/<code>/messages.json`)에서 같은 디렉터리의 다른 파일은 남아야 한다.
 */
describe("delete — 대상 파일만 지운다", () => {
  const CHROME = { "_locales/en/messages.json": EN, "_locales/ko/messages.json": KO_OLD, "_locales/ko/notes.txt": "keep\n", "src/app.ts": "x\n" };
  const open = (repo: ReturnType<typeof createFakeGitLabRepo>) =>
    createGitLabClient({ host: "gitlab", owner: "g/sub", name: "app", repositoryId: REPO, connectionId: "conn-1" }, { token: "glpat-connector", expiresAt: null, gitlabUserId: "101" }, { fetch: repo.fetch });

  it("삭제만 있는 스냅샷도 커밋된다 — 대상만 사라지고 같은 디렉터리의 다른 파일·나머지 리포는 그대로다", async () => {
    const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: CHROME } });
    const git = await open(repo);
    const head = await git.publishSnapshot({ branch: SYNC, baseSha: BASE, summary: "1 file", changes: [{ kind: "delete", path: "_locales/ko/messages.json" }] });
    const files = repo.commits.get(head)!;
    expect([...files.keys()].sort()).toEqual(["_locales/en/messages.json", "_locales/ko/notes.txt", "src/app.ts"]);
    expect(repo.parents.get(head)).toBe(BASE);
    const body = JSON.parse(repo.writes()[0]!.body!) as { actions: unknown[] };
    expect(body.actions).toEqual([{ action: "delete", file_path: "_locales/ko/messages.json" }]);
  });

  it("upsert와 delete가 한 커밋에 같이 간다", async () => {
    const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: CHROME } });
    const head = await (await open(repo)).publishSnapshot({ branch: SYNC, baseSha: BASE, summary: "2 files", changes: [
      { kind: "upsert", path: "_locales/en/messages.json", content: KO, inBase: true },
      { kind: "delete", path: "_locales/ko/messages.json" },
    ] });
    expect(repo.commits.get(head)!.get("_locales/en/messages.json")).toBe(KO);
    expect(repo.commits.get(head)!.has("_locales/ko/messages.json")).toBe(false);
    expect(repo.commits.get(head)!.get("_locales/ko/notes.txt")).toBe("keep\n");
  });

  it("없는 파일의 delete는 GitLab처럼 400이다 — 계획(`planPullChanges`)이 base에 있는 경로만 delete로 내는 이유다", async () => {
    const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: CHROME } });
    await expect((await open(repo)).publishSnapshot({ branch: SYNC, baseSha: BASE, summary: "1 file", changes: [{ kind: "delete", path: "_locales/fr/messages.json" }] })).rejects.toThrow();
    expect(repo.branches.has(SYNC)).toBe(false);
  });
});

/**
 * **열린 MR을 갱신하는 Publish도 정리 안내를 싣는다** (locale-add R-B2 Y3 — spec 수락 기준 7). 보통은 이미 열린 Publish MR 위로 제거가 얹힌다.
 * 본문이 같으면 다시 쓰지 않는다(매 실행 PUT을 만들지 않는다).
 */
describe("열린 MR 본문 갱신 — 삭제 정리 안내", () => {
  const removing = (): PullState => ({ ...state(0), surfaces: [{ ...state(0).surfaces[0]!,
    localeChanges: { rows: [{ localeCode: "ko", operation: "REMOVE", requestedAt: new Date(0) }], valueCounts: new Map(), delivered: [], work: 1 } }] });

  it("열린 MR + 새 삭제 → MR 설명에 (removed)와 앱 코드 정리 안내", async () => {
    const { repo, deps } = setup({ mergeRequests: [ownMr({ description: "Updated 1 file from the translation DB.\n\n- `locales/ko.json`" })] }, { state: removing() });
    expect(await runPull(deps)).toMatchObject({ status: "committed", pr: "updated" });
    const description = repo.mergeRequests[0]?.description ?? "";
    expect(description).toContain("- `locales/ko.json` (removed)");
    expect(description).toMatch(/app code/);
  });

  it("설명이 이미 같으면 PUT하지 않는다", async () => {
    const body = "Updated 1 file from the translation DB.\n\n- `locales/ko.json` (removed)\n\nThis snapshot removes 1 language file. Before merging, remove references to that language in the app code (language lists, imports, routing) so the app does not load a missing catalog.\n\nThis branch is a snapshot, not a history: it is force-updated on every pull.";
    const { repo, deps } = setup({ mergeRequests: [ownMr({ description: body })] }, { state: removing() });
    await runPull(deps);
    expect(write(repo).filter(call => call.startsWith("PUT /merge_requests"))).toEqual([]);
  });

  // 사람이 고친 설명을 덮지 않는다(B2 fix2) — 삭제 집합이 바뀔 때만 다시 쓴다.
  const HUMAN = "Reviewer notes: please double-check the Korean wording before merging.";
  it("사람이 고친 설명 + 삭제 변화 없음 → PUT 0", async () => {
    const { repo, deps } = setup({ mergeRequests: [ownMr({ description: HUMAN })] });
    expect(await runPull(deps)).toMatchObject({ status: "committed", pr: "updated" });
    expect(write(repo).filter(call => call.startsWith("PUT /merge_requests"))).toEqual([]);
    expect(repo.mergeRequests[0]?.description).toBe(HUMAN);
  });
  it("사람이 고친 설명 + 새 삭제 → 정리 안내", async () => {
    const { repo, deps } = setup({ mergeRequests: [ownMr({ description: HUMAN })] }, { state: removing() });
    await runPull(deps);
    expect(repo.mergeRequests[0]?.description).toContain("- `locales/ko.json` (removed)");
    expect(repo.mergeRequests[0]?.description).toMatch(/app code/);
  });
  it("삭제가 취소되면 정리 안내를 뺀다", async () => {
    const stated = pullRequestBody([{ path: "locales/ko.json", kind: "removed" }]);
    const { repo, deps } = setup({ mergeRequests: [ownMr({ description: stated })] });
    await runPull(deps);
    const description = repo.mergeRequests[0]?.description ?? "";
    expect(description).not.toMatch(/\(removed\)|app code/);
    expect(description).toContain("- `locales/ko.json`");
  });
});
