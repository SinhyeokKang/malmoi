import { describe, expect, it } from "vitest";
import { blobSha } from "@/lib/githash";
import { SKIP_MARKER } from "../payload";
import { runPull, type PullDeps, type PullState } from "../run";
import { createFakeGitClient, type FakeCall } from "./fake-client";
import type { RenderKey } from "../render";
import type { GitClient } from "../client";

/**
 * 오케스트레이션 테스트. **tasks.md 2단계가 요구한 다섯 가지가 여기 있다** —
 * 1층 스킵 시 호출 0회, 실패 시 `lastPulledAt` 미갱신, 2층 스킵 시 갱신,
 * `multi-locale`의 파일별 write, 빈 값이 writer에 도달하지 않음.
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

const KO_CONTENT = '{\n  "a.one": "하나"\n}\n';
const EN_CONTENT = '{\n  "a.one": "one"\n}\n';

const KEYS: RenderKey[] = [
  {
    key: "a.one",
    sourceText: "one",
    orphaned: false,
    cells: { ko: { value: "하나" }, en: { value: "one" } },
  },
];

/** 기록용 저장소. `lastPulledAt` 쓰기가 실제로 일어났는지 본다. */
function makeDeps(
  over: Partial<PullDeps> = {},
  /** 주면 이 fake를 쓴다 — 반환되는 `calls`도 그쪽 것이라 두 fake가 갈리지 않는다. */
  given?: { client: GitClient; calls: FakeCall[] },
): {
  deps: PullDeps;
  writes: (Date | null)[];
  calls: FakeCall[];
} {
  const writes: (Date | null)[] = [];
  const made = createFakeGitClient({
    refSha: { "heads/dev": "basehead" },
    tree: { basehead: [] },
  });
  const { client, calls } = given ?? made;
  const deps: PullDeps = {
    loadState: async (): Promise<PullState> => ({
      project: { ...PROJECT },
      localeCodes: ["en", "ko"],
      keys: KEYS,
      maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
    }),
    createClient: async () => client,
    saveLastPulledAt: async (_projectId, at) => {
      writes.push(at);
    },
    syncBranch: "l10n/sync",
    ...over,
  };
  return { deps, writes, calls };
}

describe("runPull — 1층 DB 측 스킵", () => {
  it("편집이 lastPulledAt 이후로 없으면 GitHub을 한 번도 부르지 않는다 (spec 완료 조건 4)", async () => {
    const { client, calls } = createFakeGitClient({});
    const result = await runPull({
      loadState: async () => ({
        project: { ...PROJECT, lastPulledAt: new Date("2026-09-01T11:00:00Z") },
        localeCodes: ["en", "ko"],
        keys: KEYS,
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    });

    expect(calls).toEqual([]);
    expect(result).toEqual({ status: "skipped", reason: "no-edits" });
  });

  it("편집이 0건이어도 부르지 않는다", async () => {
    const { client, calls } = createFakeGitClient({});
    await runPull({
      loadState: async () => ({
        project: { ...PROJECT },
        localeCodes: ["en", "ko"],
        keys: [],
        maxUpdatedAt: null,
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    });
    expect(calls).toEqual([]);
  });

  it("1층 스킵에서는 lastPulledAt을 쓰지 않는다 — 이미 최신이다", async () => {
    const writes: (Date | null)[] = [];
    const { client } = createFakeGitClient({});
    await runPull({
      loadState: async () => ({
        project: { ...PROJECT, lastPulledAt: new Date("2026-09-01T11:00:00Z") },
        localeCodes: ["en"],
        keys: KEYS,
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async (_p, at) => void writes.push(at),
      syncBranch: "l10n/sync",
    });
    expect(writes).toEqual([]);
  });
});

describe("runPull — 2층 blob SHA 스킵", () => {
  it("파일이 전부 같으면 커밋·PR 경로로 가지 않는다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: {
        basehead: [
          { path: "i18n/ko.json", sha: blobSha(KO_CONTENT) },
          { path: "i18n/en.json", sha: blobSha(EN_CONTENT) },
        ],
      },
    });
    const { deps } = makeDeps({}, { client, calls });
    const result = await runPull(deps);

    expect(calls.map((c) => c.method)).toEqual(["getRefSha", "getTree"]);
    expect(result).toEqual({ status: "skipped", reason: "no-changes" });
  });

  it("2층 스킵에서도 lastPulledAt을 갱신한다 — 안 하면 값 불변 push 뒤 매일 밤 트리를 다시 읽는다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: {
        basehead: [
          { path: "i18n/ko.json", sha: blobSha(KO_CONTENT) },
          { path: "i18n/en.json", sha: blobSha(EN_CONTENT) },
        ],
      },
    });
    const { deps, writes } = makeDeps({}, { client, calls });
    await runPull(deps);
    expect(writes).toEqual([new Date("2026-09-01T10:00:00Z")]);
  });

  it("갱신 값은 now()가 아니라 캡처한 max(updatedAt)이다 — 그 사이 편집이 영영 스킵되면 안 된다", async () => {
    const captured = new Date("2026-09-01T10:00:00Z");
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: {
        basehead: [
          { path: "i18n/ko.json", sha: blobSha(KO_CONTENT) },
          { path: "i18n/en.json", sha: blobSha(EN_CONTENT) },
        ],
      },
    });
    const { deps, writes } = makeDeps({}, { client, calls });
    await runPull(deps);
    expect(writes[0]?.getTime()).toBe(captured.getTime());
  });
});

describe("runPull — 커밋·PR 경로", () => {
  it("변경이 있으면 트리→커밋→ref→PR 순으로 부른다", async () => {
    const { deps, calls } = makeDeps();
    const result = await runPull(deps);

    expect(calls.map((c) => c.method)).toEqual([
      "getRefSha",
      "getTree",
      "createTree",
      "createCommit",
      "getRefSha",
      "createRef",
      "findOpenPrUrl",
      "createPr",
    ]);
    expect(result).toMatchObject({ status: "committed" });
  });

  it("트리 페이로드에 base_tree가 들어간다", async () => {
    const { deps, calls } = makeDeps();
    await runPull(deps);
    expect(calls.find((c) => c.method === "createTree")?.args[0]).toMatchObject({
      base_tree: "basehead",
    });
  });

  it("커밋 parents가 base head 하나이고 메시지에 [skip-l10n]이 있다", async () => {
    const { deps, calls } = makeDeps();
    await runPull(deps);
    const payload = calls.find((c) => c.method === "createCommit")?.args[0] as {
      parents: string[];
      message: string;
    };
    expect(payload.parents).toEqual(["basehead"]);
    expect(payload.message).toContain(SKIP_MARKER);
  });

  it("l10n/sync가 없으면 createRef, 있으면 updateRefForce다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead", "heads/l10n/sync": "oldsync" },
      tree: { basehead: [] },
    });
    const { deps } = makeDeps({}, { client, calls });
    await runPull(deps);
    expect(calls.map((c) => c.method)).toContain("updateRefForce");
    expect(calls.map((c) => c.method)).not.toContain("createRef");
  });

  it("열린 PR이 있으면 재사용한다 — 새로 만들지 않는다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [] },
      openPrUrl: "https://github.com/o/r/pull/7",
    });
    const { deps } = makeDeps({}, { client, calls });
    const result = await runPull(deps);
    expect(calls.map((c) => c.method)).not.toContain("createPr");
    expect(result).toMatchObject({ prUrl: "https://github.com/o/r/pull/7" });
  });

  it("PR 조회 head가 owner:branch 형식이다 — 브랜치명만 넘기면 필터가 조용히 무시된다", async () => {
    const { deps, calls } = makeDeps();
    await runPull(deps);
    expect(calls.find((c) => c.method === "findOpenPrUrl")?.args).toEqual(["o:l10n/sync", "dev"]);
  });

  it("성공하면 lastPulledAt을 캡처 값으로 갱신한다", async () => {
    const { deps, writes } = makeDeps();
    await runPull(deps);
    expect(writes).toEqual([new Date("2026-09-01T10:00:00Z")]);
  });
});

describe("runPull — 실패 처리", () => {
  it("커밋이 실패하면 lastPulledAt을 쓰지 않는다 — 쓰면 그 편집이 영영 안 나간다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [] },
      failOn: "createCommit",
    });
    const { deps, writes } = makeDeps({}, { client, calls });
    await expect(runPull(deps)).rejects.toThrow(/createCommit/);
    expect(writes).toEqual([]);
  });

  it("PR 생성이 실패하면 lastPulledAt을 쓰지 않는다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [] },
      failOn: "createPr",
    });
    const { deps, writes } = makeDeps({}, { client, calls });
    await expect(runPull(deps)).rejects.toThrow(/createPr/);
    expect(writes).toEqual([]);
  });

  it("base 브랜치가 null이면 던진다 — 권한 없음이 브랜치 없음으로 오진되면 안 된다", async () => {
    const { client, calls } = createFakeGitClient({ refSha: {}, tree: {} });
    const { deps } = makeDeps({}, { client, calls });
    await expect(runPull(deps)).rejects.toThrow(/dev/);
  });

  it("installationId가 null이면 GitHub을 부르기 전에 던진다", async () => {
    const { client, calls } = createFakeGitClient({});
    const deps: PullDeps = {
      loadState: async () => ({
        project: { ...PROJECT, installationId: null },
        localeCodes: ["en"],
        keys: KEYS,
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    };
    await expect(runPull(deps)).rejects.toThrow(/installationId/);
    expect(calls).toEqual([]);
  });
});

/**
 * ⚠️ **`per-locale` + 수술적 조합** — 이 조합이 없던 시절 pull은 `layout === "multi-locale"`로
 * "원본 blob을 받아야 하나"를 판단했다. `yaml-catalog`·`code-dict`가 `per-locale`인데 수술적이라
 * 그 판단이 성립하지 않는다: 원본 없이 write에 들어가면 `null`을 받아 **PR이 조용히 비어 나간다**
 * (ARCHITECTURE §1).
 */
describe("runPull — per-locale + surgical (writeStrategy로 갈린다)", () => {
  const yamlSource = `# 사람이 넣은 주석
ko:
  a:
    one: 하나
`;
  const yamlProject = {
    ...PROJECT,
    adapterName: "yaml-catalog",
    pathTemplate: "config/locales/{locale}.yml",
    nested: null as boolean | null,
  };

  it("per-locale인데도 blob 내용을 읽는다 — writeStrategy가 surgical이기 때문이다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [{ path: "config/locales/ko.yml", sha: "sha-ko" }] },
      blobs: { "sha-ko": yamlSource },
    });
    await runPull({
      loadState: async () => ({
        project: yamlProject,
        localeCodes: ["ko"],
        keys: [{ key: "a.one", sourceText: "one", orphaned: false, cells: { ko: { value: "하나!" } } }],
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    });
    expect(calls.filter((c) => c.method === "getBlobText")).toHaveLength(1);
  });

  it("주석을 보존한 채 값만 바뀐 커밋이 나간다 (빈 PR이 아니다)", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [{ path: "config/locales/ko.yml", sha: "sha-ko" }] },
      blobs: { "sha-ko": yamlSource },
    });
    await runPull({
      loadState: async () => ({
        project: yamlProject,
        localeCodes: ["ko"],
        keys: [{ key: "a.one", sourceText: "one", orphaned: false, cells: { ko: { value: "하나!" } } }],
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    });
    const created = calls.find((c) => c.method === "createTree");
    const body = JSON.stringify(created?.args ?? {});
    expect(body).toContain("사람이 넣은 주석");
    expect(body).toContain("하나!");
  });
});

describe("runPull — multi-locale", () => {
  const source = `const ko = {
  "a.one": "하나",
} as const;

const en = {
  "a.one": "one",
} as const;

export const ns = { ko, en };
`;

  const tsProject = {
    ...PROJECT,
    adapterName: "ts-dict",
    pathTemplate: "src/i18n/ns/*.ts",
    nested: null as boolean | null,
  };

  it("파일별로 blob 내용을 읽는다 — write가 원본을 요구한다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: {
        basehead: [
          { path: "src/i18n/ns/a.ts", sha: "sha-a" },
          { path: "src/i18n/ns/b.ts", sha: "sha-b" },
        ],
      },
      blobs: { "sha-a": source, "sha-b": source },
    });
    await runPull({
      loadState: async () => ({
        project: tsProject,
        localeCodes: ["en", "ko"],
        keys: [
          {
            key: "a.one",
            sourceText: "one",
            orphaned: false,
            cells: { ko: { value: "하나!" }, en: { value: "one!" } },
          },
        ],
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    });

    expect(calls.filter((c) => c.method === "getBlobText")).toHaveLength(2);
  });

  it("두 파일이 각각 자기 원본을 받아 치환된다 — 첫 파일만 갱신되면 실패다", async () => {
    const other = source.replace("a.one", "b.one");
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: {
        basehead: [
          { path: "src/i18n/ns/a.ts", sha: "sha-a" },
          { path: "src/i18n/ns/b.ts", sha: "sha-b" },
        ],
      },
      blobs: { "sha-a": source, "sha-b": other },
    });
    await runPull({
      loadState: async () => ({
        project: tsProject,
        localeCodes: ["en", "ko"],
        keys: [
          {
            key: "a.one",
            sourceText: "one",
            orphaned: false,
            cells: { ko: { value: "하나!" }, en: { value: "one!" } },
          },
          {
            key: "b.one",
            sourceText: "one",
            orphaned: false,
            cells: { ko: { value: "비!" }, en: { value: "bee!" } },
          },
        ],
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    });

    const tree = calls.find((c) => c.method === "createTree")?.args[0] as {
      tree: { path: string; content: string }[];
    };
    const a = tree.tree.find((t) => t.path === "src/i18n/ns/a.ts");
    const b = tree.tree.find((t) => t.path === "src/i18n/ns/b.ts");
    expect(a?.content).toContain('"하나!"');
    expect(b?.content).toContain('"비!"');
  });

  it("빈 값은 writer에 도달하지 않는다 — 원본 리터럴이 남는다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [{ path: "src/i18n/ns/a.ts", sha: "sha-a" }] },
      blobs: { "sha-a": source },
    });
    await runPull({
      loadState: async () => ({
        project: tsProject,
        localeCodes: ["en", "ko"],
        keys: [
          {
            key: "a.one",
            sourceText: "one",
            orphaned: false,
            cells: { ko: { value: "" }, en: { value: "one!" } },
          },
        ],
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
      createClient: async () => client,
      saveLastPulledAt: async () => {},
      syncBranch: "l10n/sync",
    });

    const tree = calls.find((c) => c.method === "createTree")?.args[0] as {
      tree: { content: string }[];
    };
    expect(tree.tree[0]?.content).toContain('"하나"');
    expect(tree.tree[0]?.content).not.toContain('"a.one": ""');
  });
});
