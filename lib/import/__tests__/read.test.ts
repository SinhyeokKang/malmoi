import { describe, expect, it, vi } from "vitest";
import { sizesFromSnapshot, type RepoReader, type RepoSnapshot } from "@/lib/repo-host/reader";
import { IngestBudgetError } from "@/lib/onboarding/budget";
import { readFiles, snapshotError } from "../read";

const snapshot: Extract<RepoSnapshot, { status: "ok" }> = {
  status: "ok", headSha: "a".repeat(40), headCommittedAt: "2026-09-15T00:00:00Z",
  files: [{ path: "en.json", sha: "en-blob", size: 20 }, { path: "ko.json", sha: "ko-blob", size: 20 }],
};
const reader = (blob = vi.fn<RepoReader["blob"]>().mockResolvedValue('{}')): RepoReader => ({ sizes: async (snapshot, paths) => sizesFromSnapshot(snapshot, paths),
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
  it("⚠️ 파일 수 상한은 크기 조회보다 먼저다 — 크기를 원격으로 묻는 호스트(GitLab GraphQL)가 상한 초과 목록에 원격을 부르지 않는다", async () => {
    const sizes = vi.fn<RepoReader["sizes"]>();
    const repo = { ...reader(), sizes };
    const many = Array.from({ length: 201 }, (_, i) => `l/${i}.json`);
    await expect(readFiles(repo, { ...snapshot, files: many.map((path) => ({ path, sha: path, size: 1 })) }, many)).rejects.toBeInstanceOf(IngestBudgetError);
    expect(sizes).not.toHaveBeenCalled();
  });
  it("⚠️ 크기 조회가 LFS 포인터를 알리면 예산 거부(resource-limit)다 — 포인터를 내려받아 파싱하지 않는다", async () => {
    const repo = { ...reader(), sizes: vi.fn<RepoReader["sizes"]>().mockResolvedValue({ status: "lfs", path: "en.json" }) };
    await expect(readFiles(repo, snapshot, ["en.json"])).rejects.toBeInstanceOf(IngestBudgetError);
    expect(repo.blob).not.toHaveBeenCalled();
  });
  it("크기 조회 실패(unavailable)는 예산 초과가 아니다 — 원격 장애로 남는다(design §2)", async () => {
    const repo = { ...reader(), sizes: vi.fn<RepoReader["sizes"]>().mockResolvedValue({ status: "unavailable" }) };
    const error = await readFiles(repo, snapshot, ["en.json"]).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(IngestBudgetError);
    expect(error).toBeInstanceOf(Error);
    expect(repo.blob).not.toHaveBeenCalled();
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
