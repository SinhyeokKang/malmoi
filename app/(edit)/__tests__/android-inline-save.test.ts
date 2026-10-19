import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createHarness, sessionFor } from "./harness";
import { setTranslations } from "@/lib/mcp/tools/translations";

const state = vi.hoisted(() => ({ prisma: undefined as unknown as PrismaClient, revalidate: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => sessionFor("editor") }));
vi.mock("@/lib/db", () => ({ getPrisma: () => state.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
const { saveTranslationKey } = await import("../actions");
const subject = { userId: "editor", credential: { kind: "api-token", tokenHash: "hash" }, grants: ["translation:write"], scope: { kind: "all" } } as const;
let db: ReturnType<typeof createHarness>;
beforeEach(() => {
  db = createHarness({ members: [{ projectId: "p1", userId: "editor", role: "EDITOR" }], users: [{ id: "editor", email: "e@example.com" }] });
  db.surfaces[0]!.adapterName = "android-strings";
  db.keys[0]!.sourceText = '<b>Hello</b>';
  Object.assign(db.prisma, { apiToken: { findFirst: async () => ({ userId: "editor", tokenHash: "hash", expiresAt: new Date("2099-01-01"), grants: ["translation:write"], allProjects: true, projectIds: [] }) } });
  state.prisma = db.prisma;
  state.revalidate.mockClear();
});
const input = { slug: "acme", surfaceSlug: "default", keyId: "k-greet", changes: [{ localeCode: "en", value: "<b>New</b>" }, { localeCode: "ko", value: "태그 없음" }] };

describe("웹·MCP → 실제 공유 저장 코어", () => {
  it("웹은 잘못된 언어를 반환하고 정상 기준 셀도 저장하지 않는다", async () => {
    expect(await saveTranslationKey(input)).toEqual({ ok: false, error: "inline-tags-mismatch", localeCodes: ["ko"] });
    expect(db.translations).toEqual([]);
    expect(state.revalidate).not.toHaveBeenCalled();
  });
  it("MCP는 같은 키 거부와 영어 안내를 반환한다", async () => {
    const result = await setTranslations.run({ prisma: db.prisma, subject: { ...subject, grants: [...subject.grants] }, now: new Date(), origin: null }, {
      slug: input.slug, surfaceSlug: input.surfaceSlug, entries: [{ keyId: input.keyId, changes: input.changes }],
    });
    expect(result).toMatchObject({ status: "ok", data: { results: [{ keyId: "k-greet", status: "rejected", error: "inline-tags-mismatch", localeCodes: ["ko"], message: expect.stringContaining("Keep the base language's tags") }] } });
    expect(db.translations).toEqual([]);
    expect(state.revalidate).not.toHaveBeenCalled();
  });
  it("정상 태그 번역은 두 껍데기로 저장된다", async () => {
    expect(await saveTranslationKey({ ...input, changes: [{ localeCode: "ko", value: "<b>안녕</b>" }] })).toMatchObject({ ok: true });
    const result = await setTranslations.run({ prisma: db.prisma, subject: { ...subject, grants: [...subject.grants] }, now: new Date(), origin: null }, {
      slug: input.slug, surfaceSlug: input.surfaceSlug, entries: [{ keyId: input.keyId, changes: [{ localeCode: "ko", value: "<b>안녕하세요</b>" }] }],
    });
    expect(result).toMatchObject({ status: "ok", data: { results: [{ status: "saved" }] } });
    expect(db.translations.find(t => t.localeCode === "ko")?.value).toBe("<b>안녕하세요</b>");
  });
});
