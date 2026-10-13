import { describe, expect, it } from "vitest";
import { parseSmokeInput, summarizeSmoke } from "../smoke-gitlab";

const snapshot = { status: "ok" as const, headSha: "a".repeat(40), headCommittedAt: "2026-10-12T00:00:00Z", files: [{ path: "locale.json", sha: "b".repeat(40) }] };
const tree = [{ path: "locale.json", sha: "b".repeat(40), mode: "100644" }];

describe("GitLab 읽기 전용 스모크", () => {
  it("토큰과 숫자 id 또는 중첩 경로를 받는다", () => {
    expect(parseSmokeInput({ GITLAB_TEST_TOKEN: "secret", GITLAB_TEST_PROJECT: "87515176" })).toEqual({ token: "secret", project: "87515176" });
    expect(parseSmokeInput({ GITLAB_TEST_TOKEN: "secret", GITLAB_TEST_PROJECT: "group/sub/repo" })).toEqual({ token: "secret", project: "group/sub/repo" });
  });
  it.each([{}, { GITLAB_TEST_TOKEN: "secret" }, { GITLAB_TEST_TOKEN: "x\ny", GITLAB_TEST_PROJECT: "1" }, { GITLAB_TEST_TOKEN: "secret", GITLAB_TEST_PROJECT: "https://gitlab.com/g/r" }])("잘못된 입력은 값을 노출하지 않는 코드로 거부한다", (env) => {
    expect(() => parseSmokeInput(env)).toThrow("input-invalid");
  });
  it("허용된 집계 필드만 출력하며 디렉터리는 blob 대조에서 뺀다", () => {
    expect(summarizeSmoke(snapshot, [...tree, { path: "secret-dir", sha: "secret", mode: "040000" }], { status: "ok", sizes: new Map([["locale.json", 17]]) }, 2)).toBe("smoke:gitlab ok connection=ok identity=ok blobs=1 bytes=17 openMRs=2");
  });
  it.each(["truncated", "base-branch-missing", "unavailable"] as const)("스냅샷 %s를 성공으로 보고하지 않는다", (status) => {
    expect(() => summarizeSmoke({ status }, tree, { status: "ok", sizes: new Map() }, 0)).toThrow(`snapshot-${status}`);
  });
  it("개수만 같아도 다른 blob이면 실패한다", () => {
    expect(() => summarizeSmoke(snapshot, [{ ...tree[0]!, sha: "c".repeat(40) }], { status: "ok", sizes: new Map([["locale.json", 17]]) }, 0)).toThrow("tree-mismatch");
  });
  it("크기 누락과 LFS를 성공으로 보고하지 않는다", () => {
    expect(() => summarizeSmoke(snapshot, tree, { status: "ok", sizes: new Map() }, 0)).toThrow("sizes-incomplete");
    expect(() => summarizeSmoke(snapshot, tree, { status: "lfs", path: "secret" }, 0)).toThrow("sizes-lfs");
    expect(() => summarizeSmoke(snapshot, tree, { status: "unavailable" }, 0)).toThrow("sizes-unavailable");
  });
});
