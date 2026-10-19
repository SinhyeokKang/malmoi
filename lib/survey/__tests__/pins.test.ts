import { expect, it } from "vitest";

import { parsePins, pinsFromSurveys } from "../pins";
import { fetchRepo, type GitRunner } from "../run";
import type { RepoSurvey } from "../types";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function recordingGit(opts: { head?: string; failFetch?: boolean } = {}) {
  const calls: string[][] = [];
  const git: GitRunner = async (_cwd, args) => {
    calls.push([...args]);
    if (args[0] === "fetch" && opts.failFetch) throw new Error("fatal: couldn't find remote ref");
    if (args[0] === "rev-parse") return `${opts.head ?? SHA_A}\n`;
    if (args[0] === "ls-tree") return "README.md\n";
    return "";
  };
  return { git, calls };
}

it("고정 없이 돌면 해석된 HEAD SHA를 결과에 싣는다", async () => {
  const { git } = recordingGit({ head: SHA_B });
  const input = await fetchRepo("a/1", git);
  expect(input.commit).toBe(SHA_B);
});

it("고정이 있으면 그 SHA를 fetch하고 HEAD가 아니라 그 SHA로 트리를 읽는다", async () => {
  const { git, calls } = recordingGit({ head: SHA_B });
  const input = await fetchRepo("a/1", git, SHA_A);
  expect(calls.some((c) => c[0] === "fetch" && c.at(-1) === SHA_A)).toBe(true);
  expect(calls.find((c) => c[0] === "ls-tree")).toContain(SHA_A);
  expect(calls.some((c) => c[0] === "ls-tree" && c.includes("HEAD"))).toBe(false);
  expect(input.commit).toBe(SHA_A);
  expect(input.failure).toBeUndefined();
});

it("고정 SHA를 못 받으면 HEAD로 물러나지 않고 failure다", async () => {
  const { git, calls } = recordingGit({ failFetch: true });
  const input = await fetchRepo("a/1", git, SHA_A);
  expect(input.failure).toMatch(/^pin fetch 실패: /);
  expect(input.paths).toEqual([]);
  expect(calls.some((c) => c[0] === "ls-tree")).toBe(false);
});

it("SHA 모양이 아닌 고정값은 git을 부르기 전에 거부한다 (옵션 주입 방지)", async () => {
  const { git, calls } = recordingGit();
  const input = await fetchRepo("a/1", git, "--upload-pack=evil");
  expect(input.failure).toMatch(/^pin 형식 오류/);
  expect(calls).toEqual([]);
});

it("parsePins는 owner/repo→40자 hex 맵만 받는다", () => {
  expect(parsePins(JSON.stringify({ "a/1": SHA_A }))).toEqual(new Map([["a/1", SHA_A]]));
  expect(() => parsePins(JSON.stringify({ "a/1": "main" }))).toThrow(/a\/1/);
  expect(() => parsePins("[]")).toThrow();
});

it("pinsFromSurveys는 commit이 있는 성공 리포만 리포명 순으로 담는다", () => {
  const s = (repo: string, commit?: string, failure?: string) => ({ repo, commit, failure }) as unknown as RepoSurvey;
  const out = pinsFromSurveys([s("b/2", SHA_B), s("a/1", SHA_A), s("c/3", undefined, "clone 실패"), s("d/4", SHA_A, "빈 트리")]);
  expect(Object.keys(out)).toEqual(["a/1", "b/2"]);
});
