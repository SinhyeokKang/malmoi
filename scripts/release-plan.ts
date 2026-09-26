#!/usr/bin/env tsx
/**
 * `/merge` 3단계의 버전 판정 — 판정은 `scripts/release.ts`의 `planRelease`이고 이 파일은 입력을 모으는 껍데기다.
 *
 *   pnpm release:plan
 *
 * stdout에 JSON 한 개. exit 0 = 판정 성공(`bump`/`none`), 1 = `error` 판정(git·JSON 실패는 `error: "io"`), 2 = 인자가 주어짐.
 * **읽기 전용이다** — 버전 기록은 `/merge` 4단계의 `npm pkg set`이다. 소비자는 `/merge` 3단계 하나다.
 *
 * ⚠️ 앞에서 `git fetch origin`이 돌았다고 가정한다(`/merge` 0단계) — `origin/*` ref가 stale이면 판정도 stale이다.
 */
import { execFileSync, spawnSync } from "node:child_process";

import { planRelease, type Commit } from "./release";

if (process.argv.length > 2) {
  console.error("사용법: pnpm release:plan (인자 없음 — 레벨은 /merge 3단계 질문이 받는다)");
  process.exit(2);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** 그 ref의 `package.json`에 `version`이 없으면 null — 1.0.0 seed 전의 모양이다. */
function versionAt(ref: string): string | null {
  const pkg: unknown = JSON.parse(git("show", `${ref}:package.json`));
  if (typeof pkg !== "object" || pkg === null || !Object.hasOwn(pkg, "version")) return null;
  const version: unknown = (pkg as Record<string, unknown>).version;
  // 문자열이 아닌 값은 그대로 문자열로 넘겨 invalid-version으로 떨어뜨린다 — null로 접으면 seed로 오판한다
  return typeof version === "string" ? version : String(version);
}

/** `git merge-base --is-ancestor`는 판정을 exit code로 준다(0 조상 / 1 아님) — 그 밖의 코드는 진짜 실패다. */
function isAncestor(ancestor: string, descendant: string): boolean {
  const { status, stderr } = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { encoding: "utf8" });
  if (status === 0) return true;
  if (status === 1) return false;
  throw new Error(`git merge-base --is-ancestor ${ancestor} ${descendant}: ${stderr.trim() || `exit ${status}`}`);
}

function readInput(): Parameters<typeof planRelease>[0] {
  // ⚠️ 태그는 로컬이 아니라 원격에서 읽는다 — 9단계가 서버에서 만들고, 로컬엔 원격에 없는 태그(`l10n-push-v1` 등)가 있다
  const tags = git("ls-remote", "--tags", "--refs", "origin")
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace(/^refs\/tags\//, ""))
    .filter((name): name is string => Boolean(name));

  // 필드 구분 \x1f, 레코드 구분 \x1e — 본문에 개행이 있어도 커밋 경계가 안 무너진다
  const commits: Commit[] = git("log", "origin/main..origin/dev", "--format=%s%x1f%b%x1e")
    .split("\x1e")
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [subject = "", body = ""] = record.split("\x1f");
      return { subject, body };
    });

  return {
    pkgVersion: versionAt("origin/dev"),
    mainVersion: versionAt("origin/main"),
    tags,
    commits,
    devContainsMain: isAncestor("origin/main", "origin/dev"),
  };
}

// 입력을 못 모으면 스택 트레이스 대신 error JSON으로 접는다 — exit 1이면 언제나 stdout에 읽을 판정이 있다
let input: Parameters<typeof planRelease>[0];
try {
  input = readInput();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ action: "error", error: "io", message }, null, 2));
  process.exit(1);
}

const plan = planRelease(input);

console.log(JSON.stringify(plan, null, 2));
process.exit(plan.action === "error" ? 1 : 0);
