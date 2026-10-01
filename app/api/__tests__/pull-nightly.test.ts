import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NIGHTLY_IMPORT_START_MS } from "@/lib/pull/targets";
import { createFakeGitClient, type FakeGitOptions } from "@/lib/pull/__tests__/fake-client";
import type { GitClient } from "@/lib/pull/client";

/**
 * **야간 판정의 갈래별 GitHub 호출** (nightly-sync E1). 실제 `runNightly`를 돌리고 GitHub·Publish·적재만 가짜로 둔다 —
 * "하지 않는 호출"(트리·blob·PR 목록 0회)이 완료 조건이라 호출을 세는 가짜(`fake-client`)가 판정의 근거다.
 *
 * ⚠️ head → PR은 **순차**다 — `Promise.all`이면 head가 끝나기 전에 PR 목록이 불린다(POSTMORTEM 2026-09-13). 호출 순서만으로는
 * 둘을 못 가른다(둘 다 기록 순서가 같다) — head를 붙잡아 둔 채 PR 조회가 없는지를 본다.
 */

const HEAD = "c".repeat(40);
const OLD = "a".repeat(40);

type Row = ReturnType<typeof row>;
const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  pending: {} as Record<string, number>,
  events: [] as Record<string, unknown>[],
  visits: [] as { id: string; lastNightlyAt: Date }[],
  restores: [] as { where: Record<string, unknown>; data: { lastNightlyAt: Date | null } }[],
  surfaceFailures: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
  clients: {} as Record<string, GitClient>,
  createGitClient: vi.fn(),
  openRepoReader: vi.fn(),
  runSync: vi.fn(),
  runAutomationImport: vi.fn(),
  closeExpiredImportRuns: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const db = {
    project: {
      findMany: async () => state.rows,
      update: async ({ where, data }: { where: { id: string }; data: { lastNightlyAt: Date } }) => {
        state.visits.push({ id: where.id, lastNightlyAt: data.lastNightlyAt });
        return {};
      },
      updateMany: async (args: { where: Record<string, unknown>; data: { lastNightlyAt: Date | null } }) => {
        state.restores.push(args);
        return { count: 1 };
      },
    },
    translation: { count: async ({ where }: { where: { projectId: string } }) => state.pending[where.projectId] ?? 0 },
    projectEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { state.events.push(data); return data; } },
    // base 브랜치 부재의 표면 실패 기록(#155) — 사건과 같은 트랜잭션이다.
    translationSurface: { updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { state.surfaceFailures.push(args); return { count: 1 }; } },
    $transaction: async <T,>(run: (tx: unknown) => Promise<T>) => run(db),
  };
  return { getPrisma: () => db };
});
vi.mock("@/lib/github", () => ({ createGitClient: state.createGitClient, openRepoReader: state.openRepoReader }));
vi.mock("@/lib/sync/run", () => ({ runSync: state.runSync }));
vi.mock("@/lib/import/run", () => ({ runAutomationImport: state.runAutomationImport, closeExpiredImportRuns: state.closeExpiredImportRuns }));
// 마감만 짧은 실물 사본 — 이긴 뒤 타이머를 끈다(손 사본이 안 꺼서 파일 뒤에 로그가 나갔다, PR #171).
vi.mock("@/lib/github-wait", () => import("@/lib/__tests__/fast-github-wait"));

const { GET } = await import("../pull/route");

function row(slug: string, over: { lastCommitSha?: string } = {}) {
  return {
    id: `id-${slug}`, slug, repoOwner: "o", repoName: slug, baseBranch: "main", installationId: "77", repositoryId: `r-${slug}`,
    archivedAt: null, lastNightlyAt: null,
    surfaces: [{ id: `s-${slug}`, slug: "default", archivedAt: null, lastCommitSha: over.lastCommitSha ?? OLD, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastImportError: null }],
  };
}

/** 프로젝트(리포 이름)마다 가짜 클라이언트. `override`로 메서드 하나를 바꾼다(느린 head·매달린 PR 조회). */
function client(rowOf: Row, options: FakeGitOptions, override: Partial<GitClient> = {}) {
  const fake = createFakeGitClient({ refSha: { "heads/main": HEAD }, ...options });
  state.clients[rowOf.repoName] = { ...fake.client, ...override };
  return fake.calls;
}

async function call() {
  const response = await GET(new Request("http://localhost/api/pull", { headers: { authorization: "Bearer cron" } }));
  expect(response.status).toBe(200);
  return (await response.json()) as { results: Record<string, unknown>[]; unprocessed: number };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "cron");
  state.rows = [];
  state.pending = {};
  state.events = [];
  state.visits = [];
  state.restores = [];
  state.surfaceFailures = [];
  state.clients = {};
  state.createGitClient.mockImplementation(async (_owner: string, repo: string) => {
    const found = state.clients[repo];
    if (found === undefined) throw new Error(`no fake client: ${repo}`);
    return found;
  });
  state.runSync.mockResolvedValue({ status: "skipped", reason: "no-edits" });
  state.runAutomationImport.mockResolvedValue({ recorded: true, result: "imported", deferReason: null });
  state.closeExpiredImportRuns.mockResolvedValue(0);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("갈래별 호출", () => {
  it("미전달 편집 → Publish: GitHub 0회 · runSync(trigger cron) · 사건은 runSync 몫", async () => {
    const p = row("edits");
    state.rows = [p];
    state.pending[p.id] = 2;
    const { results } = await call();
    expect(results).toEqual([{ slug: "edits", action: "publish", status: "skipped", reason: "no-edits" }]);
    expect(state.createGitClient).not.toHaveBeenCalled();
    expect(state.runSync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectId: p.id, slug: "edits", trigger: "cron", requestedBy: null }));
    expect(state.events).toEqual([]);
  });

  it("head가 같음 → upToDate: getRefSha 1회 · PR 목록·트리·blob 0회 · SyncRun 없음 · nightly.skip 한 행", async () => {
    const p = row("same", { lastCommitSha: HEAD });
    state.rows = [p];
    const calls = client(p, {});
    const { results } = await call();
    expect(results).toEqual([{ slug: "same", action: "skip", outcome: "upToDate" }]);
    expect(calls.map((c) => c.method)).toEqual(["getRefSha"]);
    expect(calls[0]?.args).toEqual(["heads/main"]);
    expect(state.runSync).not.toHaveBeenCalled();
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ kind: "IMPORT", subtype: "nightly.skip", actorKind: "AUTOMATION", result: "upToDate",
      payload: expect.objectContaining({ source: "nightly", surfaceSlugs: ["default"], deferReason: null }) });
  });

  it("head가 다름 · PR 없음 → 적재: head 뒤 PR 조회, 같은 행의 리포 신원을 넘긴다", async () => {
    const p = row("moved");
    state.rows = [p];
    const calls = client(p, {});
    const { results } = await call();
    expect(results).toEqual([{ slug: "moved", action: "import", recorded: true, result: "imported", deferReason: null }]);
    expect(calls.map((c) => c.method)).toEqual(["getRefSha", "findOpenPr"]);
    expect(calls[1]?.args).toEqual(["o:malmoi-i18n/sync-moved"]);
    expect(state.createGitClient).toHaveBeenCalledTimes(1);
    expect(state.runAutomationImport).toHaveBeenCalledWith(expect.anything(), {
      projectId: p.id, repository: { repositoryId: "r-moved", installationId: "77", repoOwner: "o", repoName: "moved", baseBranch: "main" },
    }, expect.any(Function));
    // 적재 사건은 적재가 쓴다 — 이 방문이 따로 쓰지 않는다(방문마다 최대 하나).
    expect(state.events).toEqual([]);
  });

  it("⚠️ head 조회가 끝나기 전에는 PR 목록을 부르지 않는다 — Promise.all이 아니다", async () => {
    const p = row("sequential");
    state.rows = [p];
    let release!: (sha: string) => void;
    const calls = client(p, {}, { getRefSha: () => new Promise<string | null>((resolve) => { release = resolve; }) });
    const pending = call();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.filter((c) => c.method === "findOpenPr")).toHaveLength(0);
    release(HEAD);
    await pending;
    expect(calls.filter((c) => c.method === "findOpenPr")).toHaveLength(1);
  });

  it("열린 PR → skip deferred open-pr, 적재 0회", async () => {
    const p = row("open");
    state.rows = [p];
    client(p, { openPr: { url: "https://github.com/o/open/pull/3", number: 3, title: "t" } });
    const { results } = await call();
    expect(results).toEqual([{ slug: "open", action: "skip", outcome: "deferred", reason: "open-pr" }]);
    expect(state.runAutomationImport).not.toHaveBeenCalled();
    expect(state.events[0]).toMatchObject({ subtype: "nightly.skip", result: "deferred", payload: expect.objectContaining({ deferReason: "open-pr" }) });
  });

  it("PR 조회 throw → pr-check-failed — PR 없음으로 읽지 않는다", async () => {
    const p = row("pr-throw");
    state.rows = [p];
    client(p, { failOn: "findOpenPr" });
    expect((await call()).results[0]).toMatchObject({ action: "skip", outcome: "deferred", reason: "pr-check-failed" });
    expect(state.runAutomationImport).not.toHaveBeenCalled();
  });

  it("PR 조회 마감 초과 → pr-check-failed", async () => {
    const p = row("pr-slow");
    state.rows = [p];
    client(p, {}, { findOpenPr: () => new Promise(() => {}) });
    expect((await call()).results[0]).toMatchObject({ action: "skip", outcome: "deferred", reason: "pr-check-failed" });
  });

  it.each([
    ["getRefSha throw", { failOn: "getRefSha" as const }, false],
    ["base 브랜치 없음(sha null)", { refSha: {} }, true],
  ])("%s → skip failed base-unreadable · PR 조회 0회", async (_name, options, branchMissing) => {
    const p = row("head-bad");
    state.rows = [p];
    const calls = client(p, options);
    expect((await call()).results[0]).toEqual({ slug: "head-bad", action: "skip", outcome: "failed", reason: "base-unreadable", branchMissing });
    // 브랜치가 정말 없을 때만 표면 실패 상태를 쓴다(#155) — 일시 실패는 사건만.
    expect(state.surfaceFailures).toEqual(branchMissing ? [expect.objectContaining({ where: expect.objectContaining({ projectId: p.id }), data: expect.objectContaining({ lastImportError: "import-failed" }) })] : []);
    expect(calls.filter((c) => c.method === "findOpenPr")).toHaveLength(0);
    expect(state.events[0]).toMatchObject({ result: "failed", payload: expect.objectContaining({ errorCode: "base-unreadable" }) });
  });

  it("클라이언트 생성 throw(설치 토큰) → base-unreadable", async () => {
    state.rows = [row("no-client")];
    expect((await call()).results[0]).toMatchObject({ action: "skip", outcome: "failed", reason: "base-unreadable" });
  });

  it("적재 시작 마감 초과 → PR 조회 0회 · 사건 0행 · 적재 0회 · 결과 항목(deadline)이고 미방문 수는 아니다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const p = row("late");
    state.rows = [p];
    // head 조회가 마감을 다 쓴다 — 판정은 조회 **뒤**의 경과로 잰다. ⚠️ 그 뒤 PR 대기를 더 쓰면 `maxDuration`을 넘길 수 있다(r2).
    const calls = client(p, {}, { getRefSha: async () => { vi.setSystemTime(Date.now() + NIGHTLY_IMPORT_START_MS + 1); return HEAD; } });
    const body = await call();
    expect(body.results[0]).toEqual({ slug: "late", action: "none", counter: "unprocessed" });
    expect(calls.filter((c) => c.method === "findOpenPr")).toHaveLength(0);
    expect(body.unprocessed).toBe(0);
    expect(state.events).toEqual([]);
    expect(state.runAutomationImport).not.toHaveBeenCalled();
    // 방문으로 치지 않는다(r3) — 머리의 기록을 방문 전 값(null)으로, 그 기록이 그대로일 때만 되돌린다.
    expect(state.restores).toEqual([{ where: { id: p.id, lastNightlyAt: state.visits[0]?.lastNightlyAt }, data: { lastNightlyAt: null } }]);
  });

  it("⚠️ results.length + unprocessed = 고른 수 — 마감 멈춤과 예산 미방문을 두 번 세지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const a = row("a"); const b = row("b"); const c = row("c");
    state.rows = [a, b, c];
    // 첫 방문이 루프 예산까지 다 쓴다 — 그 방문은 마감 멈춤이고, 나머지 둘은 시작하지 않는다.
    client(a, {}, { getRefSha: async () => { vi.setSystemTime(Date.now() + 50_000); return HEAD; } });
    const body = await call();
    expect(body.results.map((r) => r.slug)).toEqual(["a"]);
    expect(body.unprocessed).toBe(2);
    expect(body.results.length + body.unprocessed).toBe(3);
    const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).filter((line) => line.startsWith("[pull] "));
    expect(lines[0]).toContain("targets=1");
    expect(lines[0]).toContain("unprocessed=2");
    expect(lines[0]).toContain("deadline=1");
  });
});

describe("방문 기록 · 격리 · 요약", () => {
  /**
   * ⚠️ **만료 행 정리가 방문을 막지 않는다** (Codex 교차 리뷰 r2 🟡). 정리는 부수 작업이다 — 실패하면 그 밤의 미전달 편집 Publish가 안 나가고
   * 루프 예산만 먹는다. 던져도 로그만 남기고 판정·갈래는 그대로 돈다.
   */
  it("만료 행 정리가 던져도 Publish·스킵은 그대로 돈다", async () => {
    const edits = row("edits"); const same = row("same", { lastCommitSha: HEAD });
    state.rows = [edits, same];
    state.pending[edits.id] = 1;
    client(same, {});
    state.closeExpiredImportRuns.mockRejectedValue(new Error("lock timeout"));
    const { results } = await call();
    expect(results).toEqual([
      { slug: "edits", action: "publish", status: "skipped", reason: "no-edits" },
      { slug: "same", action: "skip", outcome: "upToDate" },
    ]);
    expect(state.runSync).toHaveBeenCalledTimes(1);
  });

  it("실패한 방문도 lastNightlyAt을 쓴다 — 정렬이 매일 같은 프로젝트를 맨 앞에 두지 않는다", async () => {
    const p = row("boom");
    state.rows = [p];
    state.pending[p.id] = 1;
    state.runSync.mockRejectedValue(new Error("db down"));
    expect((await call()).results[0]).toMatchObject({ slug: "boom", status: "failed" });
    expect(state.visits.map((v) => v.id)).toEqual([p.id]);
  });

  it("한 프로젝트의 실패가 나머지를 막지 않는다", async () => {
    const a = row("a"); const b = row("b", { lastCommitSha: HEAD });
    state.rows = [a, b];
    state.pending[a.id] = 1;
    state.runSync.mockRejectedValue(new Error("boom"));
    client(b, {});
    const { results } = await call();
    expect(results.map((r) => r.slug)).toEqual(["a", "b"]);
    // 만료된 `import:` 행 닫기는 갈래와 무관하게 방문마다 한 번 — Publish(a)·스킵(b) 둘 다(Codex 교차 리뷰 🟡).
    expect(state.closeExpiredImportRuns.mock.calls.map((c) => c[1])).toEqual([a.id, b.id]);
    expect(results[1]).toMatchObject({ action: "skip", outcome: "upToDate" });
    expect(state.visits.map((v) => v.id)).toEqual([a.id, b.id]);
    // 마감 외 갈래(실패·스킵)는 기록을 되돌리지 않는다 (짝).
    expect(state.restores).toEqual([]);
  });

  it("요약 로그 한 줄에 카운터 전부", async () => {
    const edits = row("e"); const same = row("s", { lastCommitSha: HEAD }); const open = row("o");
    state.rows = [edits, same, open];
    state.pending[edits.id] = 1;
    client(same, {});
    client(open, { openPr: { url: "https://github.com/o/o/pull/1", number: 1, title: "t" } });
    await call();
    const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).filter((line) => line.startsWith("[pull] "));
    // Publish 갈래의 스킵(no-edits 가짜)은 보낸 것이 아니다 — published가 아니라 skipped.<사유>다(r2).
    expect(lines).toEqual(["[pull] targets=3 published=0 imported=0 skipped=2 deferred=1 failed=0 notReady=0 unprocessed=0 deadline=0 deferred.open-pr=1 skipped.no-edits=1"]);
  });
});
