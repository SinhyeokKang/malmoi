import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { PROBE_MEMO_MAX, PROBE_MEMO_TTL_MS } from "@/lib/github-connect/probe-memo";

import { createOpenPrMemo, OPEN_PR_MEMO_MAX, OPEN_PR_MEMO_TTL_MS } from "../open-pr-memo";

/**
 * Home의 열린 PR 조회 메모 (ux-drift-unify U15 — T18 실측: Home 착지·사건 상세마다 GitHub 2회). 연결 확인 메모(`probe-memo`)와 같은
 * 모양이고 다른 점은 둘이다: **Publish·Sync가 그 프로젝트의 항목을 지운다**, **모름(`undefined`)은 기억하지 않는다**.
 */

const URL_ = "https://github.com/acme/web/pull/7";
const project = { repoOwner: "acme", repoName: "web", installationId: "1", repositoryId: "10" };

describe("createOpenPrMemo", () => {
  it("TTL 안에서는 다시 묻지 않는다 — PR 있음·없음 둘 다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 10 });
    const open = vi.fn(async () => URL_);
    expect(await memo.load("alpha", project, open, 0)).toBe(URL_);
    expect(await memo.load("alpha", project, open, 999)).toBe(URL_);
    expect(open).toHaveBeenCalledOnce();

    const none = vi.fn(async () => null);
    expect(await memo.load("beta", project, none, 0)).toBeNull();
    expect(await memo.load("beta", project, none, 999)).toBeNull();
    expect(none).toHaveBeenCalledOnce();
  });

  it("TTL이 지나면 다시 묻는다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 10 });
    const load = vi.fn(async () => null);
    await memo.load("alpha", project, load, 0);
    await memo.load("alpha", project, load, 1_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("⚠️ 모름(undefined)은 기억하지 않는다 — 일시 장애를 TTL 동안 붙잡지 않고, 없음으로 접히지도 않는다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 10 });
    const load = vi.fn<() => Promise<string | null | undefined>>().mockResolvedValueOnce(undefined).mockResolvedValueOnce(URL_);
    expect(await memo.load("alpha", project, load, 0)).toBeUndefined();
    expect(await memo.load("alpha", project, load, 1)).toBe(URL_);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("⚠️ 저장된 신원·slug가 하나라도 다르면 다른 항목이다 — 다른 프로젝트·Reconnect가 남의 답을 받지 않는다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 10 });
    await memo.load("alpha", project, async () => URL_, 0);
    for (const [slug, other] of [
      ["alpha", { ...project, installationId: "2" }],
      ["alpha", { ...project, repositoryId: "11" }],
      ["alpha", { ...project, repositoryId: null }],
      ["alpha", { ...project, repoOwner: "other" }],
      ["alpha", { ...project, repoName: "app" }],
      // 같은 리포의 다른 프로젝트 — sync 브랜치가 slug에서 나오므로 PR이 다르다.
      ["beta", project],
    ] as const) {
      expect(await memo.load(slug, other, async () => null, 1)).toBeNull();
    }
  });

  it("구분자가 섞인 이름끼리 겹치지 않는다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 10 });
    await memo.load("alpha", { ...project, repoOwner: "a/b", repoName: "c" }, async () => URL_, 0);
    expect(await memo.load("alpha", { ...project, repoOwner: "a", repoName: "b/c" }, async () => null, 1)).toBeNull();
  });

  it("⚠️ forget은 그 slug의 항목만 지운다 — Publish가 연 PR을 옛 '없음'이 가리지 않는다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 10 });
    await memo.load("alpha", project, async () => null, 0);
    await memo.load("beta", project, async () => null, 0);
    memo.forget("alpha");
    expect(await memo.load("alpha", project, async () => URL_, 1)).toBe(URL_);
    const beta = vi.fn(async () => URL_);
    expect(await memo.load("beta", project, beta, 1)).toBeNull();
    expect(beta).not.toHaveBeenCalled();
  });

  it("⚠️ 조회 중에 forget이 불리면 그 결과를 넣지 않는다 — Publish 전에 출발한 조회의 '없음'이 PR 생성 뒤에 자리를 차지하지 않는다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 10 });
    let release!: (value: string | null) => void;
    const inFlight = memo.load("alpha", project, () => new Promise<string | null>((resolve) => { release = resolve; }), 0);
    memo.forget("alpha");
    release(null);
    expect(await inFlight).toBeNull();
    expect(await memo.load("alpha", project, async () => URL_, 1)).toBe(URL_);
  });

  it("크기 상한을 넘으면 가장 오래된 것부터 버린다", async () => {
    const memo = createOpenPrMemo({ ttlMs: 1_000, max: 2 });
    const load = vi.fn(async () => null);
    await memo.load("a", project, load, 0);
    await memo.load("b", project, load, 0);
    await memo.load("c", project, load, 0);
    expect(load).toHaveBeenCalledTimes(3);
    await memo.load("b", project, load, 1);
    await memo.load("c", project, load, 1);
    expect(load).toHaveBeenCalledTimes(3);
    await memo.load("a", project, load, 1);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("TTL·상한이 연결 확인 메모와 같다 — Home의 두 GitHub 조회가 같은 창으로 낡는다", () => {
    expect(OPEN_PR_MEMO_TTL_MS).toBe(PROBE_MEMO_TTL_MS);
    expect(OPEN_PR_MEMO_MAX).toBe(PROBE_MEMO_MAX);
  });
});

/**
 * **메모를 거치는 호출부는 Home 하나다.** 게이트는 언제나 실물을 본다 — `/api/push`·야간·Publish 미리보기·Sync 확인·설정·MCP가
 * 메모를 거치면 30초 동안 옛 "없음"으로 적재를 통과시키거나 옛 "열림"으로 보류를 말한다(fail-closed가 깨진다).
 * **지우는 곳은 PR 상태를 바꿀 수 있는 실행 둘이다** — Publish(`runSync` — 웹·MCP·야간이 모두 지난다)와 수동 Sync(`importRepository`).
 */
describe("배선", () => {
  const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
  const callers = (needle: string) =>
    execFileSync("git", ["grep", "-l", "-F", needle, "--", "app", "lib", "components"], { cwd: ROOT, encoding: "utf8" })
      .trim().split("\n").filter(path => !path.includes("__tests__"));

  it("메모된 조회를 부르는 곳은 Home뿐이다", () => {
    expect(callers("loadOpenPrUrlMemo(").filter(path => path !== "lib/projects/open-pr.ts"))
      .toEqual(["app/(edit)/projects/[slug]/(home)/page.tsx"]);
  });

  it("메모 인스턴스를 직접 만지는 곳은 조회 한 곳과 지우는 함수뿐이다", () => {
    expect(callers("homeOpenPrMemo").sort()).toEqual(["lib/projects/open-pr-memo.ts", "lib/projects/open-pr.ts"]);
  });

  it("Publish와 수동 Sync가 그 프로젝트의 항목을 지운다", () => {
    expect(callers("forgetOpenPr(").filter(path => path !== "lib/projects/open-pr-memo.ts").sort())
      .toEqual(["lib/onboarding-run/import.ts", "lib/sync/run.ts"]);
    expect(readFileSync(`${ROOT}/lib/sync/run.ts`, "utf8")).toMatch(/finally\s*\{\s*forgetOpenPr\(slug\)/);
  });
});
