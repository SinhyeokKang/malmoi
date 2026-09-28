import { expect, it } from "vitest";

import { GITHUB_RELEASES_API_URL, GITHUB_RELEASES_URL, GITHUB_REPO, GITHUB_REPO_URL, releaseTagUrl } from "../links";

/** 리포 좌표는 `GITHUB_REPO` 하나에서 조립한다 — `SinhyeokKang/malmoi`를 새로 흩지 않는다. */
it("리포 URL · Releases URL · API URL이 GITHUB_REPO에서 파생된다", () => {
  expect(GITHUB_REPO).toBe("SinhyeokKang/malmoi");
  expect(GITHUB_REPO_URL).toBe(`https://github.com/${GITHUB_REPO}`);
  expect(GITHUB_RELEASES_URL).toBe(`https://github.com/${GITHUB_REPO}/releases`);
  expect(GITHUB_RELEASES_API_URL).toBe(`https://api.github.com/repos/${GITHUB_REPO}/releases`);
});

it("releaseTagUrl은 그 판의 Release 페이지다", () => {
  expect(releaseTagUrl("v1.0.1")).toBe("https://github.com/SinhyeokKang/malmoi/releases/tag/v1.0.1");
});
