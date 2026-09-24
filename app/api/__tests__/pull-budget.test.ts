import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PULL_TIME_BUDGET_MS } from "@/lib/pull/targets";

/**
 * **야간 cron의 시간 예산** (launch-readiness L2.9 · audit #11).
 *
 * `maxDuration = 60`에 닿으면 함수가 통째로 죽어 요약 로그와 응답이 **하나도** 안 남는다 — 이미 돈 프로젝트의
 * 결과까지 사라진다. 예산은 공정성이 아니라 **요약이 남는 것**을 지킨다: 넘으면 나머지를 `unprocessed`로
 * 넘기고 멈춘다(다음 밤에는 `selectPullTargets`의 정렬이 그것들을 앞으로 가져온다).
 *
 * 판정은 **루프 머리**다 — 시작한 프로젝트는 끝까지 돈다. 그래서 첫 프로젝트는 예산과 무관하게 돈다.
 */

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(),
  runSync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findMany: hoisted.findMany } }) }));
vi.mock("@/lib/sync/run", () => ({ runSync: hoisted.runSync }));

const { GET } = await import("../pull/route");

const START = new Date("2026-09-24T18:00:00Z");

/** 준비된 프로젝트 — `selectPullTargets`의 필터 넷을 지나고, 한 번도 안 돌아 slug 순으로 선다. */
const ready = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  installationId: "77",
  repositoryId: "r1",
  surfaces: [{ archivedAt: null, lastCommitSha: "a".repeat(40) }],
  archivedAt: null,
  syncRuns: [],
});

/** 프로젝트마다 걸리는 시간(ms). 가짜 시계를 그만큼 민다. */
function durations(ms: Record<string, number>) {
  hoisted.runSync.mockImplementation(async (_prisma: unknown, input: { slug: string }) => {
    vi.setSystemTime(Date.now() + (ms[input.slug] ?? 0));
    return { status: "no-changes" };
  });
}

async function call(): Promise<{ results: { slug: string }[]; unprocessed: number }> {
  const response = await GET(new Request("http://localhost/api/pull", { headers: { authorization: "Bearer cron" } }));
  expect(response.status).toBe(200);
  return (await response.json()) as { results: { slug: string }[]; unprocessed: number };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.stubEnv("CRON_SECRET", "cron");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("예산은 maxDuration(60초) 안이다 — 넘는 값이면 예산이 서기 전에 함수가 죽는다", () => {
  expect(PULL_TIME_BUDGET_MS).toBeGreaterThan(0);
  expect(PULL_TIME_BUDGET_MS).toBeLessThan(60_000);
});

it("대상 0개 → 결과 0 · unprocessed 0", async () => {
  hoisted.findMany.mockResolvedValue([]);
  durations({});
  expect(await call()).toEqual({ results: [], unprocessed: 0 });
});

it("하나가 혼자 예산을 넘어도 그것은 돈다 — 판정은 시작 전이다", async () => {
  hoisted.findMany.mockResolvedValue([ready("a")]);
  durations({ a: PULL_TIME_BUDGET_MS + 1_000 });
  const body = await call();
  expect(body.results.map((r) => r.slug)).toEqual(["a"]);
  expect(body.unprocessed).toBe(0);
});

it("전부 빠르면 전부 돌고 unprocessed 0 — 예산 안에서는 멈추지 않는다", async () => {
  hoisted.findMany.mockResolvedValue([ready("a"), ready("b"), ready("c")]);
  durations({ a: 1_000, b: 1_000, c: 1_000 });
  const body = await call();
  expect(body.results.map((r) => r.slug)).toEqual(["a", "b", "c"]);
  expect(body.unprocessed).toBe(0);
});

it("앞이 예산을 다 쓰면 나머지는 시작하지 않고 unprocessed로 넘긴다", async () => {
  hoisted.findMany.mockResolvedValue([ready("a"), ready("b"), ready("c")]);
  durations({ a: 1_000, b: PULL_TIME_BUDGET_MS, c: 1_000 });
  const body = await call();
  expect(body.results.map((r) => r.slug)).toEqual(["a", "b"]);
  expect(body.unprocessed).toBe(1);
  expect(hoisted.runSync).toHaveBeenCalledTimes(2);
  // 요약 줄이 남는 것이 예산의 요지다 — 넘긴 수가 거기 실린다.
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining("unprocessed=1"));
});
