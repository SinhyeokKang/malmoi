import { describe, expect, it } from "vitest";

import { parseGitLabMrUrl, parseReviewUrl } from "../pr-url";

/**
 * 저장된 Publish 링크(`lastPrUrl`·열린 MR 조회 결과) → 번호 (gitlab-repositories design §3 "리포 호스트 URL 판정"). 원본 리포·origin·양의 안전 정수를 검증하고
 * 삼상태(`null` 없음 · `undefined` 모름)를 보존한다 — GitHub 판정(`parseGithubPrUrl`, `lib/publish/__tests__/plan.test.ts`)과 같은 규칙이다.
 */
describe("parseGitLabMrUrl", () => {
  const repo = { repoOwner: "g/sub", repoName: "app" };
  const url = "https://gitlab.com/g/sub/app/-/merge_requests/12";

  it("하위 그룹 주소의 MR 번호(iid)를 읽고 삼상태를 보존한다", () => {
    expect(parseGitLabMrUrl(url, repo)).toEqual({ number: 12, url });
    expect(parseGitLabMrUrl("https://gitlab.com/G/Sub/App/-/merge_requests/3", repo)).toEqual({ number: 3, url: "https://gitlab.com/G/Sub/App/-/merge_requests/3" });
    expect(parseGitLabMrUrl(null, repo)).toBeNull();
    expect(parseGitLabMrUrl(undefined, repo)).toBeUndefined();
  });

  it.each([
    "https://evil.com/g/sub/app/-/merge_requests/1",
    "https://u@gitlab.com/g/sub/app/-/merge_requests/1",
    "https://gitlab.com/g/app/-/merge_requests/1",
    "https://gitlab.com/g/sub/other/-/merge_requests/1",
    "https://gitlab.com/x/g/sub/app/-/merge_requests/1",
    "https://gitlab.com/g/sub/app/-/merge_requests/0",
    "https://gitlab.com/g/sub/app/-/merge_requests/9007199254740992",
    "https://gitlab.com/g/sub/app/-/issues/1",
    "https://gitlab.com/g/sub/app/merge_requests/1",
    "https://github.com/g/sub/app/-/merge_requests/1",
    "broken",
  ])("%s → undefined(남의 리포·호스트·모양)", (raw) => {
    expect(parseGitLabMrUrl(raw, repo)).toBeUndefined();
  });
});

describe("parseReviewUrl — 프로젝트 호스트로 고른다", () => {
  it("GitHub 프로젝트는 PR URL, GitLab 프로젝트는 MR URL만 받는다 — 다른 호스트의 링크는 모름이다", () => {
    const github = { repoHost: "github", repoOwner: "o", repoName: "r" };
    const gitlab = { repoHost: "gitlab", repoOwner: "o", repoName: "r" };
    expect(parseReviewUrl("https://github.com/o/r/pull/4", github)).toEqual({ number: 4, url: "https://github.com/o/r/pull/4" });
    expect(parseReviewUrl("https://gitlab.com/o/r/-/merge_requests/4", gitlab)).toEqual({ number: 4, url: "https://gitlab.com/o/r/-/merge_requests/4" });
    expect(parseReviewUrl("https://github.com/o/r/pull/4", gitlab)).toBeUndefined();
    expect(parseReviewUrl("https://gitlab.com/o/r/-/merge_requests/4", github)).toBeUndefined();
    expect(parseReviewUrl("https://github.com/o/r/pull/4", { ...github, repoHost: "bitbucket" })).toBeUndefined();
    expect(parseReviewUrl(null, gitlab)).toBeNull();
  });
});
