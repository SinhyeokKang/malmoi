import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";
import { hashPushToken } from "@/lib/push/token";

/**
 * **CI 적재의 열린 PR 게이트** (nightly-sync D1). 미전달 편집이 0이어도 Malmoi PR이 열려 있으면 적재 전체를 보류한다 —
 * Publish가 토큰을 비운 편집이 PR 머지 전에 DB에서 덮이는 손실 창을 닫는다. 조회 실패·마감은 `pr-check-failed` 보류(fail-closed)다.
 *
 * ⚠️ 게이트는 **인증 뒤·사전 집계 뒤**다 — 무효 토큰이 GitHub 왕복을 유발하면 안 되고, 편집이 있는 보류는 GitHub을 부르지 않는다.
 * ⚠️ 보류 갈래는 **아무것도 쓰지 않는다** — 진행 표시·번역·키·표면 갱신 0회.
 */

const state = vi.hoisted(() => ({
  prisma: undefined as unknown,
  apply: vi.fn(),
  record: vi.fn(),
  createGitClient: vi.fn(),
  findOpenPr: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getPrisma: () => state.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/push/apply", async () => ({
  ApplyGuardError: (await vi.importActual<typeof import("@/lib/push/apply")>("@/lib/push/apply")).ApplyGuardError,
  applyProtectedPush: state.apply,
}));
vi.mock("@/lib/events/ci", async () => ({
  ...(await vi.importActual<typeof import("@/lib/events/ci")>("@/lib/events/ci")),
  recordCiImport: state.record,
}));
vi.mock("@/lib/github", () => ({ createGitClient: state.createGitClient }));
// 마감만 짧은 실물 사본 — 이긴 뒤 타이머를 끈다(손 사본이 안 꺼서 파일 뒤에 로그가 나갔다, PR #171).
vi.mock("@/lib/github-wait", () => import("@/lib/__tests__/fast-github-wait"));

const { POST } = await import("../push/route");

const TOKEN = "open-pr-gate-token";
const body = {
  projectSlug: "acme", surfaceSlug: "default", commitSha: "a".repeat(40), commitAt: "2026-09-20T00:00:00Z",
  format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" },
  locales: ["en"], keys: [{ key: "a", sourceText: "A", namespace: "_root" }], translations: [], refs: [],
};
const request = (token = TOKEN) => new Request("https://x/api/push", {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
});

function seed(over: { repositoryId?: string | null; installationId?: string | null } = {}) {
  const h = createHarness({ projects: [{ id: "p1", slug: "acme", pushTokenHash: hashPushToken(TOKEN), repositoryId: "123", lastCommitAt: null, ...over }] });
  state.prisma = h.prisma;
  return h;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.createGitClient.mockResolvedValue({ findOpenPr: state.findOpenPr });
  state.apply.mockResolvedValue({ status: "applied", outcome: { inserted: 1, updated: 0, orphaned: 0, unorphaned: 0, staleTranslations: 0, translationsFilled: 0, orphanedLocales: 0, refs: 0, changedValues: 0 } });
});

describe("열린 PR 게이트", () => {
  it("열린 Malmoi PR → 200 deferred open-pr, pendingCount 없음, 아무것도 안 쓴다", async () => {
    const h = seed();
    state.findOpenPr.mockResolvedValue({ url: "https://github.com/o/r/pull/9", number: 9, title: "t", base: "main" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "deferred", reason: "open-pr", projectId: "p1", commitSha: body.commitSha });
    expect(json).not.toHaveProperty("pendingCount");
    expect(state.findOpenPr).toHaveBeenCalledWith("o:malmoi-i18n/sync-acme");
    expect(state.apply).not.toHaveBeenCalled();
    // 진행 표시(`markImportStarted` = 표면 update)도 없다 — 게이트가 그 뒤로 옮겨 가면 여기서 red다.
    expect(h.spies.updateSurface).not.toHaveBeenCalled();
    expect(h.spies.updateManySurfaces).not.toHaveBeenCalled();
    expect(state.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ result: "deferred", deferReason: "open-pr" }));
  });

  it("PR 조회 throw → 200 deferred pr-check-failed — PR 없음으로 읽지 않는다", async () => {
    const h = seed();
    state.findOpenPr.mockRejectedValue(new Error("rate limited"));
    expect(await (await POST(request())).json()).toMatchObject({ status: "deferred", reason: "pr-check-failed" });
    expect(state.apply).not.toHaveBeenCalled();
    expect(h.spies.updateSurface).not.toHaveBeenCalled();
    expect(h.spies.updateManySurfaces).not.toHaveBeenCalled();
    expect(state.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deferReason: "pr-check-failed" }));
  });

  it("클라이언트 생성 throw(설치 토큰) → pr-check-failed", async () => {
    seed();
    state.createGitClient.mockRejectedValue(new Error("installation"));
    expect(await (await POST(request())).json()).toMatchObject({ status: "deferred", reason: "pr-check-failed" });
  });

  it("마감 초과 → pr-check-failed", async () => {
    seed();
    state.findOpenPr.mockReturnValue(new Promise(() => {}));
    expect(await (await POST(request())).json()).toMatchObject({ status: "deferred", reason: "pr-check-failed" });
    expect(state.apply).not.toHaveBeenCalled();
  });

  it("PR 없음 → applied (짝)", async () => {
    const h = seed();
    state.findOpenPr.mockResolvedValue(null);
    expect(await (await POST(request())).json()).toMatchObject({ status: "applied" });
    expect(state.apply).toHaveBeenCalledTimes(1);
    // 짝 — 적용 갈래는 진행 표시를 세운다. 이 단언이 없으면 위 "0회"가 스파이 배선 실수로도 green이다.
    expect(h.spies.updateSurface).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastImportToken: expect.any(String) }) }));
  });

  it.each([{ repositoryId: null }, { installationId: null }])("%o → 게이트 없음, 조회 0회, applied", async over => {
    seed(over);
    expect(await (await POST(request())).json()).toMatchObject({ status: "applied" });
    expect(state.createGitClient).not.toHaveBeenCalled();
  });

  it("무효 토큰은 GitHub을 부르지 않는다", async () => {
    seed();
    expect((await POST(request("wrong-token"))).status).toBe(401);
    expect(state.createGitClient).not.toHaveBeenCalled();
    expect(state.findOpenPr).not.toHaveBeenCalled();
  });

  it("미전달 편집 보류가 먼저다 — pending-edits면 GitHub을 부르지 않는다", async () => {
    const h = seed();
    const cell = h.prisma.translation;
    vi.spyOn(cell, "count").mockResolvedValue(3);
    expect(await (await POST(request())).json()).toMatchObject({ status: "deferred", reason: "pending-edits", pendingCount: 3 });
    expect(state.createGitClient).not.toHaveBeenCalled();
  });
});
