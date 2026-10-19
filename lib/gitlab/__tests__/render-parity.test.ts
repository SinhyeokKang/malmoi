import { describe, expect, it } from "vitest";

import { blobSha } from "@/lib/githash";
import { createFakeGitClient } from "@/lib/pull/__tests__/fake-client";
import type { RenderKey } from "@/lib/pull/render";
import { runPull, type PullDeps, type PullResult, type PullState } from "@/lib/pull/run";

import { createGitLabClient } from "../client";
import { createFakeGitLabRepo } from "./fake-repo";

/**
 * **다섯 포맷 × 두 리포 호스트 render 바이트 동일** (gitlab-repositories spec 완료 조건 2 · tasks §3). 같은 DB 상태 + 같은 원본 파일을 GitHub 경로(가짜 `GitClient`)와
 * GitLab 경로(실제 GitLab 클라이언트 + 가짜 리포)에 넣고, 커밋에 실린 파일의 바이트·blob hash가 같은지 본다. export 결정성(불변식)이 호스트를 타지 않는다는 단언이다 —
 * 판정(`runPull`·어댑터)이 한 벌이고 호스트는 바이트를 나를 뿐이다.
 */

const BASE = "b".repeat(40);
const REPO = "87515176";

type Surface = { adapterName: string; pathTemplate: string; nested: boolean | null; nestedByPath: Record<string, boolean> | null; baseLocale: string; localeCodes: string[] };

function state(surface: Surface, keys: RenderKey[]): PullState {
  const project = {
    id: "p1", slug: "app", repoOwner: "g/sub", repoName: "app", baseBranch: "main", repoHost: "gitlab", installationId: null, repositoryId: REPO, gitlabConnectionId: "conn-1", lastPulledAt: null,
  };
  return { project, surfaces: [{ ...surface, basePath: null, id: "s1", slug: "default", keys }], maxUpdatedAt: new Date("2026-10-12T10:00:00Z"), unpublished: 1, pendingEdits: [] };
}

const deps = (s: PullState, createClient: PullDeps["createClient"]): PullDeps => ({
  loadState: async () => s, createClient, saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-app",
});

async function viaGithub(s: PullState, files: Record<string, string>): Promise<{ result: PullResult; written: Map<string, string> }> {
  const { client, calls } = createFakeGitClient({
    refSha: { "heads/main": BASE },
    tree: { [BASE]: Object.entries(files).map(([path, content]) => ({ path, sha: blobSha(content) })) },
    blobs: Object.fromEntries(Object.values(files).map((content) => [blobSha(content), content])),
  });
  const result = await runPull(deps(s, async () => client));
  const snapshot = calls.find((call) => call.method === "publishSnapshot")?.args[0] as { changes: { path: string; content: string }[] } | undefined;
  return { result, written: new Map(snapshot?.changes.map((c) => [c.path, c.content]) ?? []) };
}

async function viaGitlab(s: PullState, files: Record<string, string>): Promise<{ result: PullResult; written: Map<string, string> }> {
  const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: files } });
  const result = await runPull(deps(s, async (target) => {
    if (target.host !== "gitlab") throw new Error("unexpected host");
    return createGitLabClient(target, { token: "t", expiresAt: null, gitlabUserId: "101" }, { fetch: repo.fetch });
  }));
  const commit = repo.writes().find((call) => call.url.pathname.endsWith("/repository/commits"));
  const actions = commit === undefined ? [] : (JSON.parse(commit.body!) as { actions: { file_path: string; content: string }[] }).actions;
  return { result, written: new Map(actions.map((a) => [a.file_path, a.content])) };
}

/** 결과에서 호스트가 정하는 값(커밋 SHA·PR 링크)만 뺀다 — 나머지(바뀐 파일·셀 수·경고)는 같아야 한다. */
function hostNeutral(result: PullResult): unknown {
  if (result.status !== "committed") return result;
  const { commitSha: _sha, prUrl: _url, ...rest } = result;
  return rest;
}

const key = (k: string, cells: Record<string, string>, over: Partial<RenderKey> = {}): RenderKey => ({
  key: k, sourceText: cells.en ?? "", orphaned: false, cells: Object.fromEntries(Object.entries(cells).map(([locale, value]) => [locale, { value }])), ...over,
});

const TS_DICT = `const ko = {\n  // 인사말\n  "a.one": "하나",\n} as const;\n\nconst en = {\n  // 인사말\n  "a.one": "one",\n} as const;\n\nexport const ns = { ko, en };\n`;

const CASES: { name: string; surface: Surface; keys: RenderKey[]; files: Record<string, string> }[] = [
  {
    name: "json-catalog — 중첩 · 빈 `{}` 중첩(POSTMORTEM 2026-09-29)",
    surface: { adapterName: "json-catalog", pathTemplate: "locales/{locale}.json", nested: true, nestedByPath: null, baseLocale: "en", localeCodes: ["en", "ko"] },
    keys: [key("a.one", { en: "one", ko: "하나!" })],
    files: { "locales/en.json": '{\n  "a": {\n    "one": "one"\n  },\n  "empty": {}\n}\n', "locales/ko.json": '{\n  "a": {\n    "one": "하나"\n  },\n  "empty": {}\n}\n' },
  },
  {
    name: "chrome-locales — `placeholders: null`(2026-09-24)",
    surface: { adapterName: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", nested: null, nestedByPath: null, baseLocale: "en", localeCodes: ["en", "ko"] },
    keys: [key("hello", { en: "Hello", ko: "안녕!" })],
    files: {
      "_locales/en/messages.json": '{\n  "hello": {\n    "message": "Hello",\n    "placeholders": null\n  }\n}\n',
      "_locales/ko/messages.json": '{\n  "hello": {\n    "message": "안녕",\n    "placeholders": null\n  }\n}\n',
    },
  },
  {
    name: "yaml-catalog — 수술적(주석·빈 줄 보존)",
    surface: { adapterName: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml", nested: null, nestedByPath: {}, baseLocale: "en", localeCodes: ["en", "ko"] },
    keys: [key("hello", { en: "Hi", ko: "안녕!" })],
    files: { "config/locales/en.yml": "en:\n  # greeting\n  hello: Hi\n", "config/locales/ko.yml": "ko:\n  # greeting\n  hello: 안녕\n" },
  },
  {
    name: "code-dict — 수술적",
    surface: { adapterName: "code-dict", pathTemplate: "i18n/{locale}.ts", nested: null, nestedByPath: null, baseLocale: "en", localeCodes: ["en", "ko"] },
    keys: [key("a", { en: "one", ko: "하나!" })],
    files: { "i18n/en.ts": "export default { a: 'one' };\n", "i18n/ko.ts": "export default { a: '하나' };\n" },
  },
  {
    name: "ts-dict — multi-locale 수술적",
    surface: { adapterName: "ts-dict", pathTemplate: "src/i18n/ns/*.ts", nested: null, nestedByPath: null, baseLocale: "en", localeCodes: ["ko", "en"] },
    keys: [key("a.one", { en: "one", ko: "하나!" })],
    files: { "src/i18n/ns/ns.ts": TS_DICT },
  },
  {
    name: "json-catalog — 빈 키 목록",
    surface: { adapterName: "json-catalog", pathTemplate: "locales/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en", localeCodes: ["en", "ko"] },
    keys: [],
    files: { "locales/en.json": '{\n  "a": "one"\n}\n', "locales/ko.json": '{\n  "a": "하나"\n}\n' },
  },
  {
    name: "json-catalog — orphan은 export에서 빠진다",
    surface: { adapterName: "json-catalog", pathTemplate: "locales/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en", localeCodes: ["en", "ko"] },
    keys: [key("a", { en: "one", ko: "하나!" }), key("gone", { en: "x", ko: "엑스" }, { orphaned: true })],
    files: { "locales/en.json": '{\n  "a": "one",\n  "gone": "x"\n}\n', "locales/ko.json": '{\n  "a": "하나",\n  "gone": "엑스"\n}\n' },
  },
  {
    name: "json-catalog — 로케일 누락(파일 없는 비-base 로케일)",
    surface: { adapterName: "json-catalog", pathTemplate: "locales/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en", localeCodes: ["en", "ko", "fr"] },
    keys: [key("a", { en: "one", ko: "하나!" })],
    files: { "locales/en.json": '{\n  "a": "one"\n}\n', "locales/ko.json": '{\n  "a": "하나"\n}\n' },
  },
];

describe("render 바이트 동일 — GitHub ≡ GitLab", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const github = await viaGithub(state(c.surface, c.keys), c.files);
    const gitlab = await viaGitlab(state(c.surface, c.keys), c.files);
    expect(hostNeutral(gitlab.result)).toEqual(hostNeutral(github.result));
    expect([...gitlab.written.keys()].sort()).toEqual([...github.written.keys()].sort());
    for (const [path, content] of github.written) {
      expect(gitlab.written.get(path), path).toBe(content);
      expect(blobSha(gitlab.written.get(path)!), path).toBe(blobSha(content));
    }
  });

  it("다섯 포맷 모두 실제로 커밋을 냈다 — 동일 단언이 '둘 다 아무것도 안 씀'으로 공허하게 서지 않는다", async () => {
    for (const c of CASES.slice(0, 5)) {
      const gitlab = await viaGitlab(state(c.surface, c.keys), c.files);
      expect(gitlab.result.status, c.name).toBe("committed");
      expect(gitlab.written.size, c.name).toBeGreaterThan(0);
    }
  });
});
