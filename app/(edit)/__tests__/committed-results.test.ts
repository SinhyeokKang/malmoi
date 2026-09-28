import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor } from "./harness";

/**
 * **커밋된 쓰기는 캐시 장애로 실패가 되지 않는다** (POSTMORTEM 2026-09-20 · mcp-connector T4 회귀 목록) + `saveTranslationBatch`의 선행 판정.
 *
 * 저장·Revert·Publish는 DB 커밋 뒤에 `revalidatePath`를 부른다. 그것이 던지면 Action이 reject되고 화면은 "저장 여부 확인 불가"로
 * 받는다 — 이미 커밋된 값을 사용자가 다시 넣게 된다. MCP 도구도 같은 재검증 함수를 부르므로 한 자리에서 막는다.
 * 인가·readiness는 하네스의 실제 판정을 지나고, 쓰기 코어만 가짜다(커밋된 결과를 그대로 돌려준다).
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  revalidatePath: vi.fn(),
  applyKeySave: vi.fn(),
  applyKeySaveBatch: vi.fn(),
  executeKeyRevert: vi.fn(),
  runSync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock("@/lib/keys/save-key", () => ({ applyKeySave: hoisted.applyKeySave, applyKeySaveBatch: hoisted.applyKeySaveBatch }));
vi.mock("@/lib/keys/revert", () => ({ previewKeyRevert: vi.fn(), executeKeyRevert: hoisted.executeKeyRevert }));
vi.mock("@/lib/sync/run", () => ({ runSync: hoisted.runSync }));

const { saveTranslationKey, revertTranslationKey, triggerPullAction } = await import("../actions");
const { saveTranslationBatch } = await import("@/lib/keys/save-translation");

const SAVED = { ok: true, keyId: "k1", cells: [{ localeCode: "ko", value: "안녕" }] };
const REVERTED = { status: "reverted", cells: [{ localeCode: "ko", value: "a" }] };
const PUBLISHED = { status: "succeeded", prUrl: "https://github.com/o/r/pull/1", changed: 1, warnings: [] };

beforeEach(() => {
  hoisted.prisma = createHarness({
    projects: [{ id: "p1", slug: "acme" }, { id: "p2", slug: "fresh", lastCommitSha: null }],
    members: [
      { projectId: "p1", userId: "u-owner", role: "OWNER" },
      { projectId: "p1", userId: "u-editor", role: "EDITOR" },
      { projectId: "p2", userId: "u-editor", role: "EDITOR" },
    ],
    users: [{ id: "u-owner", email: "o@a.com" }, { id: "u-editor", email: "e@a.com" }, { id: "u-stranger", email: "x@a.com" }],
  }).prisma;
  hoisted.session = sessionFor("u-owner");
  hoisted.revalidatePath.mockReset().mockImplementation(() => { throw new Error("cache down"); });
  hoisted.applyKeySave.mockReset().mockResolvedValue(SAVED);
  hoisted.applyKeySaveBatch.mockReset().mockResolvedValue({ ok: true, results: [{ keyId: "k1", result: SAVED }] });
  hoisted.executeKeyRevert.mockReset().mockResolvedValue(REVERTED);
  hoisted.runSync.mockReset().mockResolvedValue(PUBLISHED);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("커밋 뒤 revalidatePath가 던져도 커밋된 결과를 그대로 돌려준다", () => {
  it("번역 저장", async () => {
    expect(await saveTranslationKey({ slug: "acme", surfaceSlug: "default", keyId: "k1", changes: [{ localeCode: "ko", value: "안녕" }] })).toEqual(SAVED);
    // 첫 경로가 던져도 나머지 경로를 건너뛰지 않는다 — 목록이 옛 숫자로 남으면 안 된다.
    expect(hoisted.revalidatePath.mock.calls).toEqual([["/projects/acme", "layout"], ["/projects"], ["/projects/new"]]);
  });

  it("Revert", async () => {
    expect(await revertTranslationKey({ slug: "acme", surfaceSlug: "default", keyId: "k1", confirmation: "a".repeat(64) })).toEqual(REVERTED);
    expect(hoisted.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("Publish", async () => {
    expect(await triggerPullAction("acme")).toEqual(PUBLISHED);
    expect(hoisted.revalidatePath).toHaveBeenCalledTimes(3);
  });
});

describe("saveTranslationBatch — 선행 인가·readiness", () => {
  const input = (slug: string) => ({ slug, surfaceSlug: "default", entries: [{ keyId: "k1", changes: [{ localeCode: "ko", value: "안녕" }] }] });

  it("EDITOR는 translation:write로 통과하고, 인가가 준 projectId·surfaceId와 주체의 userId로 배치 코어를 부른다", async () => {
    expect(await saveTranslationBatch(hoisted.prisma as never, { userId: "u-editor" }, input("acme"))).toEqual({ ok: true, results: [{ keyId: "k1", result: SAVED }] });
    expect(hoisted.applyKeySaveBatch).toHaveBeenCalledExactlyOnceWith(hoisted.prisma, {
      projectId: "p1", surfaceId: "surface-p1", surfaceSlug: "default", userId: "u-editor", entries: input("acme").entries,
    });
  });

  it("비멤버는 not-found, 첫 적재 전은 not-ready — 둘 다 배치 코어에 닿지 않는다", async () => {
    expect(await saveTranslationBatch(hoisted.prisma as never, { userId: "u-stranger" }, input("acme"))).toEqual({ ok: false, error: "not-found" });
    expect(await saveTranslationBatch(hoisted.prisma as never, { userId: "u-editor" }, input("fresh"))).toEqual({ ok: false, error: "not-ready" });
    expect(hoisted.applyKeySaveBatch).not.toHaveBeenCalled();
  });
});
