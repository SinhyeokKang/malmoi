import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { loadPullState } from "@/lib/pull/load";
import type { TreePayload } from "@/lib/pull/payload";
import { runPull } from "@/lib/pull/run";
import { createFakeGitClient } from "@/lib/pull/__tests__/fake-client";

import { createHarness, sessionFor, type Seed } from "./harness";

/**
 * **편집 흐름을 끝에서 끝까지 본다**: `saveTranslationKey` → DB →
 * `loadPullState` → `runPull`이 커밋에 싣는 **파일 내용**.
 *
 * 편집 UI는 동작 확인용으로 동결됐지만(PoC 시절 동결) **이 경로는 살아 있어야 한다** — 저장이
 * 실제로 DB에 닿는 유일한 증거이고, pull이 그 값을 실어 나른다는 것이 PoC가 답해야 했던
 * 질문 그 자체다.
 *
 * 메모리 DB를 쓴다. 저장과 조회가 **같은 상태**를 보므로 홉 사이에서 값이 사라지면 red다 —
 * 두 스텁을 따로 두면 그 손실이 정확히 안 보인다.
 */

const hoisted = vi.hoisted(() => ({
  prisma: undefined as unknown as PrismaClient,
  session: null as { user: { id: string } } | null,
  revalidated: [] as [string, string | undefined][],
}));

vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string, type?: string) => hoisted.revalidated.push([path, type]),
}));

/** 편집자는 `acme`의 EDITOR다 — 저장·Publish 둘 다 그 역할로 통과해야 한다 (PRODUCT §3). */
const EDITOR = "u-translator";

function memoryDb(seed: Seed = {}) {
  return createHarness({
    members: [{ projectId: "p1", userId: EDITOR, role: "EDITOR" }],
    users: [{ id: EDITOR, email: "t@a.com" }],
    ...seed,
  });
}

const { saveTranslationKey } = await import("../actions");

/** 저장된 DB 상태로 pull을 한 바퀴 돌리고 커밋에 실린 파일을 돌려준다. */
async function pullFiles(prisma: PrismaClient, opts: { lastPulledAt?: Date } = {}) {
  const { client, calls } = createFakeGitClient({
    refSha: { "heads/main": "basehead" },
    tree: { basehead: [] },
  });
  const result = await runPull({
    loadState: async () => {
      const state = await loadPullState(prisma, "acme");
      return { ...state, project: { ...state.project, lastPulledAt: opts.lastPulledAt ?? null } };
    },
    createClient: async () => client,
    saveLastPulledAt: async () => {},
    invalidateDelivery: async () => {},
    syncBranch: "malmoi-i18n/sync",
  });
  const tree = calls.find((c) => c.method === "createTree")?.args[0] as TreePayload | undefined;
  const byPath = Object.fromEntries((tree?.tree ?? []).map((e) => [e.path, e.content]));
  return { result, byPath, calls };
}

describe("편집 → DB → 다음 pull의 출력", () => {
  let db: ReturnType<typeof memoryDb>;

  beforeEach(() => {
    db = memoryDb();
    hoisted.prisma = db.prisma;
    hoisted.session = sessionFor(EDITOR);
    hoisted.revalidated = [];
  });

  /**
   * ⚠️ **이 행을 읽는 화면이 셋이다** (POSTMORTEM 2026-09-09가 이 자리를 이름으로 적어 뒀다):
   * 번역 화면 · **로케일 화면의 진행률**(6b-5) · **Home의 진행률과 최근 활동**(6b-6). 경로를 하나씩
   * 나열하면 넷째 소비자가 조용히 빠지고, 그때 번역자가 저장한 값이 다른 화면에서 옛 숫자로 남는다 —
   * 쓰기는 성공했는데 화면이 거짓말을 하는 부류다. `/projects/<slug>` 세그먼트의 레이아웃을 무효화한다.
   */
  it("무효화가 `/projects/<slug>` 서브트리다 — 같은 행을 세 화면이 읽는다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] });

    expect(hoisted.revalidated, JSON.stringify(hoisted.revalidated)).toContainEqual([
      "/projects/acme",
      "layout",
    ]);
  });

  it("저장한 값이 pull이 커밋하는 파일에 그대로 나온다", async () => {
    const saved = await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕하세요" }] });
    expect(saved).toEqual({ ok: true, keyId: "k-greet", cells: [{ localeCode: "ko", value: "안녕하세요" }] });

    const { byPath } = await pullFiles(db.prisma);
    expect(byPath["i18n/ko.json"]).toBe('{\n  "a.greet": "안녕하세요"\n}\n');
  });

  it("base 로케일 편집도 파일에 반영된다 — 고정된 것은 키뿐이다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "en", value: "Hi there" }] });
    const { byPath } = await pullFiles(db.prisma);
    expect(byPath["i18n/en.json"]).toContain('"a.greet": "Hi there"');
  });

  it("rechecks key and locale ownership even inside the same project", async () => {
    db.surfaces.push({ ...db.surfaces[0]!, id: "b", slug: "b", baseLocale: "ko" });
    db.keys[1]!.surfaceId = "b";
    db.locales[1]!.surfaceId = "b";
    const wrongKey = await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-bye", changes: [{ localeCode: "en", value: "wrong" }] });
    expect(wrongKey).toEqual({ ok: false, error: "key-unavailable" });
    const wrongLocale = await saveTranslationKey({ surfaceSlug: "b", slug: "acme", keyId: "k-bye", changes: [{ localeCode: "en", value: "wrong" }] });
    expect(wrongLocale).toEqual({ ok: false, error: "unknown-locale", localeCodes: ["en"] });
    expect(db.translations).toEqual([]);
    expect(await saveTranslationKey({ surfaceSlug: "b", slug: "acme", keyId: "k-bye", changes: [{ localeCode: "ko", value: "B" }] })).toEqual({ ok: true, keyId: "k-bye", cells: [{ localeCode: "ko", value: "B" }] });
    expect(db.translations).toHaveLength(1);
    expect(db.translations[0]).toMatchObject({ projectId: "p1", surfaceId: "b", keyId: "k-bye", value: "B" });
  });

  it("저장하지 않은 키는 파일에 없다 — 미번역과 빈 값은 다르다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] });
    const { byPath } = await pullFiles(db.prisma);
    expect(byPath["i18n/ko.json"]).not.toContain("a.bye");
  });

  it("값을 지우면 그 키가 파일에서 빠진다 — 행은 남고 키는 살아 있다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] });
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-bye", changes: [{ localeCode: "ko", value: "잘가" }] });
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "" }] });

    // 행은 남는다 — 지우면 export에서 키가 빠져 코드가 참조하는 키가 사라진다 (lib/keys/save.ts).
    expect(db.translations.find((t) => t.keyId === "k-greet" && t.localeCode === "ko")?.value).toBe("");

    const { byPath } = await pullFiles(db.prisma);
    expect(byPath["i18n/ko.json"]).toBe('{\n  "a.bye": "잘가"\n}\n');
  });

  it("공백만 입력은 미번역이고, 값 안의 앞뒤 공백은 보존한다", async () => {
    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "   " }] })).toEqual({ ok: true, keyId: "k-greet", cells: [] });
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-bye", changes: [{ localeCode: "ko", value: " 잘가 " }] });
    const { byPath } = await pullFiles(db.prisma);
    expect(byPath["i18n/ko.json"]).toBe('{\n  "a.bye": " 잘가 "\n}\n');
  });

  it("저장이 needsReview를 내리고 편집자를 기록한다", async () => {
    db.translations.push({
      projectId: "p1", surfaceId: "surface-p1",
      keyId: "k-greet", localeCode: "ko", value: "옛 번역",
      description: null, placeholders: null, needsReview: true, updatedBy: null,
      updatedAt: new Date("2026-09-02T00:00:00Z"),
    });
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "새 번역" }] });

    const row = db.translations.find((t) => t.keyId === "k-greet");
    // ⚠️ **핸들이 아니라 `User.id`다** (SaaS 2단계 §4). 컬럼 타입은 그대로이고 담기는 값만 바뀌었다 —
    // 그 전에 저장된 행은 GitHub 핸들을 그대로 들고 있으므로 `User`에 join하는 화면은 못 찾는
    // 경우를 다뤄야 한다 (prisma/schema.prisma의 updatedBy 주석).
    expect(row).toMatchObject({ value: "새 번역", needsReview: false, updatedBy: "u-translator" });
  });
});

describe("편집이 pull의 1층 스킵을 푼다", () => {
  let db: ReturnType<typeof memoryDb>;

  beforeEach(() => {
    db = memoryDb();
    hoisted.prisma = db.prisma;
    hoisted.session = sessionFor(EDITOR);
  });

  it("편집이 없으면 GitHub을 한 번도 부르지 않는다", async () => {
    const { result, calls } = await pullFiles(db.prisma, { lastPulledAt: new Date("2026-09-04T00:00:00Z") });
    expect(calls).toEqual([]);
    expect(result).toEqual({ status: "skipped", reason: "no-edits" });
  });

  it("저장이 updatedAt을 올려 그 스킵이 풀린다 — 저장이 DB에 닿았다는 관측 가능한 증거다", async () => {
    // 메모리 DB의 시계는 이 시각부터 저장마다 1초씩 간다 — 첫 pull은 편집이 없어 스킵이다.
    const before = new Date("2026-09-03T00:00:00Z");
    const skipped = await pullFiles(db.prisma, { lastPulledAt: before });
    expect(skipped.calls).toEqual([]);

    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] });

    const woken = await pullFiles(db.prisma, { lastPulledAt: before });
    expect(woken.calls.length).toBeGreaterThan(0);
    expect(woken.byPath["i18n/ko.json"]).toContain("안녕");
  });

  it("같은 값 재저장은 DB를 건드리지 않는다 — noop이 pull을 깨우면 빈 PR이 쌓인다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] });
    const stamp = db.translations[0]?.updatedAt;
    // "DB를 건드리지 않는다"를 **쓰기 미발행**으로 관측한다 — updatedAt 동일성만으로는 같은 값을
    // 다시 쓴 경우와 구별되지 않는다 (2026-09-04 audit #24).
    const upsert = vi.spyOn(db.prisma.translation, "upsert");

    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] })).toEqual({ ok: true, keyId: "k-greet", cells: [] });
    expect(db.translations[0]?.updatedAt).toEqual(stamp);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("Server Action은 공개 엔드포인트다 — 스스로 막는다", () => {
  beforeEach(() => {
    hoisted.prisma = memoryDb().prisma;
    hoisted.session = sessionFor(EDITOR);
  });

  it("다른 프로젝트의 키는 거부한다 — 인가된 projectId로 다시 확인한다 (RLS 없음)", async () => {
    // 인가는 통과하되(자기 프로젝트 slug다) keyId가 남의 것이다. 교차 테넌트 매트릭스 전체는
    // `authorization.test.ts`에 있고, 여기서는 이 흐름이 그 확인을 지난다는 것만 본다.
    const other = memoryDb({
      keys: [{ id: "k-other", projectId: "p2", key: "x", sourceText: "X", description: null, sortIndex: 0, orphaned: false }],
    });
    hoisted.prisma = other.prisma;
    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-other", changes: [{ localeCode: "ko", value: "탈취" }] })).toEqual({ ok: false, error: "key-unavailable" });
    expect(other.translations).toEqual([]);
  });

  it("프로젝트에 없는 로케일은 거부한다", async () => {
    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "fr", value: "bonjour" }] })).toEqual({ ok: false, error: "unknown-locale", localeCodes: ["fr"] });
  });

  it("입력이 계약을 벗어나면 거부한다", async () => {
    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "", changes: [{ localeCode: "ko", value: "x" }] })).toMatchObject({ ok: false });
    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "x".repeat(10_001) }] })).toMatchObject({ ok: false });
    expect(await saveTranslationKey(null)).toMatchObject({ ok: false });
    // slug가 없으면 기본값으로 떨어지지 않는다 — 편집 경로에 env 폴백이 없다.
    expect(await saveTranslationKey({ keyId: "k-greet", changes: [{ localeCode: "ko", value: "x" }] })).toMatchObject({ ok: false });
  });
});

/**
 * **사라진 로케일** (2026-09-04 audit #2). 로케일 목록의 정본은 어댑터가 탐지한 파일 목록이다.
 * 표시하지 않으면 DB에 영구 잔존하고 **pull이 그 파일을 되살린다** — 개발자가 지운 `fr.json`이
 * 다음 PR에서 돌아온다. 키의 `orphaned`와 같은 모양으로 푼다: 행은 남기고 pull에서만 뺀다.
 */
describe("orphaned 로케일", () => {
  const seed: Seed = {
    locales: [
      { projectId: "p1", code: "en", isBase: true },
      { projectId: "p1", code: "ko" },
      { projectId: "p1", code: "fr", orphaned: true },
    ],
    translations: [
      { keyId: "k-greet", localeCode: "en", value: "Hello", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-02T00:00:00Z") },
      { keyId: "k-greet", localeCode: "fr", value: "Bonjour", description: null, placeholders: null, needsReview: false, updatedBy: null, updatedAt: new Date("2026-09-02T00:00:00Z") },
    ],
  };

  let orphanDb: ReturnType<typeof memoryDb>;

  beforeEach(() => {
    orphanDb = memoryDb(seed);
    hoisted.prisma = orphanDb.prisma;
  });

  it("pull이 그 로케일 파일을 내지 않는다 — 지운 파일이 되살아나면 안 된다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] });
    const { byPath } = await pullFiles(orphanDb.prisma);
    expect(Object.keys(byPath)).not.toContain("i18n/fr.json");
    expect(Object.keys(byPath)).toContain("i18n/ko.json");
  });

  it("저장을 거부한다 — 리포에 도달할 수 없는 값을 받으면 pull이 헛돈다", async () => {
    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "fr", value: "Salut" }] })).toEqual({ ok: false, error: "unknown-locale", localeCodes: ["fr"] });
  });

  it("번역 행은 남는다 — 로케일이 돌아오면 값이 살아 돌아와야 한다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] });
    expect(orphanDb.translations.find((t) => t.localeCode === "fr")?.value).toBe("Bonjour");
  });
});

/**
 * orphaned **키**도 로케일과 같은 이유로 거부한다 — export가 그 키를 빼므로 저장이 `updatedAt`만
 * 올려 1층을 깨우고 2층 diff 0으로 끝난다. 번역자는 반영됐다고 믿는다. 전에는 UI의
 * `disabled`만이 방어선이었다 (2026-09-04 audit #10).
 */
describe("orphaned 키", () => {
  beforeEach(() => {
    hoisted.prisma = memoryDb({
      keys: [
        { id: "k-greet", projectId: "p1", key: "a.greet", sourceText: "Hello", description: null, sortIndex: 0, orphaned: false },
        { id: "k-gone", projectId: "p1", key: "a.gone", sourceText: "Gone", description: null, sortIndex: 1, orphaned: true },
      ],
    }).prisma;
  });

  it("저장을 거부한다 — UI 방어에 의존하지 않는다", async () => {
    expect(await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-gone", changes: [{ localeCode: "ko", value: "사라진" }] })).toEqual({ ok: false, error: "key-unavailable" });
  });

  it("살아 있는 키는 그대로 받는다", async () => {
    expect((await saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value: "안녕" }] })).ok).toBe(true);
  });
});

/**
 * **저장이 편집 토큰을 발급한다** (sync-edit-protection T4 — ARCHITECTURE §5.5.2, 배포 A의 dual-write). 판정·집계·화면은
 * 아직 토큰을 읽지 않는다. 여기서 재는 것은 "값이 실제로 바뀔 때만 새 토큰"이다 — no-op이 토큰을 바꾸면
 * Publish 뒤 같은 값 재저장이 pending을 되살려 CI가 이유 없이 보류된다.
 */
describe("저장의 편집 토큰 (T4)", () => {
  let db: ReturnType<typeof memoryDb>;

  beforeEach(() => {
    db = memoryDb();
    hoisted.prisma = db.prisma;
    hoisted.session = sessionFor(EDITOR);
  });

  const row = () => db.translations.find((t) => t.keyId === "k-greet" && t.localeCode === "ko") as { pendingEditToken?: string | null } | undefined;
  const save = (value: string) => saveTranslationKey({ surfaceSlug: "default", slug: "acme", keyId: "k-greet", changes: [{ localeCode: "ko", value }] });

  it("[C7] 새 셀 저장 → 토큰이 생긴다", async () => {
    await save("안녕");
    expect(row()?.pendingEditToken).toEqual(expect.any(String));
    expect(row()?.pendingEditToken).not.toBe("");
  });

  it("[C7] 값 변경 → 토큰이 회전한다 — 같은 셀의 두 저장을 구별한다", async () => {
    await save("안녕");
    const first = row()?.pendingEditToken;
    await save("안녕하세요");
    expect(row()?.pendingEditToken).toEqual(expect.any(String));
    expect(row()?.pendingEditToken).not.toBe(first);
  });

  it("같은 값 재저장(no-op) → 토큰 불변 (값 변경 → 회전 대조는 위)", async () => {
    await save("안녕");
    const first = row()?.pendingEditToken;
    await save("안녕");
    expect(row()?.pendingEditToken).toBe(first);
  });

  it("검토 표시만 있는 셀에 같은 값 저장 → no-op, 토큰이 서지 않는다", async () => {
    db.translations.push({
      projectId: "p1", surfaceId: "surface-p1",
      keyId: "k-greet", localeCode: "ko", value: "옛 번역",
      description: null, placeholders: null, needsReview: true, updatedBy: null,
      updatedAt: new Date("2026-09-02T00:00:00Z"),
    });
    await save("옛 번역");
    expect(row()?.pendingEditToken ?? null).toBeNull();
    await save("새 번역");
    expect(row()?.pendingEditToken).toEqual(expect.any(String));
  });

  it("기존 행을 바꾸는 저장도 토큰을 쓴다 — create 갈래만 쓰면 리포 값을 고친 편집이 안 잡힌다", async () => {
    db.translations.push({
      projectId: "p1", surfaceId: "surface-p1",
      keyId: "k-greet", localeCode: "ko", value: "리포 값",
      description: null, placeholders: null, needsReview: false, updatedBy: null,
      updatedAt: new Date("2026-09-02T00:00:00Z"),
    });
    await save("편집 값");
    expect(row()?.pendingEditToken).toEqual(expect.any(String));
  });
});
