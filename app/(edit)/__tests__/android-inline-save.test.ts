import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createHarness, sessionFor } from "./harness";
import { renderLocaleFiles } from "@/lib/pull/render";
import { encodeAndroidValue } from "@/lib/adapters/android-strings";
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


it("MCP 두 키 중 태그 거부된 키만 건너뛰고 다른 키를 저장한다", async () => {
  const result = await setTranslations.run({ prisma: db.prisma, subject: { ...subject, grants: [...subject.grants] }, now: new Date(), origin: null }, {
    slug: input.slug, surfaceSlug: input.surfaceSlug, entries: [
      { keyId: "k-greet", changes: [{ localeCode: "ko", value: "태그 없음" }] },
      { keyId: "k-bye", changes: [{ localeCode: "ko", value: "잘가" }] },
    ],
  });
  expect(result).toMatchObject({ status: "ok", data: { results: [
    { keyId: "k-greet", status: "rejected", error: "inline-tags-mismatch" },
    { keyId: "k-bye", status: "saved", cells: [{ localeCode: "ko", value: "잘가" }] },
  ] } });
  expect(db.translations).toHaveLength(1);
  expect(db.translations[0]).toMatchObject({ keyId: "k-bye", value: "잘가" });
});

it("다른 셀에 기존 태그 불일치가 있어도 이번 셀은 저장된다", async () => {
  await saveTranslationKey({ ...input, changes: [{ localeCode: "ko", value: "<b>안녕</b>" }] });
  db.locales.push({ ...db.locales.find(l => l.code === "ko")!, code: "fr" });
  db.translations.push({ ...db.translations[0]!, localeCode: "fr", value: "태그 없는 기존 번역" });
  expect(await saveTranslationKey({ ...input, changes: [{ localeCode: "ko", value: "<b>안녕하세요</b>" }] })).toMatchObject({ ok: true });
  expect(db.translations.find(t => t.localeCode === "fr")?.value).toBe("태그 없는 기존 번역");
});

it.each(["Line1<br>Line2", "<unknown>", "a </ b", "<한글>번역</한글>"])("기준 셀도 writer가 거부하는 값은 저장하지 않는다: %s", async value => {
  expect(await saveTranslationKey({ ...input, changes: [{ localeCode: "en", value }] }))
    .toEqual({ ok: false, error: "inline-markup-invalid", localeCodes: ["en"] });
  expect(db.translations).toEqual([]);
});

it("문법 오류는 웹·MCP에서 같은 코드로 거부하고 MCP는 문자 꺾쇠 표기를 안내한다", async () => {
  db.keys[0]!.sourceText = "Plain";
  const changes = [{ localeCode: "ko", value: "a < b" }];
  expect(await saveTranslationKey({ ...input, changes })).toEqual({ ok: false, error: "inline-markup-invalid", localeCodes: ["ko"] });
  const result = await setTranslations.run({ prisma: db.prisma, subject: { ...subject, grants: [...subject.grants] }, now: new Date(), origin: null }, {
    slug: input.slug, surfaceSlug: input.surfaceSlug, entries: [{ keyId: input.keyId, changes }],
  });
  expect(result).toMatchObject({ status: "ok", data: { results: [{ status: "rejected", error: "inline-markup-invalid", localeCodes: ["ko"], message: expect.stringContaining("&lt;") }] } });
  expect(db.translations).toEqual([]);
});


it.each(["app/src/main/res", "shared/src/commonMain/composeResources"])("%s: 정상 기준에서 저장을 허용한 태그 값은 render writer 오류가 없다", async root => {
  const corpus = [
    ["<b>Base</b>", "<b>번역</b>"],
    ["<b><i>Base</i></b>", "<b><i>번역</i></b>"],
    ["Base<br/>", "번역<br />"],
    ['<xliff:g id="x" example="a &amp; b">Base</xliff:g>', "<xliff:g example='a &amp; b' id='x'>번역</xliff:g>"],
    ["&lt;b>Base&lt;/b>", "&lt;b>번역&lt;/b>"],
  ];
  const basePath = `${root}/values/strings.xml`;
  const path = `${root}/values-ko/strings.xml`;
  for (const [base, value] of corpus) {
    db.keys[0]!.sourceText = base!;
    const result = await saveTranslationKey({ ...input, changes: [{ localeCode: "en", value: base }, { localeCode: "ko", value }] });
    expect(result, value).toMatchObject({ ok: true });
    const saved = db.translations.find(t => t.localeCode === "ko")!.value;
    const original = '<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2"><string name="a.greet">Old</string></resources>';
    const files = renderLocaleFiles({ adapter: "android-strings", pathTemplate: `${root}/values-{locale}/strings.xml`, basePath, templateLocale: "en", locales: ["en", "ko"] },
      "per-locale", [{ path, locale: "ko" }, { path: basePath, locale: "en" }], [{ key: "a.greet", sourceText: base!, orphaned: false, cells: { ko: { value: saved }, en: { value: db.translations.find(t => t.localeCode === "en")!.value } } }], "en",
      new Map([[path, original], [basePath, original.replace("Old", encodeAndroidValue(base!)!)]]));
    expect(files).toHaveLength(2);
    for (const file of files) expect(file.errors ?? [], value).toEqual([]);
    expect(files[0]?.content).not.toBe(original);
  }
});


it.each([
  ["Line1<br>Line2", "줄1&lt;br>줄2"], ["<unknown>", "&lt;unknown>"], ["a </ b", "a &lt;/ b"],
])("깨진 옛 기준 값도 웹·MCP에서 안전한 문자 표기로 번역할 수 있다: %s", async (base, value) => {
  await saveTranslationKey({ ...input, changes: [{ localeCode: "en", value: "Old" }] });
  db.translations.find(t => t.localeCode === "en")!.value = base;
  expect(await saveTranslationKey({ ...input, changes: [{ localeCode: "ko", value }] })).toMatchObject({ ok: true });
  const result = await setTranslations.run({ prisma: db.prisma, subject: { ...subject, grants: [...subject.grants] }, now: new Date(), origin: null }, {
    slug: input.slug, surfaceSlug: input.surfaceSlug, entries: [{ keyId: input.keyId, changes: [{ localeCode: "ko", value: value + "!" }] }],
  });
  expect(result).toMatchObject({ status: "ok", data: { results: [{ status: "saved" }] } });
  expect(db.translations.find(t => t.localeCode === "ko")?.value).toBe(value + "!");
});
