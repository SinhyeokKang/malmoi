import { describe, expect, it } from "vitest";

import { readFiles } from "@/lib/import/read";
import { sizesFromSnapshot, type RepoReader, type RepoSnapshot } from "@/lib/repo-host/reader";

import { probeTargets } from "../detect";

/**
 * **탐지 표본이 없는 파일을 겨누지 않는다** (review-B R1). basePath 후보에 모든 로케일을 치환하면 기준 언어의 치환 경로
 * (`values-en/strings.xml`)가 트리에 없는데도 대상에 들어가고, 크기를 모르는 파일은 다운로드 예산이 거부한다 —
 * 탐지 전체가 `resource-limit`로 끝난다. 표본 선택(`probeTargets`) → 다운로드(`readFiles` — 크기 조회·예산)를 이어 잰다.
 */
const BASE = "res/values/strings.json";
const KO = "res/values-ko/strings.json";
const EN = "res/values-en/strings.json";
const group = { pathTemplate: "res/values-{locale}/strings.json", basePath: BASE, locales: ["en", "ko"] };

function repo(paths: readonly string[]) {
  const snapshot: Extract<RepoSnapshot, { status: "ok" }> = {
    status: "ok", headSha: "h", headCommittedAt: "2026-10-19T00:00:00Z",
    files: paths.map((path, i) => ({ path, sha: `sha-${i}`, size: 10 })),
  };
  const blobs = new Map(snapshot.files.map((file) => [file.sha, `{"from":"${file.path}"}`]));
  const reader: RepoReader = {
    snapshot: async () => snapshot,
    blob: async (sha) => blobs.get(sha),
    sizes: async (s, wanted) => sizesFromSnapshot(s, wanted),
  };
  return { snapshot, reader };
}

describe("probeTargets → readFiles — basePath 후보", () => {
  it("values-en/이 없으면 그 경로를 겨누지 않고, basePath와 실재하는 치환 파일만 내려받는다", async () => {
    const paths = [BASE, KO];
    const targets = probeTargets([group], [], paths, new Map());
    expect(targets).not.toContain(EN);
    expect([...targets].sort()).toEqual([KO, BASE].sort());
    const { snapshot, reader } = repo(paths);
    await expect(readFiles(reader, snapshot, targets)).resolves.toHaveLength(2);
  });

  it("values-en/이 함께 있으면 셋 다 내려받는다 — 재탐지가 무엇을 기준으로 볼지는 어댑터가 정한다", async () => {
    const paths = [BASE, KO, EN];
    const targets = probeTargets([group], [], paths, new Map());
    expect([...targets].sort()).toEqual([BASE, EN, KO].sort());
    const { snapshot, reader } = repo(paths);
    await expect(readFiles(reader, snapshot, targets)).resolves.toHaveLength(3);
  });

  it("basePath가 트리에 없으면 그것도 겨누지 않는다 — 존재하지 않는 경로를 크기 조회에 넘기지 않는다", async () => {
    const paths = [KO];
    const targets = probeTargets([group], [], paths, new Map());
    expect(targets).toEqual([KO]);
    const { snapshot, reader } = repo(paths);
    await expect(readFiles(reader, snapshot, targets)).resolves.toHaveLength(1);
  });

  it("basePath 없는 후보는 지금처럼 치환 표본이다 — 탐지 후보는 트리에서 왔으므로 실재한다", () => {
    expect(probeTargets([{ pathTemplate: "i18n/{locale}.json", locales: ["en", "ko"] }], [], ["i18n/en.json", "i18n/ko.json"], new Map()))
      .toEqual(["i18n/en.json", "i18n/ko.json"]);
  });
});
