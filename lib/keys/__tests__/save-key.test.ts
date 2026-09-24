import { describe, expect, it } from "vitest";
import { KEY_SAVE_LIMITS, KeySaveInput, planClearability, planKeySave } from "../save";

/**
 * 키 단위 저장 계획 (translation-rework T3 — spec §3.4 · design §4 · §10.2).
 *
 * ⚠️ **전부 검증·계획한 뒤에만 쓴다** — 루프 도중 return으로 거부하면 앞 셀이 이미 커밋될 수 있다.
 * 그래서 이 함수의 결과는 "쓰기 목록 전체" 아니면 "거부" 둘 중 하나다. 셀 판정은 기존 `planSave`를 재사용한다.
 */
const current = (entries: Record<string, string | null>) => new Map(Object.entries(entries));
/** 재생성 표면 — 비우기 판정이 끼지 않는 기존 계약의 입력이다. */
const REGEN = { writeStrategy: "regenerate", baseLocale: "en" } as const;
const planRegen = (c: ReadonlyMap<string, string | null>, changes: readonly { localeCode: string; value: string }[]) => planKeySave(c, changes, REGEN);

describe("planKeySave — 정상", () => {
  it("바뀐 로케일만 쓰기 목록에 싣는다", () => {
    const plan = planRegen(current({ en: "Hi", ko: "안녕", ja: null }), [
      { localeCode: "ko", value: "안녕하세요" },
      { localeCode: "ja", value: "やあ" },
    ]);
    expect(plan).toEqual({ ok: true, writes: [{ localeCode: "ko", value: "안녕하세요" }, { localeCode: "ja", value: "やあ" }] });
  });

  it("no-op 셀은 쓰지 않는다 — 전부 no-op이면 쓰기 0건으로 성공한다", () => {
    expect(planRegen(current({ en: "Hi", ko: null }), [
      { localeCode: "en", value: "Hi" },
      { localeCode: "ko", value: "   " },
    ])).toEqual({ ok: true, writes: [] });
  });

  it("공백만 입력은 빈 문자열로 정규화하고, 앞뒤 공백이 있는 비빈 값은 보존한다", () => {
    expect(planRegen(current({ en: "Hi", ko: "x" }), [
      { localeCode: "ko", value: "  " },
      { localeCode: "en", value: " Hi " },
    ])).toEqual({ ok: true, writes: [{ localeCode: "ko", value: "" }, { localeCode: "en", value: " Hi " }] });
  });
});

describe("planKeySave — 하나라도 무효면 전체 거부", () => {
  it("변경이 비면 거부한다", () => {
    expect(planRegen(current({ en: "Hi" }), [])).toEqual({ ok: false, error: "empty" });
  });

  it("같은 로케일 중복은 거부한다", () => {
    expect(planRegen(current({ en: "Hi" }), [{ localeCode: "en", value: "a" }, { localeCode: "en", value: "b" }]))
      .toEqual({ ok: false, error: "duplicate-locale", localeCodes: ["en"] });
  });

  it("활성 로케일이 아닌 코드가 하나라도 있으면 유효한 변경까지 쓰지 않는다", () => {
    expect(planRegen(current({ en: "Hi", ko: null }), [{ localeCode: "ko", value: "안녕" }, { localeCode: "fr", value: "Salut" }]))
      .toEqual({ ok: false, error: "unknown-locale", localeCodes: ["fr"] });
  });

  it("프로토타입 이름은 활성 로케일이 아니다", () => {
    expect(planRegen(current({ en: "Hi" }), [{ localeCode: "constructor", value: "x" }]))
      .toEqual({ ok: false, error: "unknown-locale", localeCodes: ["constructor"] });
  });

  it("값 상한 10,000자를 넘는 셀이 있으면 전체 거부", () => {
    expect(planRegen(current({ en: "Hi", ko: null }), [
      { localeCode: "ko", value: "ok" },
      { localeCode: "en", value: "x".repeat(KEY_SAVE_LIMITS.valueLength + 1) },
    ])).toEqual({ ok: false, error: "too-long", localeCodes: ["en"] });
  });

  it("합계 페이로드 상한(UTF-16 1,000,000)을 넘으면 거부 — 4mb body 한도 안의 최악 3MB", () => {
    expect(KEY_SAVE_LIMITS).toEqual({ valueLength: 10_000, locales: 200, totalLength: 1_000_000 });
    const locales = Array.from({ length: 101 }, (_, i) => `l${i}`);
    const cur = new Map(locales.map(code => [code, null] as const));
    const changes = locales.map(localeCode => ({ localeCode, value: "가".repeat(10_000) }));
    expect(planRegen(cur, changes)).toEqual({ ok: false, error: "payload-too-large" });
  });

  it("로케일 수 상한 200을 넘으면 거부", () => {
    const locales = Array.from({ length: 201 }, (_, i) => `l${i}`);
    const cur = new Map(locales.map(code => [code, null] as const));
    expect(planRegen(cur, locales.map(localeCode => ({ localeCode, value: "x" })))).toEqual({ ok: false, error: "too-many" });
  });
});

describe("KeySaveInput — 공개 엔드포인트 입력", () => {
  it("slug·surfaceSlug·keyId와 changes 배열을 받는다", () => {
    expect(KeySaveInput.safeParse({ slug: "p", surfaceSlug: "web", keyId: "k", changes: [{ localeCode: "en", value: "" }] }).success).toBe(true);
  });

  it("changes가 상한을 넘거나 값이 문자열이 아니면 거부한다", () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => ({ localeCode: `l${i}`, value: "x" }));
    expect(KeySaveInput.safeParse({ slug: "p", surfaceSlug: "web", keyId: "k", changes: tooMany }).success).toBe(false);
    expect(KeySaveInput.safeParse({ slug: "p", surfaceSlug: "web", keyId: "k", changes: [{ localeCode: "en", value: 1 }] }).success).toBe(false);
    expect(KeySaveInput.safeParse({ slug: "p", surfaceSlug: "web", keyId: "k", changes: [{ localeCode: "en", value: "x".repeat(10_001) }] }).success).toBe(false);
  });

  // 옛 셀 저장의 `SaveInput` 검사에서 옮겼다(T16) — 편집 경로에 env 폴백이 없고, 대상은 멤버십이 준 projectId다.
  it("slug·keyId·localeCode가 비거나 slug가 없으면 거부한다", () => {
    const valid = { slug: "p", surfaceSlug: "web", keyId: "k", changes: [{ localeCode: "en", value: "v" }] };
    expect(KeySaveInput.safeParse({ ...valid, slug: "" }).success).toBe(false);
    const { slug: _omitted, ...withoutSlug } = valid;
    expect(KeySaveInput.safeParse(withoutSlug).success).toBe(false);
    expect(KeySaveInput.safeParse({ ...valid, keyId: "" }).success).toBe(false);
    expect(KeySaveInput.safeParse({ ...valid, changes: [{ localeCode: "", value: "v" }] }).success).toBe(false);
  });
});

/**
 * **수술적 표면의 비-base 비우기는 저장 단계에서 거부한다** (delivery-invariants D2). 수술적 writer는 값을 지울 줄
 * 모른다 — 비운 셀은 원본 리터럴이 그대로 남는데 pull이 토큰을 전달 확인으로 해제해 "보냈다"가 거짓이 됐다.
 * ⚠️ **PRODUCT §10 "명시적 빈값 export"가 생기면 풀릴 임시 규칙이다.**
 */
describe("planClearability — 정규화 뒤 값으로 판정한다", () => {
  it("surgical · 비-base · \"\" → cannot-clear", () => {
    expect(planClearability({ writeStrategy: "surgical", isBase: false, value: "" })).toBe("cannot-clear");
  });
  it("surgical · base · \"\" → ok (base는 원문으로 폴백한다)", () => {
    expect(planClearability({ writeStrategy: "surgical", isBase: true, value: "" })).toBe("ok");
  });
  it("regenerate · 비-base · \"\" → ok (재생성은 키를 파일에서 뺀다)", () => {
    expect(planClearability({ writeStrategy: "regenerate", isBase: false, value: "" })).toBe("ok");
  });
  it("surgical · 비-base · 비빈 값 → ok", () => {
    expect(planClearability({ writeStrategy: "surgical", isBase: false, value: "x" })).toBe("ok");
  });
});

describe("planKeySave — 수술적 표면의 비-base 비우기는 키 전체 거부", () => {
  const SURGICAL = { writeStrategy: "surgical", baseLocale: "en" } as const;

  it("비-base fr 비우기 → cannot-clear + localeCodes", () => {
    expect(planKeySave(current({ en: "Hi", fr: "Salut" }), [{ localeCode: "fr", value: "" }], SURGICAL))
      .toEqual({ ok: false, error: "cannot-clear", localeCodes: ["fr"] });
  });

  it("공백만 입력도 정규화 뒤 빈 값이라 같다 — 정규화 전 값을 보면 공백으로 우회된다", () => {
    expect(planKeySave(current({ en: "Hi", fr: "Salut" }), [{ localeCode: "fr", value: "   " }], SURGICAL))
      .toEqual({ ok: false, error: "cannot-clear", localeCodes: ["fr"] });
  });

  it("ko 수정 + fr 비우기 → 키 전체 거부 (ko도 안 쓴다)", () => {
    expect(planKeySave(current({ en: "Hi", ko: "안녕", fr: "Salut" }), [
      { localeCode: "ko", value: "안녕하세요" }, { localeCode: "fr", value: "" },
    ], SURGICAL)).toEqual({ ok: false, error: "cannot-clear", localeCodes: ["fr"] });
  });

  it("base 비우기 → 기존대로 쓴다 (짝)", () => {
    expect(planKeySave(current({ en: "Hi", fr: "Salut" }), [{ localeCode: "en", value: "" }], SURGICAL))
      .toEqual({ ok: true, writes: [{ localeCode: "en", value: "" }] });
  });

  it("재생성 표면의 비-base 비우기 → 기존대로 쓴다 (짝)", () => {
    expect(planKeySave(current({ en: "Hi", fr: "Salut" }), [{ localeCode: "fr", value: "" }], REGEN))
      .toEqual({ ok: true, writes: [{ localeCode: "fr", value: "" }] });
  });

  it("이미 빈 셀·행 없는 셀에 빈 값은 no-op이라 거부하지 않는다 — 비운 것이 아니다", () => {
    expect(planKeySave(current({ en: "Hi", fr: null, ja: "" }), [
      { localeCode: "fr", value: "" }, { localeCode: "ja", value: " " },
    ], SURGICAL)).toEqual({ ok: true, writes: [] });
  });
});
