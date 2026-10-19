import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, it } from "vitest";

import { pinsFromSurveys } from "../pins";
import { fetchRepo, type GitRunner } from "../run";
import { surveyOne } from "../one";

/**
 * 네트워크 없이 진짜 git으로 돈다 — 가짜 러너는 "SHA가 인자에 들어갔다"만 보이고 pin 커밋의 **본문**을 읽는지는 못 본다.
 * clone만 임시 로컬 저장소로 돌리고 나머지는 실제 git이다.
 */
const exec = promisify(execFile);
let root: string;
let src: string;
let shaA = "";
let shaB = "";

const run = async (cwd: string, ...args: string[]) =>
  (await exec("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } })).stdout.trim();

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "pins-git-test-"));
  src = join(root, "src");
  mkdirSync(join(src, "locales"), { recursive: true });
  await run(src, "init", "-q");
  await run(src, "config", "uploadpack.allowAnySHA1InWant", "true");
  writeFileSync(join(src, "locales", "en.json"), '{"hello":"PIN"}');
  await run(src, "add", ".");
  await run(src, "commit", "-q", "-m", "a");
  shaA = await run(src, "rev-parse", "HEAD");
  writeFileSync(join(src, "locales", "en.json"), '{"hello":"HEAD"}');
  await run(src, "commit", "-q", "-am", "b");
  shaB = await run(src, "rev-parse", "HEAD");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

type Spy = { calls: string[][]; git: GitRunner };
function localGit(failOn?: string): Spy {
  const calls: string[][] = [];
  const git: GitRunner = async (cwd, args) => {
    calls.push([...args]);
    if (failOn !== undefined && args[0] === failOn) throw new Error(`fatal: injected ${failOn} failure`);
    if (args[0] === "clone") {
      const swapped = args.map((a) => (a.startsWith("https://github.com/") ? src : a));
      return (await exec("git", swapped, { cwd, encoding: "utf8" })).stdout;
    }
    return (await exec("git", [...args], { cwd, encoding: "utf8" })).stdout;
  };
  return { calls, git };
}

it("고정 커밋의 파일 본문을 읽고 checkout 인자가 그 SHA다", async () => {
  const { git, calls } = localGit();
  const input = await fetchRepo("t/repo", git, shaA);
  expect(input.failure).toBeUndefined();
  expect(input.files.get("locales/en.json")).toBe('{"hello":"PIN"}');
  expect(calls.find((c) => c[0] === "checkout")).toEqual(["checkout", "--quiet", shaA]);
});

it("고정이 없으면 HEAD 커밋의 본문을 읽고 그 SHA를 기록한다", async () => {
  const { git } = localGit();
  const input = await fetchRepo("t/repo", git);
  expect(input.files.get("locales/en.json")).toBe('{"hello":"HEAD"}');
  expect(input.commit).toBe(shaB);
});

for (const step of ["sparse-checkout", "checkout"]) {
  for (const pin of [true, false]) {
    it(`${pin ? "고정" : "비고정"} 실행에서 ${step}가 실패하면 failure이고 pins에서 빠진다`, async () => {
      const { git } = localGit(step);
      const input = await fetchRepo("t/repo", git, pin ? shaA : undefined);
      expect(input.failure).toMatch(/^체크아웃 실패: /);
      expect(input.files.size).toBe(0);
      expect(pinsFromSurveys([surveyOne(input)])).toEqual({});
    });
  }
}
