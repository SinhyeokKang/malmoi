import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPublishExecution } from "../execution";
const auth = vi.hoisted(() => vi.fn());
vi.mock("octokit", async original => ({
  ...await original<object>(),
  App: class { octokit = { auth }; },
}));
const { createGitClient } = await import("@/lib/github");
beforeEach(() => {
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "fixture");
  auth.mockReset().mockResolvedValue({ token: "fixture-token" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

it("실제 Octokit의 closePr 두 번째 쓰기는 첫 응답 뒤 기한이 끝났으면 보내지 않는다", async () => {
  vi.useFakeTimers();
  const execution = createPublishExecution();
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url, init) => {
    calls.push(`${init?.method} ${url}`);
    if (init?.method === "POST") {
      vi.setSystemTime(Date.now() + 240000);
      return json({ id: 1 }, 201);
    }
    return json({ id: 42 });
  }));
  await expect(execution.run(async () => {
    const client = await createGitClient("o", "r", "1", "42", execution);
    await client.closePr(1, "fixture");
  })).rejects.toThrow();
  expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1);
  expect(calls.filter(call => call.startsWith("PATCH"))).toHaveLength(0);
  expect(execution.mutationDispatched).toBe(true);
});
it.each([403, 429, 500])("mutation 오류 %i는 자동 재전송하지 않고 종료 뒤 force ref도 막는다", async status => {
  const execution = createPublishExecution();
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => init?.method === "PATCH" ? json({ message: "fixture" }, status) : json({ id: 42 }));
  vi.stubGlobal("fetch", fetcher);
  const client = await createGitClient("o", "r", "1", "42", execution);
  await expect(execution.run(() => client.updateRefForce("branch", "sha"))).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(client.updateRefForce("branch", "sha")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("늦은 설치 토큰 반환 뒤에는 리포 요청이 시작되지 않는다", async () => {
  vi.useFakeTimers();
  let resume!: (value: { token: string }) => void;
  auth.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const execution = createPublishExecution();
  const work = execution.run(() => createGitClient("o", "r", "1", "42", execution));
  const rejected = expect(work).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(240000);
  await rejected;
  resume({ token: "fixture-token" });
  await Promise.resolve();
  expect(fetcher).not.toHaveBeenCalled();
});
