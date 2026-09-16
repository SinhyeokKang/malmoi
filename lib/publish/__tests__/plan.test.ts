import { expect, it } from "vitest";
import { planPublishButton, planPublishView } from "../plan";
import { buildPublishDiff, type PublishCell } from "../diff";
import { summarizeWarnings } from "../warnings";
import { parseGithubPrUrl } from "@/lib/projects/pr-url";
import { SYNC_ERROR_CODES } from "@/lib/sync/plan";

const committed = { status: "committed", pr: "created", prUrl: "https://github.com/o/r/pull/12", commitSha: "abc", changed: ["ko.json"] as string[] } as const;
it("실행 결과 여덟 갈래와 스킵 경고를 보존한다", () => {
  expect(planPublishView(committed)).toBe("created");
  expect(planPublishView({ ...committed, pr: "updated" })).toBe("updated");
  expect(planPublishView({ ...committed, warnings: ["x"] })).toBe("partial");
  for (const reason of ["no-edits", "no-changes"] as const) expect(planPublishView({ status: "skipped", reason })).toBe("no-changes");
  expect(planPublishView({ status: "skipped", reason: "no-changes", warnings: ["x"] })).toBe("no-changes");
  for (const error of ["already-running", "too-soon"] as const) expect(planPublishView({ status: "failed", error, delivery: "not-started" })).toBe(error);
  for (const error of ["unauthorized", "not-found", "archived", "not-ready", "invalid input", "unavailable"]) {
    expect(planPublishView({ status: "failed", error, retryable: error === "unavailable", delivery: "not-started" })).toBe(error === "unavailable" ? "transient-error" : "config-error");
  }
  for (const code of SYNC_ERROR_CODES) {
    const retryable = !["base-unreadable", "not-installed", "glob-matched-nothing"].includes(code);
    expect(planPublishView({ status: "failed", error: "safe", code, retryable, delivery: "unknown" })).toBe(retryable ? "transient-error" : "config-error");
  }
});
it("0건은 비활성이나 실행 중에는 재열기가 우선한다", () => {
  expect(planPublishButton({ count: 0, paused: false, otherPending: false, publishPending: false })).toMatchObject({ mode: "preview", disabled: true, badge: null, hint: expect.any(String) });
  expect(planPublishButton({ count: 0, paused: true, otherPending: true, publishPending: true })).toMatchObject({ mode: "progress", disabled: false, badge: null });
  expect(planPublishButton({ count: 2, paused: false, otherPending: true, publishPending: false }).disabled).toBe(true);
});
const cell = (over: Partial<PublishCell> = {}): PublishCell => ({ surface: "web", path: "ko.json", keyId: "k1", key: "hello", localeCode: "ko", after: "new", author: "Editor", updatedAt: "2026-09-16", ...over });
it("파일·키·로케일로 정렬하고 키 병합과 상한 초과 수를 센다", () => {
  const rows = [cell({ localeCode: "ko" }), cell({ localeCode: "en" }), cell({ keyId: "k2", key: "z" })];
  const result = buildPublishDiff(rows, {}, 2);
  expect(result.truncated).toBe(1);
  expect(result.groups[0]?.rows.map(r => [r.localeCode, r.keySpan])).toEqual([["en", 2], ["ko", 0]]);
  expect(buildPublishDiff(rows, {}, 3).truncated).toBe(0);
  expect(buildPublishDiff([], {}).groups).toEqual([]);
});
it("프로토타입 경로·로케일·키를 상속 조회하지 않는다", () => {
  const row = cell({ path: "__proto__", localeCode: "constructor", key: "toString" });
  expect(buildPublishDiff([row], {}).groups[0]?.rows[0]?.before).toBeNull();
  const base = Object.create(null);
  base.__proto__ = Object.create(null);
  base.__proto__.constructor = Object.create(null);
  base.__proto__.constructor.toString = "old";
  expect(buildPublishDiff([row], base).groups[0]?.rows[0]?.before).toBe("old");
  expect(buildPublishDiff([row], base)).toEqual(buildPublishDiff([row], base));
});
it("경고를 파일별로 묶되 파서 원문의 개행을 보존한다", () => {
  const groups = summarizeWarnings(["web: ko.yml: bad\n  x\n  ^", "web: ko.yml: other", "plain"]);
  expect(groups[0]).toEqual({ file: "web: ko.yml", messages: ["bad\n  x\n  ^", "other"] });
  expect(groups[1]?.messages).toEqual(["plain"]);
});
it("PR URL은 원본 리포·origin·양의 안전 정수를 검증하고 삼상태를 보존한다", () => {
  const repo = { repoOwner: "o", repoName: "r" };
  expect(parseGithubPrUrl(null, repo)).toBeNull();
  expect(parseGithubPrUrl(undefined, repo)).toBeUndefined();
  expect(parseGithubPrUrl(committed.prUrl, repo)).toEqual({ number: 12, url: committed.prUrl });
  for (const raw of ["https://evil.com/o/r/pull/1", "https://github.com/x/r/pull/1", "https://u@github.com/o/r/pull/1", "https://github.com/o/r/pull/0", "https://github.com/o/r/pull/9007199254740992", "broken"]) expect(parseGithubPrUrl(raw, repo)).toBeUndefined();
});

it("바뀐 단어만 표시하고 공백·여러 줄을 보존한다", async () => {
  const { diffWords } = await import("../words");
  const result = diffWords("hello old\nworld", "hello new\nworld");
  expect(result.before.filter(t => t.changed).map(t => t.text).join("")).toBe("old");
  expect(result.after.filter(t => t.changed).map(t => t.text).join("")).toBe("new");
  expect(result.before.map(t => t.text).join("")).toBe("hello old\nworld");
  expect(diffWords("", "")).toEqual({ before: [], after: [] });
});
