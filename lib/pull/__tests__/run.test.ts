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
  nestedByPath: null,
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

      surfaces: [{ ...({ ...PROJECT }), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: KEYS }],
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

        surfaces: [{ ...({ ...PROJECT, lastPulledAt: new Date("2026-09-01T11:00:00Z") }), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: KEYS }],
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

        surfaces: [{ ...({ ...PROJECT }), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: [] }],
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

        surfaces: [{ ...({ ...PROJECT, lastPulledAt: new Date("2026-09-01T11:00:00Z") }), id: "s1", slug: "default", localeCodes: ["en"], keys: KEYS }],
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
      // 재생성 어댑터도 원본을 읽는다 — 표현(들여쓰기)을 관측하려면 내용이 필요하다.
      blobs: { [blobSha(KO_CONTENT)]: KO_CONTENT, [blobSha(EN_CONTENT)]: EN_CONTENT },
    });
    const { deps } = makeDeps({}, { client, calls });
    const result = await runPull(deps);

    // 원본을 읽는 것까지가 2층 판정 전의 정상 경로다. 커밋·PR 경로로는 가지 않는다.
    // ⚠️ **마지막 `getRefSha`가 2026-09-09에 붙었다** — sync 브랜치가 base보다 앞서 있는지 확인한다
    // (아래 describe). 1층 스킵의 "API 0회"는 그대로다 — 이 경로는 편집이 있었던 실행이다.
    expect(calls.map((c) => c.method)).toEqual([
      "getRefSha",
      "getTree",
      "getBlobText",
      "getBlobText",
      "getRefSha",
    ]);
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
      // 재생성 어댑터도 원본을 읽는다 — 표현(들여쓰기)을 관측하려면 내용이 필요하다.
      blobs: { [blobSha(KO_CONTENT)]: KO_CONTENT, [blobSha(EN_CONTENT)]: EN_CONTENT },
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
      // 재생성 어댑터도 원본을 읽는다 — 표현(들여쓰기)을 관측하려면 내용이 필요하다.
      blobs: { [blobSha(KO_CONTENT)]: KO_CONTENT, [blobSha(EN_CONTENT)]: EN_CONTENT },
    });
    const { deps, writes } = makeDeps({}, { client, calls });
    await runPull(deps);
    expect(writes[0]?.getTime()).toBe(captured.getTime());
  });
});

/**
 * **2층이 변경 0건일 때 sync 브랜치를 base로 되돌린다** (T6 실측 발견 B, 2026-09-09).
 *
 * ⚠️ `planPullChanges`가 비교하는 것은 **base 트리**다. 사용자가 편집을 되돌려 렌더가 base와
 * 같아지면 변경 0건이라 커밋을 만들지 않고, `l10n/sync-<slug>`는 **직전 스냅샷 그대로** 남는다 —
 * 그 PR을 머지하면 **되돌린 편집이 리포에 적용된다.** ARCHITECTURE §3이 그 브랜치를 "현재 DB
 * 상태의 스냅샷"이라 부르는데 이 경우 그 불변식이 깨져 있었다. 실측으로 정확히 그 상태를 만났다.
 *
 * 고치는 방향은 불변식을 **바꾸는 것이 아니라 지키는 것**이다: 브랜치를 base head로 force update하면
 * 그 시점의 DB 상태(= base와 동일)를 그대로 가리킨다. PR은 재사용 규칙대로 열린 채 남고 diff만 0이 된다.
 */
describe("runPull — 2층 스킵에서 sync 브랜치를 base로 되돌린다", () => {
  /** 파일이 전부 base와 같은 상태. 이 셋이 2층 스킵 경로의 공통 입력이다. */
  function cleanClient(refSha: Record<string, string>) {
    return createFakeGitClient({
      refSha,
      tree: {
        basehead: [
          { path: "i18n/ko.json", sha: blobSha(KO_CONTENT) },
          { path: "i18n/en.json", sha: blobSha(EN_CONTENT) },
        ],
      },
      blobs: { [blobSha(KO_CONTENT)]: KO_CONTENT, [blobSha(EN_CONTENT)]: EN_CONTENT },
    });
  }

  it("브랜치가 base보다 앞서 있으면 base head로 되돌린다", async () => {
    const { client, calls } = cleanClient({ "heads/dev": "basehead", "heads/l10n/sync": "stale" });
    const { deps } = makeDeps({}, { client, calls });
    const result = await runPull(deps);

    const forced = calls.filter((c) => c.method === "updateRefForce");
    expect(forced).toEqual([{ method: "updateRefForce", args: ["l10n/sync", "basehead"] }]);
    // 되돌리는 것뿐이다 — 커밋·트리·PR 경로로 가지 않는다.
    expect(calls.map((c) => c.method)).not.toContain("createCommit");
    expect(calls.map((c) => c.method)).not.toContain("createPr");
    expect(result).toEqual({ status: "skipped", reason: "no-changes" });
  });

  it("브랜치가 이미 base head면 건드리지 않는다 — 무의미한 force가 매일 밤 나가면 안 된다", async () => {
    const { client, calls } = cleanClient({ "heads/dev": "basehead", "heads/l10n/sync": "basehead" });
    const { deps } = makeDeps({}, { client, calls });
    await runPull(deps);
    expect(calls.map((c) => c.method)).not.toContain("updateRefForce");
  });

  /** 브랜치가 아직 없는 것은 정상 상태다(첫 실행 전) — 되돌릴 것이 없고 만들지도 않는다. */
  it("브랜치가 없으면 만들지 않는다", async () => {
    const { client, calls } = cleanClient({ "heads/dev": "basehead" });
    const { deps } = makeDeps({}, { client, calls });
    await runPull(deps);
    expect(calls.map((c) => c.method)).not.toContain("createRef");
    expect(calls.map((c) => c.method)).not.toContain("updateRefForce");
  });

  it("되돌린 뒤에도 lastPulledAt은 갱신한다 — export == base가 검증된 순간이다", async () => {
    const { client, calls } = cleanClient({ "heads/dev": "basehead", "heads/l10n/sync": "stale" });
    const { deps, writes } = makeDeps({}, { client, calls });
    await runPull(deps);
    expect(writes).toEqual([new Date("2026-09-01T10:00:00Z")]);
  });

  /** ⚠️ `lastPublishedAt`은 건드리지 않는다 — 되돌리기는 "보낸" 것이 아니다 (design §3.4). */
  it("되돌리기는 published로 세지 않는다", async () => {
    const published: unknown[] = [];
    const { client, calls } = cleanClient({ "heads/dev": "basehead", "heads/l10n/sync": "stale" });
    const { deps } = makeDeps(
      { saveLastPulledAt: async (_id, _at, pub) => { published.push(pub); } },
      { client, calls },
    );
    await runPull(deps);
    expect(published).toEqual([undefined]);
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
    expect(result).toMatchObject({ status: "committed", pr: "created" });
  });

  /**
   * ⚠️ **화면 문구가 이 값으로 갈린다** — "Sent for review"(새로 보냄)와 "Updated what you sent
   * earlier"(먼저 보낸 것을 갱신)는 편집자에게 다른 사실이다. 재사용 판정은 이미 하고 있었고
   * 값으로만 안 내고 있었다 (design §3.4).
   */
  it("열린 PR을 재사용하면 pr는 updated다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [] },
      openPrUrl: "https://github.com/o/r/pull/7",
    });
    const { deps } = makeDeps({}, { client, calls });
    expect(await runPull(deps)).toMatchObject({ status: "committed", pr: "updated" });
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

        surfaces: [{ ...({ ...PROJECT, installationId: null }), id: "s1", slug: "default", localeCodes: ["en"], keys: KEYS }],
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

  // ⚠️ 이름이 한 번 낡았다: 전에는 "writeStrategy가 surgical이기 때문"이었는데, 원본 포맷 보존
  // 뒤로는 **어댑터 종류와 무관하게** 읽는다. 이 블록이 여전히 지키는 것은 그 내용이 write까지
  // 도달해 주석이 보존되는가다 (POSTMORTEM 2026-09-03 "테스트의 이름만 정확했다").
  it("per-locale 수술적 어댑터가 원본 내용을 받아 값만 갈아끼운다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [{ path: "config/locales/ko.yml", sha: "sha-ko" }] },
      blobs: { "sha-ko": yamlSource },
    });
    await runPull({
      loadState: async () => ({
        project: yamlProject,

        surfaces: [{ ...(yamlProject), id: "s1", slug: "default", localeCodes: ["ko"], keys: [{ key: "a.one", sourceText: "one", orphaned: false, cells: { ko: { value: "하나!" } } }] }],
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

        surfaces: [{ ...(yamlProject), id: "s1", slug: "default", localeCodes: ["ko"], keys: [{ key: "a.one", sourceText: "one", orphaned: false, cells: { ko: { value: "하나!" } } }] }],
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
    // "값만 바뀐" — 편집한 줄 외에는 원본과 같아야 한다. 전에는 포함 여부만 봐서 통짜 재작성이
    // 통과했다 (2026-09-04 audit #24). yaml `doc.toString()` 결함(TASKS)이 정확히 이 경로다.
    const payload = created?.args[0] as { tree: Array<{ path: string; content: string }> };
    const written = payload.tree.find((t) => t.path === "config/locales/ko.yml")?.content ?? "";
    const before = yamlSource.split("\n");
    const after = written.split("\n");
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed.length).toBeLessThanOrEqual(1);
    expect(after.length).toBe(before.length);
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

        surfaces: [{ ...(tsProject), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: [
          {
            key: "a.one",
            sourceText: "one",
            orphaned: false,
            cells: { ko: { value: "하나!" }, en: { value: "one!" } },
          },
        ] }],
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

        surfaces: [{ ...(tsProject), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: [
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
        ] }],
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

        surfaces: [{ ...(tsProject), id: "s1", slug: "default", localeCodes: ["en", "ko"], keys: [
          {
            key: "a.one",
            sourceText: "one",
            orphaned: false,
            cells: { ko: { value: "" }, en: { value: "one!" } },
          },
        ] }],
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

describe("runPull — writer가 버린 항목이 결과에 실린다", () => {
  it("json-catalog 접두 충돌로 빠진 키가 warnings로 나온다 — survey만 보던 것을 프로덕션 경로가 본다", async () => {
    const { deps } = makeDeps({
      loadState: async (): Promise<PullState> => ({
        project: { ...PROJECT },

        surfaces: [{ ...({ ...PROJECT, nested: true }), id: "s1", slug: "default", localeCodes: ["en"], keys: [
          { key: "a.b", sourceText: "leaf", orphaned: false, cells: { en: { value: "leaf" } } },
          { key: "a.b.c", sourceText: "deeper", orphaned: false, cells: { en: { value: "deeper" } } },
        ] }],
        maxUpdatedAt: new Date("2026-09-01T10:00:00Z"),
      }),
    });
    const result = await runPull(deps);
    expect(result.status).toBe("committed");
    expect(result.warnings?.length ?? 0).toBeGreaterThan(0);
    expect(result.warnings?.[0]).toMatch(/^default: i18n\/en\.json: /);
  });

  it("버린 항목이 없으면 warnings 필드 자체가 없다 — 없는 것과 같아야 한다", async () => {
    const { deps } = makeDeps();
    const result = await runPull(deps);
    expect(result).not.toHaveProperty("warnings");
  });
});
