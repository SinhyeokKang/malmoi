import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepoReader, RepoSnapshot } from "@/lib/github";
import * as detection from "@/lib/onboarding/detect";
import { readSurfaceSnapshot } from "../surface";

const snapshot: Extract<RepoSnapshot, { status: "ok" }> = {
  status: "ok", headSha: "a".repeat(40), headCommittedAt: "2026-09-15T00:00:00Z",
  files: ["en", "fr", "ko"].map(locale => ({ path: `locales/${locale}.json`, sha: `${locale}-blob`, size: 20 })),
};
const format = { adapter: "json-catalog" as const, pathTemplate: "locales/{locale}.json", baseLocale: "en" };

describe("readSurfaceSnapshot", () => {
  afterEach(() => vi.restoreAllMocks());
  it("적재가 추가로 요구하는 경로도 attempted와 합쳐서 내려받는다", async () => {
    vi.spyOn(detection, "ingestTargets").mockReturnValue(["extra/ja.json"]);
    const blob = vi.fn<RepoReader["blob"]>().mockResolvedValue('{"hello":"Hello"}');
    const result = await readSurfaceSnapshot({ snapshot: vi.fn(), blob }, {
      ...snapshot, files: [...snapshot.files, { path: "extra/ja.json", sha: "extra-blob", size: 20 }],
    }, format);
    expect(result).toMatchObject({ status: "ok", targets: ["extra/ja.json", "locales/en.json", "locales/fr.json", "locales/ko.json"] });
    expect(blob.mock.calls).toEqual([["en-blob"], ["fr-blob"], ["ko-blob"], ["extra-blob"]]);
  });
  it("성공한 blob은 재요청하지 않고 실패한 blob만 한 번 재시도한다", async () => {
    const blob = vi.fn<RepoReader["blob"]>()
      .mockResolvedValueOnce('{"hello":"Hello"}').mockResolvedValueOnce('{"hello":"Bonjour"}').mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('{"hello":"안녕"}');
    const result = await readSurfaceSnapshot({ snapshot: vi.fn(), blob }, snapshot, format);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected prepared snapshot");
    expect(result.targets).toEqual(["locales/en.json", "locales/fr.json", "locales/ko.json"]);
    expect([...result.blobs.keys()]).toEqual(result.targets);
    expect(result.baseLocale).toBe("en");
    expect(blob.mock.calls).toEqual([["en-blob"], ["fr-blob"], ["ko-blob"], ["ko-blob"]]);
  });
  it("재시도도 실패한 경로를 targets에서 지우지 않는다", async () => {
    const blob = vi.fn<RepoReader["blob"]>().mockImplementation(async sha => sha !== "ko-blob" ? '{"hello":"Hello"}' : undefined);
    const result = await readSurfaceSnapshot({ snapshot: vi.fn(), blob }, snapshot, format);
    expect(result).toMatchObject({ status: "ok", targets: ["locales/en.json", "locales/fr.json", "locales/ko.json"] });
    if (result.status !== "ok") throw new Error("expected prepared snapshot");
    expect(result.blobs.has("locales/ko.json")).toBe(false);
  });
  it("base 다운로드 실패를 정상 빈 카탈로그로 바꾸지 않는다", async () => {
    const blob = vi.fn<RepoReader["blob"]>().mockImplementation(async sha => sha !== "en-blob" ? '{"hello":"안녕"}' : undefined);
    expect(await readSurfaceSnapshot({ snapshot: vi.fn(), blob }, snapshot, format)).toEqual({ status: "rejected", reason: "base-locale-missing" });
  });
  it("트리의 크기 예산을 유지한다", async () => {
    const blob = vi.fn<RepoReader["blob"]>();
    await expect(readSurfaceSnapshot({ snapshot: vi.fn(), blob }, { ...snapshot, files: snapshot.files.map(file => ({ ...file, size: undefined })) }, format)).rejects.toThrow("resource limits");
    expect(blob).not.toHaveBeenCalled();
  });
});
