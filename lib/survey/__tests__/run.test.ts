import { expect, it } from "vitest";

import { fetchRepo, runSurveys, type GitRunner } from "../run";

/**
 * **`--jobs`가 실제 동시 실행 수다** (audit #21). 전에는 async 워커 안에서 `execFileSync`가 돌아 clone이 이벤트 루프를
 * 막았고, 워커 여섯이 떠도 git은 하나씩만 돌았다.
 *
 * ⚠️ 네트워크를 쓰지 않는다 — git 프로세스 경계를 제어 가능한 promise로 바꿔 "지금 몇 개가 떠 있나"를 직접 잰다.
 */
function fakeGit() {
  const clones: { repo: string; finish: (ok: boolean) => void }[] = [];
  let inFlight = 0;
  let peak = 0;
  const git: GitRunner = async (_cwd, args) => {
    if (args[0] === "clone") {
      const url = args.find((a) => a.startsWith("https://")) ?? "";
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        const ok = await new Promise<boolean>((resolve) => clones.push({ repo: url.replace(/^https:\/\/github\.com\/|\.git$/g, ""), finish: resolve }));
        if (!ok) throw new Error("fatal: repository not found");
        return "";
      } finally { inFlight -= 1; }
    }
    if (args[0] === "ls-tree") return "README.md\n";
    return "";
  };
  return { git, clones, stats: () => ({ inFlight, peak }) };
}

const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };

it("jobs만큼 clone이 동시에 떠 있고 그 수를 넘지 않는다", async () => {
  const { git, clones, stats } = fakeGit();
  const repos = ["a/1", "a/2", "a/3", "a/4", "a/5"];
  const pending = runSurveys(repos, 2, (repo) => fetchRepo(repo, git));
  await settle();
  expect(clones).toHaveLength(2);
  expect(stats().inFlight).toBe(2);
  while (clones.length > 0) { clones.shift()!.finish(true); await settle(); }
  await pending;
  expect(stats().peak).toBe(2);
});

it("실패한 리포도 자리를 돌려주고 결과에 failure로 남는다", async () => {
  const { git, clones } = fakeGit();
  const pending = runSurveys(["a/1", "a/2", "a/3"], 1, (repo) => fetchRepo(repo, git));
  await settle();
  clones.shift()!.finish(false);
  await settle();
  // 첫 리포가 실패한 뒤 다음 리포의 clone이 떠야 한다.
  expect(clones.map((c) => c.repo)).toEqual(["a/2"]);
  while (clones.length > 0) { clones.shift()!.finish(true); await settle(); }
  const out = await pending;
  expect(out[0]!.failure).toMatch(/^clone 실패: /);
  expect(out[1]!.failure).toBeUndefined();
});

it("작업이 던져도 그 자리에 failure를 담고 나머지를 끝까지 돈다", async () => {
  const out = await runSurveys(["a/1", "a/2"], 2, async (repo) => { if (repo === "a/1") throw new Error("boom"); return fetchRepo(repo, async () => ""); });
  expect(out.map((s) => s.repo)).toEqual(["a/1", "a/2"]);
  expect(out[0]!.failure).toMatch(/boom/);
});

it("완료 순서와 무관하게 결과가 입력 순서다", async () => {
  const { git, clones } = fakeGit();
  const repos = ["a/1", "a/2", "a/3", "a/4"];
  const done: string[] = [];
  const pending = runSurveys(repos, 4, (repo) => fetchRepo(repo, git), (survey) => done.push(survey.repo));
  await settle();
  // 역순으로 끝낸다.
  for (const clone of [...clones].reverse()) { clone.finish(true); await settle(); }
  const out = await pending;
  expect(done).toEqual(["a/4", "a/3", "a/2", "a/1"]);
  expect(out.map((s) => s.repo)).toEqual(repos);
});
