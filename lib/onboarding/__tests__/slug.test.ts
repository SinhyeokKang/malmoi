import { describe, expect, it } from "vitest";

import { REF_SAFE_SLUG, syncBranchFor } from "@/lib/pull/trigger";

import { PROJECT_SLUG_MAX, normalizeProjectSlug, planSlug, suggestAlternateSlug } from "../slug";

/**
 * 프로젝트 slug 판정 (ARCHITECTURE §3.1). **형식 규칙은 `lib/pull/trigger.ts`의 `REF_SAFE_SLUG`를 import한다** —
 * 복사하면 갈리고, 갈리면 온보딩이 만든 slug가 pull에서 `fail()`로 죽는다. 그래서 여기서 가장 중요한
 * 검사는 아래 "교차 검증"이다: `planSlug`가 통과시킨 것을 `syncBranchFor`가 거부하면 안 된다.
 */

describe("REF_SAFE_SLUG — trigger.ts가 export한다", () => {
  it("정규식 하나를 두 모듈이 공유한다", () => {
    expect(REF_SAFE_SLUG).toBeInstanceOf(RegExp);
    expect(REF_SAFE_SLUG.test("bugshot-2")).toBe(true);
    expect(REF_SAFE_SLUG.test("a/b")).toBe(false);
  });
});

describe("planSlug — 형식·예약어·길이", () => {
  it("실제 프로젝트 slug 모양은 통과한다", () => {
    for (const slug of ["bugshot-2", "i18n-order-check", "skillflo", "a.b_c", "x"]) {
      expect(planSlug(slug)).toBe("ok");
    }
  });

  it("빈 문자열은 `empty`다 — 형식 오류와 다르게 말해야 사용자가 무엇을 고칠지 안다", () => {
    expect(planSlug("")).toBe("empty");
  });

  it("`..`·후행 `.`·`.lock` 접미·`/`·공백·선행 `-`는 `format`이다 (syncBranchFor가 같은 이유로 던진다)", () => {
    // `.lock`은 git ref 컴포넌트 끝에 올 수 없다 — 야간 pull의 createRef가 422로 죽는 자리다 (code-review 2026-09-07 🟡2).
    for (const slug of ["a..b", "foo.", "foo.lock", "a/b", "foo bar", "-foo", ".foo"]) {
      expect(planSlug(slug)).toBe("format");
    }
  });

  it("대문자는 `format`이다 — URL 경로라 대소문자만 다른 두 프로젝트를 만들지 않는다", () => {
    expect(planSlug("Foo")).toBe("format");
    expect(planSlug("bugshot-2".toUpperCase())).toBe("format");
  });

  it("예약어 `new`는 `reserved`다 — `/projects/new`와 충돌한다 (PRODUCT §7.7)", () => {
    expect(planSlug("new")).toBe("reserved");
    // 예약어는 정확히 그 이름만이다 — 접두·접미가 붙으면 다른 slug다.
    expect(planSlug("new-project")).toBe("ok");
  });

  it("상한을 넘으면 `too-long`이다", () => {
    expect(planSlug("a".repeat(PROJECT_SLUG_MAX))).toBe("ok");
    expect(planSlug("a".repeat(PROJECT_SLUG_MAX + 1))).toBe("too-long");
  });
});

describe("planSlug ↔ syncBranchFor — 교차 검증 (갈리면 pull이 죽는다)", () => {
  const SAMPLES = [
    "bugshot-2",
    "i18n-order-check",
    "a.b_c",
    "x",
    "new-project",
    "a".repeat(PROJECT_SLUG_MAX),
    "",
    "a..b",
    "foo.",
    "foo.lock",
    "a/b",
    "foo bar",
    "-foo",
    ".foo",
    "Foo",
    "new",
    "한글",
    "a b",
  ];

  it("planSlug가 `ok`인 slug는 syncBranchFor가 던지지 않는다", () => {
    for (const slug of SAMPLES.filter((s) => planSlug(s) === "ok")) {
      expect(() => syncBranchFor(slug)).not.toThrow();
      expect(syncBranchFor(slug)).toBe(`malmoi-i18n/sync-${slug}`);
    }
  });

  it("syncBranchFor가 던지는 slug는 planSlug도 `ok`가 아니다", () => {
    for (const slug of SAMPLES) {
      let throws = false;
      try {
        syncBranchFor(slug);
      } catch {
        throws = true;
      }
      if (throws) expect(planSlug(slug)).not.toBe("ok");
    }
  });
});

describe("normalizeProjectSlug — 리포명 → slug 후보", () => {
  it("이미 slug 모양인 리포명은 그대로다", () => {
    expect(normalizeProjectSlug("bugshot-2")).toBe("bugshot-2");
    expect(normalizeProjectSlug("i18n-order-check")).toBe("i18n-order-check");
  });

  it("대문자는 소문자로, 허용되지 않는 문자는 `-`로 접는다", () => {
    expect(normalizeProjectSlug("My_Repo.Name")).toBe("my_repo.name");
    expect(normalizeProjectSlug("Hello World!!")).toBe("hello-world");
  });

  it("선행 비영숫자·후행 `.`/`-`·연속 `-`·`..`을 정리한다 — 그래야 planSlug를 지난다", () => {
    expect(normalizeProjectSlug("--foo")).toBe("foo");
    expect(normalizeProjectSlug("foo.")).toBe("foo");
    expect(normalizeProjectSlug("a..b")).toBe("a.b");
    expect(normalizeProjectSlug("a---b")).toBe("a-b");
  });

  it("상한으로 자른다", () => {
    const out = normalizeProjectSlug("r".repeat(PROJECT_SLUG_MAX + 20));
    expect(out).toHaveLength(PROJECT_SLUG_MAX);
    expect(planSlug(out)).toBe("ok");
  });

  it("결과는 `ok`·`empty`·`reserved` 중 하나다 — 형식 오류를 내는 후보를 미리 채우지 않는다", () => {
    for (const name of ["bugshot-2", "Hello World!!", "한글리포", "", "new", "NEW", "a/b/c", "!!!", "x".repeat(200)]) {
      expect(["ok", "empty", "reserved"]).toContain(planSlug(normalizeProjectSlug(name)));
    }
  });

  it("전부 비허용 문자면 빈 문자열이다 — 사용자가 직접 친다", () => {
    expect(normalizeProjectSlug("한글리포")).toBe("");
    expect(normalizeProjectSlug("!!!")).toBe("");
  });
});

/**
 * ③ 예외 G의 대안 제안.
 *
 * ⚠️ **존재 확인이 없다** — 그래서 문구가 `Try another, such as <alt>.`이고 `<alt> is free`가 아니다.
 * 확인한 적 없는 것을 단언하면 POSTMORTEM 2026-09-09(문서가 단언한 통제를 코드가 안 했다)의 모양이 된다.
 */
describe("suggestAlternateSlug — 주소 중복 시의 대안 하나", () => {
  it("뒤에 번호를 붙인다", () => {
    expect(suggestAlternateSlug("web")).toBe("web-2");
  });

  it("이미 번호가 붙어 있으면 올린다 — `web-2-2`를 만들지 않는다", () => {
    expect(suggestAlternateSlug("web-2")).toBe("web-3");
    expect(suggestAlternateSlug("web-9")).toBe("web-10");
  });

  it("`planSlug`를 통과하는 값만 낸다 — 제안이 또 거부되면 제안이 아니다", () => {
    for (const slug of ["web", "web-2", "a", "x".repeat(PROJECT_SLUG_MAX), "my.app", "new"]) {
      const alt = suggestAlternateSlug(slug);
      expect(alt).toBeDefined();
      expect(planSlug(alt as string)).toBe("ok");
    }
  });

  it("상한을 넘지 않도록 앞을 자른다 — 자른 끝이 `.`·`-`로 끝나지 않는다", () => {
    const alt = suggestAlternateSlug("x".repeat(PROJECT_SLUG_MAX - 1) + "-");
    expect(alt).toBeDefined();
    expect((alt as string).length).toBeLessThanOrEqual(PROJECT_SLUG_MAX);
    expect(alt).not.toMatch(/[.-]$/);
  });

  it("예약어에도 대안이 선다 — `new`가 그 갈래다", () => {
    expect(suggestAlternateSlug("new")).toBe("new-2");
  });

  it("형식이 이미 깨진 값에는 제안하지 않는다 — 고칠 곳이 번호가 아니다", () => {
    expect(suggestAlternateSlug("Web Site")).toBeUndefined();
    expect(suggestAlternateSlug("")).toBeUndefined();
  });
});
