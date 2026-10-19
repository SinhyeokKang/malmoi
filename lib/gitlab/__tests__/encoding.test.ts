import { describe, expect, it } from "vitest";

import { encodeFileContent } from "@/lib/file-encoding";
import { blobSha } from "@/lib/githash";
import type { RenderKey } from "@/lib/pull/render";
import { runPull, type PullDeps, type PullState } from "@/lib/pull/run";

import { createGitLabClient, openGitLabReader } from "../client";
import { createFakeGitLabRepo, type FileBody } from "./fake-repo";

/**
 * **GitLab에서 읽은 로케일 파일이 원본 인코딩을 지킨다** (apple-strings Q1 결함 D1 · mobile-strings design §3 M3 계약). GitLab의 JSON blob API는 UTF-16 파일을 UTF-8(+BOM)로
 * 바꾼 사본을 준다 — 그것을 읽으면 편집 0건에도 렌더가 파일 전체를 UTF-8+BOM으로 다시 쓰고 바뀐 파일로 센다. 원본 바이트는 `/repository/blobs/:sha/raw`만 준다.
 * 가짜 리포(`fake-repo.ts`)가 그 실측을 흉내 낸다.
 */

const BASE = "b".repeat(40);
const REPO = "87515176";
const CREDENTIAL = { token: "t", expiresAt: null, gitlabUserId: "101" };
const TARGET = { host: "gitlab" as const, owner: "g/sub", name: "app", repositoryId: REPO, connectionId: "conn-1" };
const TEMPLATE = "App/{locale}.lproj/Localizable.strings";
const EN = "App/en.lproj/Localizable.strings";
const KO = "App/ko.lproj/Localizable.strings";
const FR = "App/fr.lproj/Localizable.strings";

const EN_TEXT = '/* Title */\n"title" = "Home";\n"count" = "%d items";\n';
const KO_TEXT = '/* 제목 */\r\n"title" = "홈";\r\n"count" = "%d개";\r\n';
const FR_TEXT = '"title" = "Accueil";\n"count" = "%d éléments";\n';
const FILES: Record<string, FileBody> = {
  [EN]: EN_TEXT,
  [KO]: encodeFileContent(KO_TEXT, "utf-16le-bom"),
  [FR]: encodeFileContent(FR_TEXT, "utf-16be"),
};

const cells = (ko: string, fr: string, en: string) => ({ en: { value: en }, ko: { value: ko }, fr: { value: fr } });
function state(keys: RenderKey[]): PullState {
  const project = {
    id: "p1", slug: "app", repoOwner: "g/sub", repoName: "app", baseBranch: "main", repoHost: "gitlab", installationId: null, repositoryId: REPO, gitlabConnectionId: "conn-1", lastPulledAt: null,
  };
  const surface = { adapterName: "apple-strings", pathTemplate: TEMPLATE, nested: null, nestedByPath: null, baseLocale: "en", localeCodes: ["en", "fr", "ko"], basePath: null, id: "s1", slug: "default", keys };
  return { project, surfaces: [surface], maxUpdatedAt: new Date("2026-10-19T10:00:00Z"), unpublished: 1, pendingEdits: [] };
}
const keysWith = (koTitle: string): RenderKey[] => [
  { key: "title", sourceText: "Home", sortIndex: 0, orphaned: false, cells: cells(koTitle, "Accueil", "Home") },
  { key: "count", sourceText: "%d items", sortIndex: 1, orphaned: false, cells: cells("%d개", "%d éléments", "%d items") },
];

async function publish(keys: RenderKey[], files: Record<string, FileBody> = FILES) {
  const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: files } });
  const deps: PullDeps = {
    loadState: async () => state(keys),
    createClient: async () => createGitLabClient(TARGET, CREDENTIAL, { fetch: repo.fetch }),
    saveLastPulledAt: async () => {}, invalidateDelivery: async () => {}, syncBranch: "malmoi-i18n/sync-app",
  };
  const result = await runPull(deps);
  const commit = repo.writes().find((call) => call.url.pathname.endsWith("/repository/commits"));
  const actions = commit === undefined ? [] : (JSON.parse(commit.body!) as { actions: { file_path: string; content: string; encoding: string }[] }).actions;
  return { repo, result, actions };
}

describe("GitLab 리더 — UTF-16 로케일 파일", () => {
  it("UTF-16LE+BOM·UTF-16BE 파일은 편집 0건이면 바뀐 파일이 없고 쓰기가 0회다", async () => {
    const { result, repo } = await publish(keysWith("홈"));
    expect(result).toMatchObject({ status: "skipped", reason: "no-changes" });
    expect(repo.writes()).toEqual([]);
    // 원본 바이트는 `/raw`로만 읽는다 — JSON blob API(변환 사본)를 부르지 않는다.
    const blobReads = repo.calls.filter((call) => call.url.pathname.includes("/repository/blobs/"));
    expect(blobReads.length).toBeGreaterThan(0);
    expect(blobReads.every((call) => call.url.pathname.endsWith("/raw"))).toBe(true);
  });

  it("편집 하나는 그 파일만 원본 인코딩·BOM 그대로 base64 action으로 나가고 저장 바이트가 렌더와 같다", async () => {
    const { result, actions, repo } = await publish(keysWith("홈 화면"));
    expect(result).toMatchObject({ status: "committed" });
    const expected = encodeFileContent(KO_TEXT.replace('"홈"', '"홈 화면"'), "utf-16le-bom");
    expect(actions).toEqual([{ action: "update", file_path: KO, content: expected.toString("base64"), encoding: "base64" }]);
    const head = repo.branches.get("malmoi-i18n/sync-app")!;
    expect(blobSha(repo.commits.get(head)!.get(KO) as Buffer)).toBe(blobSha(expected));
    // 고치지 않은 BE 파일은 원본 그대로다.
    expect((repo.commits.get(head)!.get(FR) as Buffer).equals(FILES[FR] as Buffer)).toBe(true);
  });

  it("잘못된 UTF-8은 `/raw` 바이트로 명시 실패에 닿는다 — 변환 사본으로 조용히 적재·커밋하지 않는다", async () => {
    const broken = { ...FILES, [FR]: Buffer.from([0x22, 0x74, 0x22, 0x20, 0x3d, 0x20, 0x22, 0xff, 0x22, 0x3b, 0x0a]) };
    const { result, repo } = await publish(keysWith("홈 화면"), broken);
    expect(result).toMatchObject({ status: "skipped", reason: "writer-warnings" });
    expect(repo.writes()).toEqual([]);
  });

  it("온보딩 리더도 원본 바이트로 디코드한다 — 변환 사본의 BOM 글자가 붙지 않는다", async () => {
    const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: FILES } });
    const reader = await openGitLabReader(TARGET, CREDENTIAL, { fetch: repo.fetch });
    const snapshot = await reader.snapshot("main");
    if (snapshot.status !== "ok") throw new Error(JSON.stringify(snapshot));
    const sha = (path: string) => snapshot.files.find((f) => f.path === path)!.sha;
    expect(await reader.blob(sha(KO), KO)).toBe(KO_TEXT);
    expect(await reader.blob(sha(FR), FR)).toBe(FR_TEXT);
    expect(await reader.blob(sha(EN), EN)).toBe(EN_TEXT);
  });
});
