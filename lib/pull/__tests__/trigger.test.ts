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
  invalidateDeliveryConfirmations: vi.fn(),
}));
vi.mock("@/lib/github", () => ({ createGitClient: hoisted.createGitClient }));
vi.mock("../load", () => ({
  loadPullState: hoisted.loadPullState,
  saveLastPulledAt: hoisted.saveLastPulledAt,
  invalidateDeliveryConfirmations: hoisted.invalidateDeliveryConfirmations,
}));

import { createFakeGitClient } from "./fake-client";
import { triggerPull } from "../trigger";

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
    const result = await triggerPull({} as never, "slug", null);
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
    await expect(triggerPull({} as never, "slug", null)).rejects.toThrow(/installationId/);
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
      maxUpdatedAt: new Date("2026-09-04T00:00:00Z"), unpublished: 1, pendingEdits: [],
    });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await triggerPull({} as never, "fmt", null);
    expect(result.status === "skipped" && result.reason === "writer-warnings" ? result.warnings.length : 0).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toContain("config/locales/en.yml");
    expect(spy.mock.calls[0]?.[0]).toContain("fmt");
    spy.mockRestore();
  });

  it("보류도 console.warn으로 낸다 — 매 밤 같은 판정이 반복되는데 흔적이 없으면 안 된다 (delivery-invariants D3)", async () => {
    const EN = "en:\n  a: one\n";
    const { client } = createFakeGitClient({ refSha: { "heads/dev": "basehead" }, tree: { basehead: [{ path: "config/locales/en.yml", sha: "e" }] }, blobs: { e: EN } });
    hoisted.createGitClient.mockResolvedValue(client);
    const columns = { adapterName: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml", nested: null, nestedByPath: null, baseLocale: "en" };
    hoisted.loadPullState.mockResolvedValue({
      project: { id: "p1", slug: "fmt", repoOwner: "o", repoName: "r", baseBranch: "dev", installationId: "1", repositoryId: "100", lastPulledAt: null, ...columns },
      surfaces: [{ id: "s1", slug: "default", ...columns, localeCodes: ["en", "fr"],
        keys: [{ id: "k", key: "a", sourceText: "one", orphaned: false, cells: { en: { value: "one" }, fr: { value: "un" } } }] }],
      maxUpdatedAt: new Date("2026-09-04T00:00:00Z"), unpublished: 1,
      pendingEdits: [{ id: "t", token: "t", cell: { surfaceId: "s1", keyId: "k", localeCode: "fr", restoreValue: "" } }],
    });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await triggerPull({} as never, "fmt", null)).toMatchObject({ status: "skipped", reason: "withheld" });
    expect(spy.mock.calls.map(c => String(c[0]))).toEqual(["[pull:fmt] withheld edits: 1 missing file, 0 missing key"]);
    spy.mockRestore();
  });

});

/**
 * **전달 기준 배선** (translation-rework T6). 실행 id가 있으면 성공 확정에 실행권(runId)과 context를 싣고, 첫 외부 쓰기 전
 * 무효화를 같은 prisma로 부른다. 실행 id가 없는 호출은 확인을 쓰지 않는다 — 실행권 없이는 늦은 성공을 가를 수 없다.
 */
describe("triggerPull — 전달 기준 배선", () => {
  const committingState = () => ({
    project: { id: "p1", slug: "demo", repoOwner: "o", repoName: "r", baseBranch: "dev", installationId: "1", repositoryId: "100", lastPulledAt: null },
    surfaces: [{ id: "s1", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en",
      localeCodes: ["en"], keys: [{ key: "a", sourceText: "A", orphaned: false, cells: { en: { value: "A" } } }] }],
    maxUpdatedAt: new Date("2026-09-04T00:00:00Z"), unpublished: 1, pendingEdits: [],
    deliveryContexts: [{ surfaceId: "s1", fingerprint: "ctx" }],
  });

  it("실행 id를 받으면 무효화 뒤 성공 확정에 runId·context를 싣는다", async () => {
    const prisma = {} as never;
    hoisted.loadPullState.mockResolvedValue(committingState());
    hoisted.createGitClient.mockReturnValue(createFakeGitClient({ refSha: { "heads/dev": "basehead" }, tree: { basehead: [] } }).client);
    hoisted.invalidateDeliveryConfirmations.mockResolvedValue(undefined);
    hoisted.saveLastPulledAt.mockResolvedValue(undefined);
    const result = await triggerPull(prisma, "demo", "run-1");
    expect(result.status).toBe("committed");
    expect(hoisted.invalidateDeliveryConfirmations).toHaveBeenCalledWith(prisma, "p1");
    const call = hoisted.saveLastPulledAt.mock.calls.at(-1);
    expect(call?.[5]).toEqual({ runId: "run-1", contexts: [{ surfaceId: "s1", fingerprint: "ctx" }], withheld: [] });
  });

  it("실행 id가 없으면 확인을 싣지 않는다 (위 대조)", async () => {
    hoisted.loadPullState.mockResolvedValue(committingState());
    hoisted.createGitClient.mockReturnValue(createFakeGitClient({ refSha: { "heads/dev": "basehead" }, tree: { basehead: [] } }).client);
    hoisted.saveLastPulledAt.mockResolvedValue(undefined);
    await triggerPull({} as never, "demo", null);
    expect(hoisted.saveLastPulledAt.mock.calls.at(-1)?.[5]).toBeUndefined();
  });
});

