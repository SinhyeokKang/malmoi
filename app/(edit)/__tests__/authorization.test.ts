import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor } from "./harness";

/**
 * **ARCHITECTURE §6.03의 공격 시나리오를 케이스로 박는다.** 아래가 전부 거부돼야 2단계가 닫힌다.
 *
 * 여기가 검사하는 것은 **Server Action이 스스로 인가한다**는 것이다 — Action 호출은 레이아웃도
 * 미들웨어의 렌더 차단도 지나지 않으므로(ARCHITECTURE §6.1), 이 층이 비면 로그인만 한 사람이
 * 남의 프로젝트를 고칠 수 있다.
 *
 * ⚠️ **"프로젝트 없음"과 "멤버 아님"을 같은 `not-found`로 접는다** (PRODUCT §7.7 — URL을 안다는
 * 사실은 접근 권한이 아니다). 둘을 다른 응답으로 가르면 남의 프로젝트 존재 여부가 샌다.
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  /** true면 `auth()`가 실제 장애처럼 동작한다 — logger에 SessionTokenError를 남기고 null을 돌려준다. */
  outage: false,
}));

vi.mock("@/auth", async () => {
  const { noteAuthError } = await import("@/lib/auth/outage");
  return {
    auth: async () => {
      if (hoisted.outage) {
        noteAuthError({ type: "SessionTokenError" });
        return null;
      }
      return hoisted.session;
    },
  };
});
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { saveTranslationKey, triggerPullAction } = await import("../actions");

/** 두 프로젝트 · 세 사람. A의 OWNER·EDITOR와 B의 OWNER가 있다. */
function twoProjects() {
  return createHarness({
    projects: [
      { id: "pA", slug: "alpha" },
      { id: "pB", slug: "beta" },
    ],
    members: [
      { projectId: "pA", userId: "u-owner", role: "OWNER" },
      { projectId: "pA", userId: "u-editor", role: "EDITOR" },
      { projectId: "pB", userId: "u-other", role: "OWNER" },
    ],
    users: [
      { id: "u-owner", email: "owner@a.com" },
      { id: "u-editor", email: "editor@a.com" },
      { id: "u-other", email: "other@b.com" },
    ],
    keys: [
      { id: "kA", projectId: "pA", key: "a.one", sourceText: "One", description: null, sortIndex: 0, orphaned: false },
      { id: "kB", projectId: "pB", key: "b.one", sourceText: "One", description: null, sortIndex: 0, orphaned: false },
    ],
    locales: [
      { projectId: "pA", code: "en", isBase: true },
      { projectId: "pA", code: "ko" },
      { projectId: "pB", code: "en", isBase: true },
      { projectId: "pB", code: "fr" },
    ],
  });
}

let db: ReturnType<typeof twoProjects>;

beforeEach(() => {
  db = twoProjects();
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-editor");
  hoisted.outage = false;
});

/**
 * **DB 장애는 비로그인이 아니다** (POSTMORTEM 2026-09-06). `auth()`는 어댑터 예외를 삼키고 null을 내므로
 * 값으로는 같다 — logger 경로로 가른다. 접으면 편집자가 "로그인이 만료됐어요"를 보고 헛로그인한다.
 */
describe("세션을 못 읽은 경우 — 거부가 아니라 장애다", () => {
  beforeEach(() => {
    hoisted.outage = true;
  });

  it("저장이 unauthorized가 아니라 unavailable이다", async () => {
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(result).toEqual({ ok: false, error: "unavailable" });
  });

  it("Publish도 unavailable이다", async () => {
    const result = await triggerPullAction("alpha");
    expect(result).toMatchObject({ status: "failed", error: "unavailable" });
  });

  it("값이 저장되지 않는다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(db.translations).toHaveLength(0);
  });
});

describe("비로그인 사용자", () => {
  beforeEach(() => {
    hoisted.session = null;
  });

  it("저장이 거부된다", async () => {
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("Publish가 거부된다", async () => {
    const result = await triggerPullAction("alpha");
    expect(result).toMatchObject({ status: "failed", error: "unauthorized" });
  });

  it("거부가 DB에 닿기 전에 일어난다 — 인가 조회조차 하지 않는다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(db.spies.findMember).not.toHaveBeenCalled();
  });
});

describe("로그인했지만 멤버가 아닌 사용자", () => {
  beforeEach(() => {
    hoisted.session = sessionFor("u-stranger");
  });

  it("저장이 not-found다 — 프로젝트가 있다는 사실을 알려주지 않는다", async () => {
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("Publish가 not-found다", async () => {
    const result = await triggerPullAction("alpha");
    expect(result).toMatchObject({ status: "failed", error: "not-found" });
  });

  it("없는 slug와 멤버가 아닌 slug가 **같은 응답**이다", async () => {
    const missing = await saveTranslationKey({ surfaceSlug: "default", slug: "nope", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    const notMember = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(missing).toEqual(notMember);
  });

  it("값이 저장되지 않는다", async () => {
    await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(db.translations).toHaveLength(0);
  });
});

describe("제거된 멤버 — 인가 판정의 자동 절반", () => {
  it("세션이 살아 있어도 ProjectMember 행이 사라지면 거부된다", async () => {
    hoisted.session = sessionFor("u-editor");
    const before = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "먼저" }] });
    expect(before).toMatchObject({ ok: true });

    // 세션은 그대로 두고 멤버십만 없앤다 — JWT였다면 최대 24시간 살아 있었다.
    const at = db.members.findIndex((m) => m.userId === "u-editor");
    db.members.splice(at, 1);

    const after = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "나중" }] });
    expect(after).toEqual({ ok: false, error: "not-found" });
  });
});

describe("교차 테넌트 — A 멤버가 B를 겨눈다", () => {
  beforeEach(() => {
    hoisted.session = sessionFor("u-editor"); // pA의 EDITOR
  });

  it("B의 slug를 직접 보내면 거부된다", async () => {
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "beta", keyId: "kB", changes: [{ localeCode: "fr", value: "x" }] });
    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("자기 slug에 B의 keyId를 실으면 거부된다 — 인가된 projectId로 다시 확인한다", async () => {
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kB", changes: [{ localeCode: "ko", value: "x" }] });
    expect(result).toEqual({ ok: false, error: "key-unavailable" });
    expect(db.translations).toHaveLength(0);
  });

  it("자기 slug에 B의 localeCode를 실으면 거부된다", async () => {
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "fr", value: "x" }] });
    expect(result).toEqual({ ok: false, error: "unknown-locale", localeCodes: ["fr"] });
    expect(db.translations).toHaveLength(0);
  });

  it("B의 slug로 Publish를 걸 수 없다", async () => {
    const result = await triggerPullAction("beta");
    expect(result).toMatchObject({ status: "failed", error: "not-found" });
  });
});

describe("EDITOR의 권한 — PRODUCT §3 권한표", () => {
  beforeEach(() => {
    hoisted.session = sessionFor("u-editor");
  });

  it("번역을 저장한다", async () => {
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "하나" }] });
    expect(result).toEqual({ ok: true, keyId: "kA", cells: [{ localeCode: "ko", value: "하나" }] });
  });

  it("**Publish를 한다** — PR 생성은 base branch 직접 쓰기가 아니다 (PRODUCT §3)", async () => {
    const result = await triggerPullAction("alpha");
    // 인가를 지났다는 것만 본다 — GitHub 호출은 이 층의 관심이 아니다.
    expect(result.status).not.toBe("failed");
  });
});

describe("인가된 projectId로 좁혀 조회한다", () => {
  it("멤버십 조회에 slug가 아니라 projectId가 들어간다", async () => {
    hoisted.session = sessionFor("u-editor");
    await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(db.spies.findMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_userId: { projectId: "pA", userId: "u-editor" } },
      }),
    );
  });

  it("저장된 행의 updatedBy가 User.id다 — GitHub 핸들이 아니다", async () => {
    hoisted.session = sessionFor("u-editor");
    await saveTranslationKey({ surfaceSlug: "default", slug: "alpha", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(db.translations[0]).toMatchObject({ updatedBy: "u-editor" });
  });
});

describe("입력 검증", () => {
  it("slug가 없으면 invalid input이다 — 기본값으로 떨어지지 않는다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await saveTranslationKey({ keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(result).toEqual({ ok: false, error: "invalid input" });
  });

  it("triggerPullAction: slug가 문자열이 아니면 invalid input — Prisma에 닿기 전에 거른다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await triggerPullAction({} as never);
    expect(result).toMatchObject({ status: "failed", error: "invalid input" });
  });

  it("slug가 빈 문자열이어도 거부한다", async () => {
    hoisted.session = sessionFor("u-editor");
    const result = await saveTranslationKey({ surfaceSlug: "default", slug: "", keyId: "kA", changes: [{ localeCode: "ko", value: "x" }] });
    expect(result).toMatchObject({ ok: false });
  });
});
