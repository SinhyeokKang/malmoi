import { describe, expect, it } from "vitest";

import { SAMPLE_CONFIRMATION_TTL_MS, signSampleConfirmation } from "@/lib/onboarding/sample-confirmation";

import { planSampleConfirmations, type ConfirmedCandidate } from "../confirm";

/**
 * MCP `create_project`·`add_sources`의 샘플 확인값 소비 (mcp-connector design §2.2). 기존 `signSampleConfirmation`·
 * `verifySampleConfirmation`을 그대로 쓰고 **서명을 확장하지 않는다** — 서명 필드가 이미 사용자·리포·설치·ref·head·포맷·발급 시각이다.
 * 여기서 더하는 것은 셋이다: 확인값 **누락은 입력 오류**, 서명된 포맷과 고른 adapter·pathTemplate 대조, baseLocale ∈ 서명된 locales.
 * 후보 중 하나라도 실패하면 전체가 실패한다(부분 생성 없음).
 */

const SECRET = "test-signing-secret";
const now = new Date("2026-09-28T12:00:00.000Z");
const context = { userId: "u1", repositoryId: "r1", installationId: "i1", ref: "main", headSha: "abc123" };
const format = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en", "fr"] };

function sign(overrides: Partial<typeof context & { format: typeof format }> = {}, at: Date = now): string {
  const { format: f = format, ...ctx } = overrides;
  return signSampleConfirmation({ ...context, ...ctx, format: f }, SECRET, at);
}

function candidate(overrides: Partial<ConfirmedCandidate> = {}): ConfirmedCandidate {
  return { confirmation: sign(), adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", ...overrides };
}

const plan = (candidates: readonly ConfirmedCandidate[], at: Date = now) => planSampleConfirmations({ candidates, context, secret: SECRET, now: at });

describe("planSampleConfirmations — 통과", () => {
  it("서명·컨텍스트·포맷·기준 로케일이 맞으면 ok", () => {
    expect(plan([candidate()])).toEqual({ status: "ok" });
  });

  it("여러 후보가 전부 맞으면 ok", () => {
    const yaml = { adapter: "yaml-catalog", pathTemplate: "config/{locale}.yml", locales: ["en", "de"] };
    expect(plan([candidate(), candidate({ confirmation: sign({ format: yaml }), adapter: "yaml-catalog", pathTemplate: "config/{locale}.yml", baseLocale: "de" })])).toEqual({ status: "ok" });
  });

  it("TTL 경계(정확히 30분)는 통과 — 기존 검증 함수와 같은 경계", () => {
    expect(plan([candidate()], new Date(now.getTime() + SAMPLE_CONFIRMATION_TTL_MS))).toEqual({ status: "ok" });
  });
});

describe("planSampleConfirmations — 입력 오류", () => {
  it("후보 0개는 invalid-input", () => {
    expect(plan([])).toEqual({ status: "invalid-input", index: 0 });
  });

  it("확인값 누락은 sample-expired가 아니라 invalid-input — 재탐지를 권할 일이 아니라 인자가 틀렸다", () => {
    expect(plan([candidate(), candidate({ confirmation: undefined })])).toEqual({ status: "invalid-input", index: 1 });
    expect(plan([candidate({ confirmation: "" })])).toEqual({ status: "invalid-input", index: 0 });
  });
});

describe("planSampleConfirmations — sample-expired (변조·만료·컨텍스트 불일치)", () => {
  it("TTL 초과", () => {
    expect(plan([candidate()], new Date(now.getTime() + SAMPLE_CONFIRMATION_TTL_MS + 1))).toEqual({ status: "sample-expired", index: 0 });
  });

  it("미래 발급 시각", () => {
    expect(plan([candidate({ confirmation: sign({}, new Date(now.getTime() + 1)) })])).toEqual({ status: "sample-expired", index: 0 });
  });

  it("서명 변조", () => {
    const token = sign();
    const [encoded, signature] = token.split(".");
    const tampered = `${encoded}.${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
    expect(plan([candidate({ confirmation: tampered })])).toEqual({ status: "sample-expired", index: 0 });
  });

  it("본문 변조(포맷을 바꿔 다시 인코딩)", () => {
    const [, signature] = sign().split(".");
    const forged = Buffer.from(JSON.stringify({ ...context, format: { ...format, pathTemplate: "evil/{locale}.json" }, issuedAt: now.getTime() })).toString("base64url");
    expect(plan([candidate({ confirmation: `${forged}.${signature}`, pathTemplate: "evil/{locale}.json" })])).toEqual({ status: "sample-expired", index: 0 });
  });

  it.each([
    ["userId", { userId: "u2" }],
    ["repositoryId", { repositoryId: "r2" }],
    ["installationId", { installationId: "i2" }],
    ["ref", { ref: "release" }],
    ["headSha", { headSha: "def456" }],
  ] as const)("%s 불일치 — 다른 사용자·리포·설치·ref·head의 확인값", (_field, override) => {
    expect(plan([candidate({ confirmation: sign(override) })])).toEqual({ status: "sample-expired", index: 0 });
  });

  it("다른 서명 키", () => {
    const foreign = signSampleConfirmation({ ...context, format }, "other-secret", now);
    expect(plan([candidate({ confirmation: foreign })])).toEqual({ status: "sample-expired", index: 0 });
  });

  it("여러 후보 중 뒤의 하나만 실패해도 그 index로 전체 실패", () => {
    expect(plan([candidate(), candidate({ confirmation: sign({ headSha: "old" }) })])).toEqual({ status: "sample-expired", index: 1 });
  });
});

describe("planSampleConfirmations — manual-no-match (포맷·기준 로케일 불일치)", () => {
  it("adapter 불일치", () => {
    expect(plan([candidate({ adapter: "yaml-catalog" })])).toEqual({ status: "manual-no-match", index: 0 });
  });

  it("pathTemplate 불일치", () => {
    expect(plan([candidate({ pathTemplate: "locales/{locale}.json" })])).toEqual({ status: "manual-no-match", index: 0 });
  });

  it("baseLocale이 서명된 locales 밖", () => {
    expect(plan([candidate({ baseLocale: "ja" })])).toEqual({ status: "manual-no-match", index: 0 });
  });

  it("baseLocale이 프로토타입 이름이어도 통과시키지 않는다", () => {
    expect(plan([candidate({ baseLocale: "constructor" })])).toEqual({ status: "manual-no-match", index: 0 });
  });
});
