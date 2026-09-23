import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor, type Seed } from "./harness";

/**
 * **보관** (7단계 — ARCHITECTURE §5.6).
 *
 * 보관은 상태 머신이 아니라 **되돌릴 수 있는 사실 하나**(`Project.archivedAt`)이고, 거부는
 * `planProjectAccess`의 갈래 하나로 모인다 — 그래서 화면·Action이 각자 `archivedAt`을 보지 않는다.
 *
 * ⚠️ **`project:settings`만 통과한다.** 그것이 되돌리는 길이라, 전부 막으면 보관이 편도가 된다.
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  revalidatePath: vi.fn(),
  triggerPull: vi.fn(),
  ensureUserToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: hoisted.triggerPull }));
vi.mock("@/lib/github-connect/token-store", () => ({ ensureUserToken: hoisted.ensureUserToken }));

const { archiveProject, unarchiveProject, runFirstIngest } = await import("../projects/actions");
const { saveTranslationKey, triggerPullAction } = await import("../actions");
const { rotatePushToken } = await import("../projects/actions");
const settings = await import("../projects/[slug]/settings/actions");
const { updateBaseLocale } = await import("../projects/[slug]/sources/actions");

const ARCHIVED_AT = new Date("2026-09-10T00:00:00Z");

function seeded(over: Seed = {}) {
  return createHarness({
    projects: [{ id: "pA", slug: "alpha" }, { id: "pB", slug: "beta", archivedAt: ARCHIVED_AT }],
    members: [
      { projectId: "pA", userId: "u-owner", role: "OWNER" },
      { projectId: "pB", userId: "u-owner", role: "OWNER" },
      { projectId: "pB", userId: "u-editor", role: "EDITOR" },
    ],
    users: [
      { id: "u-owner", email: "owner@a.com" },
      { id: "u-editor", email: "editor@a.com" },
    ],
    keys: [
      { id: "k1", projectId: "pB", key: "a.greet", sourceText: "Hi", description: null, sortIndex: 0, orphaned: false },
    ],
    locales: [{ projectId: "pB", code: "ko", isBase: false, orphaned: false }],
    ...over,
  });
}

beforeEach(() => {
  const db = seeded();
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-owner");
  hoisted.revalidatePath.mockReset();
  hoisted.triggerPull.mockReset();
});

describe("보관된 프로젝트는 편집·Publish를 받지 않는다", () => {
  it("저장이 archived로 거부된다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "beta", keyId: "k1", changes: [{ localeCode: "ko", value: "안녕" }] });
    expect(result).toEqual({ ok: false, error: "archived" });
  });

  it("Publish가 archived로 거부되고 GitHub을 부르지 않는다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await triggerPullAction("beta");
    expect(result).toEqual({ status: "failed", error: "archived", delivery: "not-started", retryable: false });
    expect(hoisted.triggerPull).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ **`project:settings` 뒤에 있어서 인가가 안 막는다** (PRODUCT §7.9 — 그 권한만 통과시키는 것이
   * 보관을 편도로 만들지 않기 위해서다). 그래서 **번역을 바꾸는 Action은 자기가 한 번 더 봐야 한다** —
   * 형제 `addSurface`·`runRepositoryImport`가 이미 그렇게 한다.
   *
   * ⚠️ **막히기는 했다 — 다만 너무 늦게다.** `lib/push/apply.ts`의 트랜잭션 가드가 던져서 번역이
   * 실제로 바뀌지는 않았는데, 그때는 이미 스냅샷을 내려받은 뒤이고 호출부가 그 예외를
   * `ingest-failed`로 접어 **"적재에 실패했다"로 오진**했다 (launch-readiness L3.4).
   */
  it("첫 적재가 archived로 거부된다 — 스냅샷을 받기 전에", async () => {
    const result = await runFirstIngest({ slug: "beta" });
    expect(result).toEqual({ ok: false, error: "archived" });
  });

  it("보관되지 않은 프로젝트는 그대로 돈다 — 거부가 전역이 아니다", async () => {
    const db = seeded({
      keys: [
        { id: "k1", projectId: "pA", key: "a.greet", sourceText: "Hi", description: null, sortIndex: 0, orphaned: false },
      ],
      locales: [{ projectId: "pA", code: "ko", isBase: false, orphaned: false }],
    });
    hoisted.prisma = db.prisma;
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "k1", changes: [{ localeCode: "ko", value: "안녕" }] });
    expect(result).toEqual({ ok: true, keyId: "k1", cells: [{ localeCode: "ko", value: "안녕" }] });
  });
});

/**
 * **보관 = Restore만** (2026-09-24, 감사 #26 — PRODUCT §7.9). 인가는 `project:settings`를 보관 중에도 통과시키지만
 * (되돌리는 길), 잠금 안 판정이 그 위에서 `unarchiveProject` 외 설정 쓰기를 `archived`로 거부한다. UI가 이미 그렇게 서 있었다.
 */
describe("보관된 프로젝트의 설정 쓰기는 서버가 거부한다", () => {
  it.each([
    ["rotatePushToken", () => rotatePushToken({ slug: "beta" })],
    ["updateRepositorySettings", () => settings.updateRepositorySettings({ slug: "beta", baseBranch: "next" })],
    ["updateProjectName", () => settings.updateProjectName({ slug: "beta", name: "Renamed" })],
    ["updateBaseLocale", () => updateBaseLocale({ slug: "beta", surfaceSlug: "default", baseLocale: "ko" })],
  ] as const)("%s → archived, 쓰기·사건 0건", async (_name, run) => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    const before = structuredClone(db.projects.find((p) => p.slug === "beta"));
    expect(await run()).toEqual({ ok: false, error: "archived" });
    expect(db.projects.find((p) => p.slug === "beta")).toEqual(before);
    expect(db.projectEvents.filter((e) => e.projectId === "pB")).toEqual([]);
  });

  it("connectRepository → archived, GitHub을 부르지 않는다", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    expect(await settings.connectRepository({ slug: "beta" })).toEqual({ ok: false, error: "archived" });
    expect(hoisted.ensureUserToken).not.toHaveBeenCalled();
  });

  it("deleteProjectImage → archived", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    expect(await settings.deleteProjectImage("beta")).toEqual({ ok: false, reason: "archived" });
  });

  it("대조: 같은 픽스처의 활성 프로젝트에서는 같은 쓰기가 통과한다", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    expect(await settings.updateProjectName({ slug: "alpha", name: "Renamed" })).toEqual({ ok: true, name: "Renamed" });
    expect((await rotatePushToken({ slug: "alpha" })).ok).toBe(true);
  });

  it("Restore는 통과한다 — 되돌리는 길은 열려 있다", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    expect(await unarchiveProject("beta")).toEqual({ ok: true });
  });
});

describe("archiveProject · unarchiveProject", () => {
  it("OWNER가 보관하면 시각이 찍힌다", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    const result = await archiveProject("alpha");
    expect(result).toEqual({ ok: true });
    expect(db.projects.find((p) => p.slug === "alpha")?.archivedAt).toBeInstanceOf(Date);
  });

  it("되돌리면 null이 된다 — 그대로 돌아온다", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    expect(await unarchiveProject("beta")).toEqual({ ok: true });
    expect(db.projects.find((p) => p.slug === "beta")?.archivedAt).toBeNull();
  });

  it("EDITOR는 보관할 수 없다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await archiveProject("beta");
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("멤버가 아니면 not-found다 — 프로젝트 존재가 새지 않는다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await archiveProject("alpha");
    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("⚠️ 무효화가 루트 레이아웃이다 — 목록·사이드바·Home·번역 화면이 다 바뀐다", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    await archiveProject("alpha");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("보관된 프로젝트를 다시 보관해도 거부되지 않는다 — settings는 통과하는 갈래다", async () => {
    const db = seeded();
    hoisted.prisma = db.prisma;
    expect(await archiveProject("beta")).toEqual({ ok: true });
  });
});

describe("보관은 PROJECT_LIMIT 슬롯을 비운다 (결정 10)", () => {
  it("OWNER 집계가 보관 프로젝트를 안 센다", async () => {
    const db = seeded();
    const live = await db.prisma.projectMember.count({
      where: { userId: "u-owner", role: "OWNER", project: { archivedAt: null } },
    });
    expect(live).toBe(1);
  });
});
