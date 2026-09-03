import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadPullState } from "../load";
import type { TreePayload } from "../payload";
import { runPull, type PullDeps, type PullState } from "../run";
import type { RenderKey } from "../render";
import { createFakeGitClient } from "./fake-client";

/**
 * **L1 — 진입점 회귀** (`docs/features/key-order-preservation/` 태스크 5-1).
 *
 * ⚠️ **어댑터·render 단위 테스트로는 원리적으로 못 보는 층이다.** `sortIndex`가
 * `LocaleEntry.order`까지 가려면 홉 넷을 지나는데(`load.ts` select → `RenderKey` → `PullRow` →
 * `buildWriteEntries`), 하나만 끊겨도 `orderedEntries`가 코드 유닛 폴백으로 떨어져 **전 계층의
 * 단위 테스트가 green인 채 기능만 멎는다.** POSTMORTEM 2026-09-02 "순위 픽스가 자기 단위
 * 테스트만 통과하고 실제 경로에서 죽어 있었다"의 정확한 재발 형태다.
 *
 * 그래서 여기서는 **진입점(`runPull`)이 실제로 커밋에 실은 파일 내용**을 본다.
 */

const PROJECT = {
  id: "p1",
  slug: "bugshot-2",
  repoOwner: "o",
  repoName: "r",
  baseBranch: "dev",
  installationId: "123",
  adapterName: "json-catalog",
  pathTemplate: "i18n/{locale}.json",
  nested: false,
  baseLocale: "en",
  lastPulledAt: null as Date | null,
};

/** 코드 유닛 순과 **다른** 파일 순서. 같으면 폴백이 정답을 내서 배선이 끊겨도 통과한다. */
const SCRAMBLED: RenderKey[] = [
  { key: "zebra", sourceText: "Z", sortIndex: 0, orphaned: false, cells: { en: { value: "Z" }, ko: { value: "제트" } } },
  { key: "apple", sourceText: "A", sortIndex: 1, orphaned: false, cells: { en: { value: "A" }, ko: { value: "사과" } } },
  { key: "mango", sourceText: "M", sortIndex: 2, orphaned: false, cells: { en: { value: "M" }, ko: { value: "망고" } } },
];

function depsFor(keys: readonly RenderKey[]): { deps: PullDeps; trees: TreePayload[] } {
  const { client, calls } = createFakeGitClient({
    refSha: { "heads/dev": "basehead" },
    tree: { basehead: [] },
  });
  const deps: PullDeps = {
    loadState: async (): Promise<PullState> => ({
      project: { ...PROJECT },
      localeCodes: ["en", "ko"],
      keys: [...keys],
      maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
    }),
    createClient: async () => client,
    saveLastPulledAt: async () => {},
    syncBranch: "l10n/sync",
  };
  const trees: TreePayload[] = [];
  // `calls`는 실행 후에 채워지므로 getter로 넘긴다.
  return {
    deps,
    get trees() {
      trees.length = 0;
      for (const c of calls) if (c.method === "createTree") trees.push(c.args[0] as TreePayload);
      return trees;
    },
  };
}

const contentOf = (trees: readonly TreePayload[], path: string): string | undefined =>
  trees[0]?.tree.find((e) => e.path === path)?.content;

describe("L1 — runPull이 sortIndex 순서로 파일을 낸다", () => {
  it("커밋에 실린 base 파일이 **코드 유닛 순이 아니라 sortIndex 순**이다", async () => {
    const h = depsFor(SCRAMBLED);
    const r = await runPull(h.deps);
    expect(r.status).toBe("committed");
    expect(contentOf(h.trees, "i18n/en.json")).toBe('{\n  "zebra": "Z",\n  "apple": "A",\n  "mango": "M"\n}\n');
  });

  it("비-base 파일도 같은 순서다 — base 순서를 전 로케일에 쓴다", async () => {
    const h = depsFor(SCRAMBLED);
    await runPull(h.deps);
    expect(contentOf(h.trees, "i18n/ko.json")).toBe('{\n  "zebra": "제트",\n  "apple": "사과",\n  "mango": "망고"\n}\n');
  });

  it("sortIndex가 없으면 코드 유닛 순으로 떨어진다 — 폴백이 진입점에서도 산다", async () => {
    const h = depsFor(SCRAMBLED.map(({ sortIndex: _drop, ...k }) => k));
    await runPull(h.deps);
    expect(contentOf(h.trees, "i18n/en.json")).toBe('{\n  "apple": "A",\n  "mango": "M",\n  "zebra": "Z"\n}\n');
  });

  it("**홉이 하나만 끊겨도 이 테스트가 잡는다** — sortIndex를 지운 상태가 폴백과 같은 출력이다", async () => {
    // 위 두 케이스의 출력이 서로 다르다는 것이 곧 그 증명이다. 픽스처가 코드 유닛 순이면
    // 둘이 같아져 배선이 끊겨도 green이 된다 — SCRAMBLED가 그래서 뒤섞여 있다.
    const wired = depsFor(SCRAMBLED);
    await runPull(wired.deps);
    const unwired = depsFor(SCRAMBLED.map(({ sortIndex: _drop, ...k }) => k));
    await runPull(unwired.deps);
    expect(contentOf(wired.trees, "i18n/en.json")).not.toBe(contentOf(unwired.trees, "i18n/en.json"));
  });
});

// ── orderBy 두 곳 — 하나는 바꾸고 하나는 절대 안 바꾼다 ────────────────────

/** `findMany`가 받은 인자를 잡는 스텁. I/O도 DB도 없다 — 두 함수가 prisma를 주입받는다. */
function captureFindMany(): { prisma: PrismaClient; args: Record<string, unknown>[] } {
  const args: Record<string, unknown>[] = [];
  const findMany = async (a: Record<string, unknown>) => {
    args.push(a);
    return [];
  };
  const prisma = {
    project: {
      findUnique: async () => ({
        ...PROJECT,
        locales: [{ code: "en" }, { code: "ko" }],
      }),
    },
    stringKey: { findMany },
    translation: { aggregate: async () => ({ _max: { updatedAt: null } }) },
  } as unknown as PrismaClient;
  return { prisma, args };
}

describe("L1 — orderBy가 두 곳이고 하나만 바뀐다", () => {
  it("loadPullState는 sortIndex 선두로 조회한다", async () => {
    const { prisma, args } = captureFindMany();
    await loadPullState(prisma, "bugshot-2");
    expect(args[0]?.orderBy).toEqual([{ sortIndex: "asc" }, { key: "asc" }]);
  });

  it("loadPullState가 세 컬럼을 실제로 select한다 — 안 가져오면 배선이 첫 홉에서 끊긴다", async () => {
    const { prisma, args } = captureFindMany();
    await loadPullState(prisma, "bugshot-2");
    const select = args[0]?.select as Record<string, unknown>;
    expect(select.sortIndex).toBe(true);
    expect((select.translations as { select: Record<string, unknown> }).select).toMatchObject({
      description: true,
      placeholders: true,
    });
  });

  /**
   * ⚠️ **`lib/keys/query.ts`는 `server-only`라 테스트가 import할 수 없다** — 그래서 소스를 읽어
   * 정적으로 고정한다. 약한 검사지만 지키려는 것이 "그 한 줄이 그대로 있는가"이고,
   * `server-only`를 떼서 검사를 강하게 만드는 것은 보호를 팔아 테스트를 사는 일이다.
   */
  const sourceOf = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

  it("**편집 UI(lib/keys/query.ts)는 key 순 그대로다** — 바꾸면 번역자의 이분 탐색이 사라진다", () => {
    // 키 테이블에 검색창이 없어서 알파벳 순이 이름으로 키를 찾는 유일한 수단이다.
    expect(sourceOf("lib/keys/query.ts")).toContain('orderBy: { key: "asc" }');
  });

  it("그 문자열이 pull 쪽에는 없다 — grep하면 두 곳이 잡히던 함정을 여기서 가른다", () => {
    expect(sourceOf("lib/pull/load.ts")).not.toContain('orderBy: { key: "asc" }');
  });
});
