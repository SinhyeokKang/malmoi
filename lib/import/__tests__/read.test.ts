import { describe, expect, it, vi } from "vitest";
import type { RepoReader, RepoSnapshot } from "@/lib/github";
import { IngestBudgetError } from "@/lib/onboarding/budget";
import { readFiles, snapshotError } from "../read";

const snapshot: Extract<RepoSnapshot, { status: "ok" }> = {
  status: "ok", headSha: "a".repeat(40), headCommittedAt: "2026-09-15T00:00:00Z",
  files: [{ path: "en.json", sha: "en-blob", size: 20 }, { path: "ko.json", sha: "ko-blob", size: 20 }],
};
const reader = (blob = vi.fn<RepoReader["blob"]>().mockResolvedValue('{}')): RepoReader => ({
  snapshot: vi.fn(), blob,
});

describe("readFiles", () => {
  it("경로 대신 스냅샷의 blob SHA로 읽고 다운로드 실패만 뺀다", async () => {
    const blob = vi.fn<RepoReader["blob"]>().mockResolvedValueOnce('{}').mockResolvedValueOnce(undefined);
    expect(await readFiles(reader(blob), snapshot, ["en.json", "ko.json"])).toEqual([{ path: "en.json", content: '{}' }]);
    expect(blob.mock.calls).toEqual([["en-blob"], ["ko-blob"]]);
  });
  it.each([undefined, 2_000_001])("트리 크기 %s는 다운로드 전에 거부한다", async size => {
    const repo = reader();
    await expect(readFiles(repo, { ...snapshot, files: [{ path: "en.json", sha: "sha", size }] }, ["en.json"])).rejects.toBeInstanceOf(IngestBudgetError);
    expect(repo.blob).not.toHaveBeenCalled();
  });
  it("실제 UTF-8 바이트도 검사한다", async () => {
    await expect(readFiles(reader(vi.fn().mockResolvedValue('한'.repeat(700_000))), snapshot, ["en.json"])).rejects.toBeInstanceOf(IngestBudgetError);
  });
  it("reader 예외를 빈 다운로드로 숨기지 않는다", async () => {
    const error = new Error("offline");
    await expect(readFiles(reader(vi.fn().mockRejectedValue(error)), snapshot, ["en.json"])).rejects.toBe(error);
  });
  it.each([
    ["truncated", "tree-truncated"], ["base-branch-missing", "base-branch-missing"], ["unavailable", "unavailable"],
  ] as const)("%s의 원래 오류를 보존한다", (status, expected) => {
    expect(snapshotError({ status })).toBe(expected);
  });
});
