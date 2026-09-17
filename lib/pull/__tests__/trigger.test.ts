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

import { createFakeGitClient } from "./fake-client";
import { syncBranchFor, triggerPull } from "../trigger";

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
        repositoryId: "100",
        adapterName: "json-catalog",
        pathTemplate: "i18n/{locale}.json",
        nested: null,
        nestedByPath: null,
        baseLocale: "en",
        lastPulledAt: new Date("2026-09-04T00:00:00Z"),
      },
      localeCodes: ["en"],
      keys: [],
      maxUpdatedAt: new Date("2026-09-03T00:00:00Z"), unpublished: 0,
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
      maxUpdatedAt: new Date("2026-09-03T00:00:00Z"), unpublished: 1,
    });
    await expect(triggerPull({} as never, "slug")).rejects.toThrow(/installationId/);
    expect(hoisted.createGitClient).not.toHaveBeenCalled();
  });

  /**
   * **경고를 서버 로그에도 낸다** (2026-09-04 audit #35). warnings는 cron 응답 JSON에만 실렸고,
   * 2층까지 통과하면 `lastPulledAt`이 갱신돼 다음 밤은 1층에서 끝난다 — 그 응답을 놓치면 경고가
   * 다시는 안 나온다. 스킵 판정을 바꾸는 쪽(`missingOriginal`처럼 지속 상태인 경고)은 매일 밤
   * 트리·blob 전량 읽기를 영구화하므로, 판정은 그대로 두고 로그에 남긴다.
   */
  it("writer가 버린 항목을 console.warn으로도 낸다 — 응답 JSON을 놓쳐도 Vercel 로그에 남는다", async () => {
    const { client } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      // 수술적 어댑터인데 트리에 그 로케일 파일이 없다 — 치환 대상이 없어 파일을 안 낸다.
      tree: { basehead: [] },
    });
    hoisted.createGitClient.mockResolvedValue(client);
    hoisted.loadPullState.mockResolvedValue({
      project: {
        id: "p1",
        slug: "fmt",
        repoOwner: "o",
        repoName: "r",
        baseBranch: "dev",
        installationId: "1",
        repositoryId: "100",
        adapterName: "yaml-catalog",
        pathTemplate: "config/locales/{locale}.yml",
        nested: null,
        nestedByPath: null,
        baseLocale: "en",
        lastPulledAt: null,
      },
      surfaces: [{ id: "s1", slug: "default", adapterName: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml", nested: null, nestedByPath: null, baseLocale: "en",
        localeCodes: ["en"], keys: [{ key: "a.one", sourceText: "one", orphaned: false, cells: { en: { value: "one" } } }] }],
      maxUpdatedAt: new Date("2026-09-04T00:00:00Z"), unpublished: 1,
    });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await triggerPull({} as never, "fmt");
    expect(result.warnings?.length ?? 0).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toContain("config/locales/en.yml");
    expect(spy.mock.calls[0]?.[0]).toContain("fmt");
    spy.mockRestore();
  });

});

/**
 * 브랜치 이름이 상수 `malmoi-i18n/sync`였다. 한 리포에 번역 표면이 둘이면 Project가 둘이 되는데
 * (PRODUCT §7.1), 그 둘이 **같은 브랜치를 force update로 서로 덮는다** — 그때는
 * 순차 실행으로 피해 간 함정이고 bugshot-2가 정확히 그 모양이다(`_locales` 4키 +
 * `ts-dict` 903키).
 */
describe("syncBranchFor — 프로젝트마다 다른 브랜치", () => {
  it("slug를 이름에 넣는다", () => {
    expect(syncBranchFor("bugshot-2")).toBe("malmoi-i18n/sync-bugshot-2");
  });

  it("**다른 프로젝트는 다른 브랜치를 받는다** — 이 함수가 존재하는 이유다", () => {
    expect(syncBranchFor("chrome-surface")).not.toBe(syncBranchFor("ts-surface"));
  });

  it("같은 slug는 언제나 같은 브랜치다 — pull이 자기 브랜치를 다시 찾아야 한다", () => {
    expect(syncBranchFor("order-check")).toBe(syncBranchFor("order-check"));
  });

  /**
   * `Project.slug`에 형식 제약이 없다(`slug String @unique`). 여기가 유일한 방어선이라
   * git이 거부할 이름을 미리 던진다 — 안 던지면 `createRef`가 422로 죽고 원인이
   * "GitHub이 거절함"으로만 보인다.
   */
  it.each([
    ["빈 문자열", ""],
    ["공백", "a b"],
    ["물결", "a~b"],
    ["캐럿", "a^b"],
    ["콜론", "a:b"],
    ["물음표", "a?b"],
    ["별표", "a*b"],
    ["대괄호", "a[b"],
    ["역슬래시", "a\\b"],
    ["연속 점", "a..b"],
    ["점으로 끝남", "ab."],
    ["점으로 시작", ".ab"],
    ["reflog 문법", "a@{b"],
    ["슬래시 — 브랜치 계층을 갈라 남의 ref를 덮을 수 있다", "a/b"],
    ["제어문자", "a\u0001b"],
  ])("git이 거부할 slug를 던진다: %s", (_label, slug) => {
    expect(() => syncBranchFor(slug)).toThrow();
  });

  it("정상 slug는 통과한다", () => {
    for (const slug of ["a", "bugshot-2", "order-check", "my_project", "v1.2"]) {
      expect(() => syncBranchFor(slug)).not.toThrow();
    }
  });
});
