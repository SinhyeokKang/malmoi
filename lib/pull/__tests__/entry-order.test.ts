import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadPullState } from "../load";
import type { TreePayload } from "../payload";
import type { GitTreeBlob } from "../client";
import { runPull, type PullDeps, type PullState } from "../run";
import type { RenderKey } from "../render";
import { createFakeGitClient } from "./fake-client";

/**
 * **L1 — 진입점 회귀** (ARCHITECTURE §1.1).
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
  nestedByPath: null as unknown,
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

      surfaces: [{ ...({ ...PROJECT }), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: [...keys] }],
      maxUpdatedAt: new Date("2026-09-01T10:00:00Z"), unpublished: 1,
    }),
    createClient: async () => client,
    saveLastPulledAt: async () => {},
    syncBranch: "malmoi-i18n/sync",
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
    $transaction: async (fn: (tx: PrismaClient) => Promise<unknown>) => fn(prisma),
    project: {
      findUnique: async () => ({
        ...PROJECT,
        surfaces: [{ ...PROJECT, id: "s1", slug: "default", locales: [{ code: "en" }, { code: "ko" }] }],
      }),
    },
    stringKey: { findMany },
    translation: { aggregate: async () => ({ _max: { updatedAt: null } }), count: async () => 0 },
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

  /**
   * **1층의 두 쿼리와 그것을 태울 인덱스가 짝이다** (2026-09-04 audit #45, T0로 둘이 됐다).
   * 캡처용 `aggregate({ where: { projectId }, _max: { updatedAt } })`는 `(projectId, updatedAt)` 인덱스가
   * 있으면 역방향 스캔 첫 행에서 멈추고, 판정용 `count(unpublishedWhere(…))`는 같은 인덱스의
   * `updatedAt > lastPulledAt` 범위를 탄다(dev DB EXPLAIN: 2,721행에서 3행). 없으면 그 프로젝트 파티션
   * 전체를 훑는다. 야간 cron이 **매일** 부르는 쿼리라 인덱스가 사라지면 조용히 느려지고 게이트에는 안 나타난다.
   */
  it("캡처 aggregate와 1층 count가 탈 인덱스가 스키마에 있다 — 쿼리와 인덱스가 함께 움직여야 한다", () => {
    expect(sourceOf("lib/pull/load.ts")).toContain("_max: { updatedAt: true }");
    expect(sourceOf("lib/pull/load.ts")).toContain("unpublishedWhere(project.id, project.lastPulledAt)");
    // 범위 조건이 술어에서 빠지면 count가 인덱스 범위를 못 타고 프로젝트 전 행을 훑는다.
    expect(sourceOf("lib/keys/unpublished.ts")).toContain("updatedAt: { gt: lastPulledAt }");
    expect(sourceOf("prisma/schema.prisma")).toContain("@@index([projectId, updatedAt])");
  });

  it("그 문자열이 pull 쪽에는 없다 — grep하면 두 곳이 잡히던 함정을 여기서 가른다", () => {
    expect(sourceOf("lib/pull/load.ts")).not.toContain('orderBy: { key: "asc" }');
  });
});

/**
 * **musicblocks 모양** (ARCHITECTURE §1.35). 로케일 84개 중 1개만 중첩인데 포맷 단위 boolean이
 * 형제 파일까지 중첩으로 만들어 평평한 파일의 점 키가 쪼개지고 값이 사라졌다. 어댑터·survey는
 * `nestedByPath`로 고쳤지만 **push→DB→pull 배선이 끊겨 프로덕션 pull은 옛 동작이었다** —
 * 그래서 진입점에서 본다.
 */
describe("L1 — runPull이 파일별 중첩 여부를 지킨다", () => {
  const DOTTED: RenderKey[] = [
    { key: "Clear workspace", sourceText: "Clear workspace", sortIndex: 0, orphaned: false, cells: { th: { value: "ล้าง" } } },
    { key: "Clear workspace.", sourceText: "Clear workspace.", sortIndex: 1, orphaned: false, cells: { th: { value: "ล้าง." } } },
  ];

  function depsWith(nestedByPath: Record<string, boolean> | null): ReturnType<typeof depsFor> {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [] },
    });
    const trees: TreePayload[] = [];
    return {
      deps: {
        loadState: async (): Promise<PullState> => ({
          // 포맷 전체는 중첩이다 — 다른 로케일 파일 하나가 객체를 갖고 있었다.
          project: { ...PROJECT },

          surfaces: [{ ...({ ...PROJECT, nested: true, nestedByPath, baseLocale: "th" }), id: "s1", slug: "default", localeCodes: ["th"], keys: [...DOTTED] }],
          maxUpdatedAt: new Date("2026-09-01T10:00:00Z"), unpublished: 1,
        }),
        createClient: async () => client,
        saveLastPulledAt: async () => {},
        syncBranch: "malmoi-i18n/sync",
      },
      get trees() {
        trees.length = 0;
        for (const c of calls) if (c.method === "createTree") trees.push(c.args[0] as TreePayload);
        return trees;
      },
    };
  }

  it("그 파일이 중첩이면 점 키를 경로로 펼친다 — 진입점에서 `true` 쪽도 본다 (2026-09-04 audit #25)", async () => {
    const h = depsWith({ "i18n/th.json": true });
    await runPull(h.deps);
    const out = contentOf(h.trees, "i18n/th.json");
    // 두 키가 같은 접두 `Clear workspace`를 가지므로 중첩으로 펼치면 하나가 객체가 돼 충돌한다 —
    // 그 경우 writer가 한쪽을 버리고 경고를 낸다. 여기서는 **flat과 다른 출력**이라는 것만 고정한다.
    expect(out).not.toBe('{\n  "Clear workspace": "ล้าง",\n  "Clear workspace.": "ล้าง."\n}\n');
  });

  it("그 파일이 flat이면 점 키를 쪼개지 않는다 — 쪼개면 한쪽 값이 사라진다", async () => {
    const h = depsWith({ "i18n/th.json": false });
    await runPull(h.deps);
    expect(contentOf(h.trees, "i18n/th.json")).toBe(
      '{\n  "Clear workspace": "ล้าง",\n  "Clear workspace.": "ล้าง."\n}\n',
    );
  });

  it("경로별 관측이 없으면 포맷 단위 값으로 폴백한다 (하위 호환 — 접두 충돌이 경고로 남는다)", async () => {
    const h = depsWith(null);
    const r = await runPull(h.deps);
    expect(r.warnings?.length ?? 0).toBeGreaterThan(0);
  });
});

/**
 * **L1 — 표현 보존이 진입점까지 닿는가** (ARCHITECTURE §1.1 태스크 3).
 *
 * 어댑터 단위 테스트는 원본이 write까지 도달하는 **배선이 끊겨도 전부 green이다** — 그게 이
 * 리포가 다섯 번 밟은 실패 유형이고, `nestedByPath`가 정확히 그 상태로 있었다. 여기서는
 * `runPull`이 **커밋에 실은 파일 바이트**를 본다.
 */
describe("L1 — runPull이 원본 들여쓰기를 지킨다", () => {
  const FOUR = '{\n    "a.one": "one",\n    "a.two": "two"\n}\n';

  function depsWithSource(opts: { blobs?: Record<string, string>; tree?: GitTreeBlob[] } = {}) {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: opts.tree ?? [{ path: "i18n/en.json", sha: "blob-en" }] },
      blobs: opts.blobs ?? { "blob-en": FOUR },
    });
    const trees: TreePayload[] = [];
    return {
      deps: {
        loadState: async (): Promise<PullState> => ({
          project: { ...PROJECT },

          surfaces: [{ ...({ ...PROJECT, baseLocale: "en" }), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: [
            { key: "a.one", sourceText: "one", sortIndex: 0, orphaned: false, cells: { en: { value: "one" }, ko: { value: "하나" } } },
            { key: "a.two", sourceText: "two", sortIndex: 1, orphaned: false, cells: { en: { value: "two" }, ko: { value: "둘" } } },
          ] }],
          maxUpdatedAt: new Date("2026-09-01T10:00:00Z"), unpublished: 1,
        }),
        createClient: async () => client,
        saveLastPulledAt: async () => {},
        syncBranch: "malmoi-i18n/sync",
      },
      get trees() {
        trees.length = 0;
        for (const c of calls) if (c.method === "createTree") trees.push(c.args[0] as TreePayload);
        return trees;
      },
      calls,
    };
  }

  it("base 트리의 4칸 원본을 읽어 그 폭으로 커밋한다 — 홉이 하나만 끊겨도 red다", async () => {
    const h = depsWithSource();
    const r = await runPull(h.deps);
    expect(r.status).toBe("committed");
    expect(contentOf(h.trees, "i18n/en.json")).toBe(FOUR);
  });

  it("탭 원본도 진입점까지 그대로다 — 4칸만 있던 축이다 (2026-09-04 audit #25)", async () => {
    const TAB = '{\n\t"a.one": "one",\n\t"a.two": "two"\n}\n';
    const h = depsWithSource({ blobs: { "blob-en": TAB } });
    await runPull(h.deps);
    expect(contentOf(h.trees, "i18n/en.json")).toBe(TAB);
  });

  it("원본이 없는 로케일도 파일이 나온다 — 재생성은 원본 없이도 만든다 (신규 로케일, 2칸)", async () => {
    const h = depsWithSource();
    await runPull(h.deps);
    expect(contentOf(h.trees, "i18n/ko.json")).toBe('{\n  "a.one": "하나",\n  "a.two": "둘"\n}\n');
  });

  it("재생성 어댑터에도 blob을 읽는다 — 전에는 surgical일 때만 읽었다", async () => {
    const h = depsWithSource();
    await runPull(h.deps);
    expect(h.calls.filter((c) => c.method === "getBlobText").map((c) => c.args[0])).toEqual(["blob-en"]);
  });

  it("트리에 없는 경로는 blob을 안 읽는다 — 없는 SHA를 요구하면 fake가 던진다", async () => {
    const h = depsWithSource({ tree: [], blobs: {} });
    const r = await runPull(h.deps);
    expect(r.status).toBe("committed");
    expect(h.calls.some((c) => c.method === "getBlobText")).toBe(false);
  });
});
