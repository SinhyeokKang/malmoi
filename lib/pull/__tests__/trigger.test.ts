import { describe, expect, it, vi } from "vitest";

/**
 * `triggerPull`은 두 진입점(cron 라우트·Server Action)이 공유하는 **유일한 조립층**인데 어느
 * 테스트도 지나지 않았다 — 라우트 테스트는 이 모듈을 `vi.mock`으로 통째로 바꾼다
 * (2026-09-04 audit #26). 여기서는 반대로 **바깥**(GitHub·DB)만 바꾸고 조립 자체를 지난다.
 */

const hoisted = vi.hoisted(() => ({
  createGitClient: vi.fn(),
  loadPullState: vi.fn(),
  saveLastPulledAt: vi.fn(),
}));
vi.mock("@/lib/github", () => ({ createGitClient: hoisted.createGitClient }));
vi.mock("../load", () => ({ loadPullState: hoisted.loadPullState, saveLastPulledAt: hoisted.saveLastPulledAt }));

import { SYNC_BRANCH, triggerPull } from "../trigger";

describe("triggerPull — 조립", () => {
  it("편집이 없으면 1층에서 끝나고 GitHub 클라이언트를 만들지 않는다", async () => {
    hoisted.loadPullState.mockResolvedValue({
      project: {
        id: "p1",
        slug: "slug",
        repoOwner: "o",
        repoName: "r",
        baseBranch: "main",
        installationId: "1",
        adapterName: "json-catalog",
        pathTemplate: "i18n/{locale}.json",
        nested: null,
        nestedByPath: null,
        baseLocale: "en",
        lastPulledAt: new Date("2026-09-04T00:00:00Z"),
      },
      localeCodes: ["en"],
      keys: [],
      maxUpdatedAt: new Date("2026-09-03T00:00:00Z"),
    });
    const result = await triggerPull({} as never, "slug");
    expect(result).toEqual({ status: "skipped", reason: "no-edits" });
    expect(hoisted.createGitClient).not.toHaveBeenCalled();
    expect(hoisted.loadPullState).toHaveBeenCalledWith({}, "slug");
  });

  it("installationId가 없으면 클라이언트를 만들지 않고 던진다 — 조용히 빈 PR을 내는 대신 즉시 알린다", async () => {
    hoisted.loadPullState.mockResolvedValue({
      project: {
        id: "p1",
        slug: "slug",
        repoOwner: "o",
        repoName: "r",
        baseBranch: "main",
        installationId: null,
        adapterName: "json-catalog",
        pathTemplate: "i18n/{locale}.json",
        nested: null,
        nestedByPath: null,
        baseLocale: "en",
        lastPulledAt: null,
      },
      localeCodes: ["en"],
      keys: [],
      maxUpdatedAt: new Date("2026-09-03T00:00:00Z"),
    });
    await expect(triggerPull({} as never, "slug")).rejects.toThrow(/installationId/);
    expect(hoisted.createGitClient).not.toHaveBeenCalled();
  });

  it("브랜치 이름은 상수다 — 여러 개를 쓰지 않는다", () => {
    expect(SYNC_BRANCH).toBe("l10n/sync");
  });
});
