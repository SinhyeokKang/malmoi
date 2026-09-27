import { describe, expect, it } from "vitest";

import { isSyncBranchName, SYNC_BRANCH_PREFIX } from "../ref-slug";
import { syncBranchFor } from "../sync-branch";

/**
 * **Malmoi가 스스로 force update하는 브랜치는 base가 될 수 없다** (malmoi#126). base가 sync 브랜치면 Sync는 우리의 미머지 산출물을 읽고
 * Publish는 그 브랜치에서 자기 자신으로 PR을 낸다. 이 프로젝트 것만이 아니라 **접두 전체**를 막는다 — 다른 프로젝트의 sync 브랜치도
 * 같은 리포에서 force update되는 산출물이다.
 */
describe("isSyncBranchName", () => {
  it("이 프로젝트의 sync 브랜치를 가린다 — `syncBranchFor`가 만든 이름", () => {
    expect(isSyncBranchName(syncBranchFor("bugshot-i18n-test-qa"))).toBe(true);
  });

  it("다른 프로젝트의 sync 브랜치도 가린다 — 접두 전체", () => {
    expect(isSyncBranchName(`${SYNC_BRANCH_PREFIX}other`)).toBe(true);
    expect(isSyncBranchName(`${SYNC_BRANCH_PREFIX}`)).toBe(true);
  });

  it.each(["main", "dev", "release/2.0", "malmoi-i18n/other", "feature/malmoi-i18n/sync-x", "Malmoi-i18n/sync-x"])("%s는 sync 브랜치가 아니다", (name) => {
    expect(isSyncBranchName(name)).toBe(false);
  });
});
