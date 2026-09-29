import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { sealToken } from "@/lib/credentials/storage";

import type { ApiTokenSubject } from "../../token-store";

/**
 * **에이전트의 병렬 호출이 만료 user-to-server 토큰을 동시에 갱신한다** (mcp-connector design §1.3 · POSTMORTEM 2026-09-16 · 2026-09-13).
 * `list_repositories` + `list_branches`를 한 턴에 부르는 모양이 탭 둘보다 흔하다. 조건부 쓰기(`refresh_token` 대조)에서 진 쪽이 행을 다시
 * 읽어 이긴 쪽의 토큰을 쓰는지 — **둘 다 성공**이 기대값이다(진 쪽을 `reauthorize`로 접으면 사용자가 멀쩡한 연결을 다시 만든다).
 * 실제 `ensureUserToken`과 온보딩 코어를 지나고 GitHub만 가짜다. 순서는 deferred promise로 붙든다(타이머 없음).
 */
const h = vi.hoisted(() => ({ refresh: vi.fn(), updateMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/github-connect/user", async (orig) => ({
  ...(await orig<object>()),
  refreshUserToken: h.refresh,
  listUserInstallationRecords: async () => [{ id: "1", createdAt: new Date("2026-01-01T00:00:00Z") }],
  listUserInstallations: async () => ["1"],
  listInstallationRepos: async () => [{ fullName: "o/r", pushedAt: null, push: true }],
}));
vi.mock("@/lib/github", async (orig) => ({
  ...(await orig<object>()),
  probeRepo: async () => ({ status: "ok", installationId: "1", repositoryId: "100", fullName: "o/r", defaultBranch: "main" }),
  listBranches: async () => ({ status: "ok", names: ["main"], truncated: false }),
}));

const { TOOLS } = await import("..");
const run = (name: string, input: Record<string, unknown>) => TOOLS.find(t => t.name === name)!.run({ prisma, subject, now: NOW, origin: null }, input as never);

const NOW = new Date("2026-09-28T00:00:00Z");
const subject: ApiTokenSubject = { userId: "u1", grants: ["project:create"], scope: { kind: "all" }, credential: { kind: "api-token", tokenHash: "hash" } };
const seal = (value: string, field: "access_token" | "refresh_token") => sealToken(value, { userId: "u1", providerAccountId: "gh1", field });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

let row: { providerAccountId: string; access_token: string | null; refresh_token: string | null; expires_at: number; installRequestedAt: Date | null };
let prisma: PrismaClient;

beforeEach(() => {
  h.refresh.mockReset(); h.updateMany.mockReset();
  // 만료된 행 — 두 호출 모두 갱신을 시도한다.
  row = { providerAccountId: "gh1", access_token: seal("old-access", "access_token"), refresh_token: seal("r1", "refresh_token"),
    // ⚠️ 코어는 실제 시각(`new Date()`)으로 판정한다 — 만료·새 만료를 실제 시각 기준으로 둔다.
    expires_at: Math.floor(Date.now() / 1000) - 60, installRequestedAt: null };
  prisma = {
    account: {
      findFirst: async () => ({ ...row }),
      updateMany: h.updateMany,
    },
    projectMember: { count: async () => 0 },
  } as unknown as PrismaClient;
});

/** `refresh_token` 조건부 쓰기 — 읽었던 값이 아직 행에 있을 때만 쓴다(실제 `where`와 같은 대조). */
function write(args: { where: { refresh_token?: string }; data: typeof row }) {
  if (args.where.refresh_token === undefined || args.where.refresh_token !== row.refresh_token) return { count: 0 };
  row = { ...row, ...args.data };
  return { count: 1 };
}
const fresh = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `r-${n}`, expiresAt: new Date(Date.now() + 8 * 3600_000) });

describe("병렬 호출 × 만료 토큰", () => {
  it("둘 다 갱신에 성공하고 뒤의 쓰기가 count=0이면 행을 다시 읽어 이긴 쪽의 토큰으로 둘 다 성공한다", async () => {
    let n = 0;
    h.refresh.mockImplementation(async () => fresh(++n));
    const first = deferred();
    let calls = 0;
    h.updateMany.mockImplementation(async (args: Parameters<typeof write>[0]) => {
      calls += 1;
      if (calls === 1) { const result = write(args); first.resolve(); return result; }
      // 뒤의 쓰기는 앞의 쓰기가 끝날 때까지 붙든다 — count=0 경로를 확정적으로 밟는다.
      await first.promise;
      return write(args);
    });
    const [repos, branches] = await Promise.all([run("list_repositories", {}), run("list_branches", { owner: "o", repo: "r" })]);
    expect(repos).toMatchObject({ status: "ok" });
    expect(branches).toMatchObject({ status: "ok" });
    expect(h.refresh).toHaveBeenCalledTimes(2);
  });

  it("한쪽의 갱신이 거부돼도(1회용 refresh 재사용) 이긴 쪽의 쓰기를 기다려 다시 읽고 둘 다 성공한다", async () => {
    const written = deferred();
    let n = 0;
    h.refresh.mockImplementation(async () => {
      n += 1;
      if (n === 1) return fresh(1);
      // 진 쪽 — GitHub이 같은 refresh 토큰의 두 번째 사용을 거부한다. 이긴 쪽의 쓰기가 끝난 뒤에 실패가 돌아온다.
      await written.promise;
      throw Object.assign(new Error("bad_refresh_token"), { status: 400 });
    });
    h.updateMany.mockImplementation(async (args: Parameters<typeof write>[0]) => { const result = write(args); written.resolve(); return result; });
    const [repos, branches] = await Promise.all([run("list_repositories", {}), run("list_branches", { owner: "o", repo: "r" })]);
    expect(repos).toMatchObject({ status: "ok" });
    expect(branches).toMatchObject({ status: "ok" });
    expect(h.refresh).toHaveBeenCalledTimes(2);
  });
});
