import { describe, expect, it } from "vitest";

import { repoBlobUrl, repoCompareUrl, repoWebUrl } from "../repo-web";

/**
 * 리포 호스트의 웹 주소 (gitlab-repositories tasks §5 · consumers.md §3.4). 화면이 `https://github.com/${owner}/${repo}`를 손으로 조립하던
 * 자리(Home 메타·Logs·설정·목록 compare·코드 참조)가 한 곳을 지난다. GitLab은 하위 그룹을 보존하고 `/-/` 아래 경로를 쓴다.
 */
describe("repoWebUrl", () => {
  it.each([
    ["github", "acme", "web", "https://github.com/acme/web"],
    ["gitlab", "group/sub", "web", "https://gitlab.com/group/sub/web"],
    // 모르는 값은 열 기본값과 같은 GitHub이다
    ["bitbucket", "acme", "web", "https://github.com/acme/web"],
  ])("%s %s/%s", (host, owner, name, url) => {
    expect(repoWebUrl(host, owner, name)).toBe(url);
  });
});

it("compare — GitHub `/compare/a...b` · GitLab `/-/compare/a...b`", () => {
  expect(repoCompareUrl("github", "acme", "web", "abc", "main")).toBe("https://github.com/acme/web/compare/abc...main");
  expect(repoCompareUrl("gitlab", "g/s", "web", "abc", "main")).toBe("https://gitlab.com/g/s/web/-/compare/abc...main");
});

it("blob 줄 링크 — GitHub `/blob/<sha>/<path>#L<n>` · GitLab `/-/blob/<sha>/<path>#L<n>`", () => {
  expect(repoBlobUrl("github", "acme", "web", "deadbeef", "src/a.ts", 7)).toBe("https://github.com/acme/web/blob/deadbeef/src/a.ts#L7");
  expect(repoBlobUrl("gitlab", "g/s", "web", "deadbeef", "src/a.ts", 7)).toBe("https://gitlab.com/g/s/web/-/blob/deadbeef/src/a.ts#L7");
});
