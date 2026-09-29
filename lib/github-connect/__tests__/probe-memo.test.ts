import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { ProbeResult } from "../health";
import { createProbeMemo, probeMemoKey } from "../probe-memo";

/**
 * Home의 연결 확인 메모 (malmoi#107 ①). Home은 `probeRepo`(GitHub 2홉)를 기다려야 상태 매트릭스를 정할 수 있어
 * Suspense로 뺄 수 없다 — 대신 짧게 기억한다. 이슈가 정한 조건이 그대로 테스트다.
 */

const ok: ProbeResult = { status: "ok", installationId: "1", repositoryId: "10", fullName: "acme/web", defaultBranch: "main" };
const project = { repoOwner: "acme", repoName: "web", installationId: "1", repositoryId: "10" };

describe("createProbeMemo", () => {
  it("TTL 안에서는 다시 묻지 않는다", async () => {
    const memo = createProbeMemo({ ttlMs: 1_000, max: 10 });
    const load = vi.fn(async () => ok);
    expect(await memo("k", load, 0)).toEqual(ok);
    expect(await memo("k", load, 999)).toEqual(ok);
    expect(load).toHaveBeenCalledOnce();
  });

  it("TTL이 지나면 다시 묻는다", async () => {
    const memo = createProbeMemo({ ttlMs: 1_000, max: 10 });
    const load = vi.fn(async () => ok);
    await memo("k", load, 0);
    await memo("k", load, 1_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("error는 기억하지 않는다 — 일시 장애를 TTL 동안 붙잡지 않는다", async () => {
    const memo = createProbeMemo({ ttlMs: 1_000, max: 10 });
    const load = vi.fn<() => Promise<ProbeResult>>().mockResolvedValueOnce({ status: "error" }).mockResolvedValueOnce(ok);
    expect(await memo("k", load, 0)).toEqual({ status: "error" });
    expect(await memo("k", load, 1)).toEqual(ok);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("not-installed는 기억한다 — 영구 상태다", async () => {
    const memo = createProbeMemo({ ttlMs: 1_000, max: 10 });
    const load = vi.fn(async (): Promise<ProbeResult> => ({ status: "not-installed" }));
    await memo("k", load, 0);
    await memo("k", load, 1);
    expect(load).toHaveBeenCalledOnce();
  });

  it("크기 상한을 넘으면 가장 오래된 것부터 버린다", async () => {
    const memo = createProbeMemo({ ttlMs: 1_000, max: 2 });
    const load = vi.fn(async () => ok);
    await memo("a", load, 0);
    await memo("b", load, 0);
    await memo("c", load, 0);
    expect(load).toHaveBeenCalledTimes(3);
    await memo("b", load, 1);
    await memo("c", load, 1);
    expect(load).toHaveBeenCalledTimes(3);
    await memo("a", load, 1);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

describe("probeMemoKey", () => {
  it("저장된 installationId·repositoryId가 바뀌면 다른 키다 — Reconnect 뒤 옛 결과로 installation-changed를 거짓 표시하지 않는다", () => {
    const key = probeMemoKey(project);
    expect(probeMemoKey({ ...project, installationId: "2" })).not.toBe(key);
    expect(probeMemoKey({ ...project, repositoryId: "11" })).not.toBe(key);
    expect(probeMemoKey({ ...project, repositoryId: null })).not.toBe(key);
    expect(probeMemoKey({ ...project, repoName: "app" })).not.toBe(key);
  });

  it("구분자가 섞인 이름끼리 겹치지 않는다", () => {
    expect(probeMemoKey({ ...project, repoOwner: "a/b", repoName: "c" })).not.toBe(probeMemoKey({ ...project, repoOwner: "a", repoName: "b/c" }));
  });
});

/**
 * **메모를 켜는 호출부는 Home 하나다.** 설정 화면은 OWNER가 고치러 가는 자리라 언제나 실물을 봐야 하고, MCP는 에이전트가
 * 판정의 근거로 쓴다 — 거기에 `memo: true`가 붙으면 App 제거 뒤 30초 동안 거짓 `ok`가 퍼진다.
 */
describe("배선", () => {
  const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
  it("loadConnectionHealth에 memo를 켜는 곳은 Home 페이지뿐이다", () => {
    const callers = execFileSync("git", ["grep", "-l", "loadConnectionHealth(", "--", "app", "lib", "components"], { cwd: ROOT, encoding: "utf8" })
      .trim().split("\n").filter(path => !path.includes("__tests__"));
    const memoized = callers.filter(path => /loadConnectionHealth\([^)]*\{\s*memo:\s*true/.test(readFileSync(`${ROOT}/${path}`, "utf8")));
    expect(memoized).toEqual(["app/(edit)/projects/[slug]/(home)/page.tsx"]);
  });
});
