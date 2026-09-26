import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SAMPLE_CONFIRMATION_TTL_MS, signSampleConfirmation, verifySampleConfirmation } from "../sample-confirmation";

const secret = "test-only-signing-secret";
const context = { userId: "u1", repositoryId: "123", installationId: "77", ref: "main", headSha: "abc" };
const format = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en", "ko"] };
const issued = new Date("2026-09-27T00:00:00Z");
const after = (ms: number) => new Date(issued.getTime() + ms);

describe("샘플 확인값 — 서버가 확인한 포맷만 다시 읽는다", () => {
  it("같은 사용자·리포·설치·브랜치·스냅샷에서만 포맷을 반환한다", () => {
    const token = signSampleConfirmation({ ...context, format }, secret, issued);
    expect(verifySampleConfirmation(token, context, secret, issued)).toEqual(format);
    for (const key of Object.keys(context) as (keyof typeof context)[]) {
      expect(verifySampleConfirmation(token, { ...context, [key]: "other" }, secret, issued)).toBeNull();
    }
  });
  it("변조·다른 키·깨진 입력을 거부한다", () => {
    const token = signSampleConfirmation({ ...context, format }, secret, issued);
    const tampered = Buffer.from(JSON.stringify({ ...context, format: { ...format, pathTemplate: ".github/{locale}" }, issuedAt: issued.getTime() })).toString("base64url");
    expect(verifySampleConfirmation(`${tampered}.${token.split(".")[1]}`, context, secret, issued)).toBeNull();
    expect(verifySampleConfirmation(token, context, "different", issued)).toBeNull();
    for (const raw of ["", "a.b", "a.b.c", "x".repeat(100_000)]) expect(verifySampleConfirmation(raw, context, secret, issued)).toBeNull();
  });
  it("빈 키로 확인값을 발급하거나 검증하지 않는다", () => {
    expect(() => signSampleConfirmation({ ...context, format }, "", issued)).toThrow();
    expect(() => verifySampleConfirmation("anything", context, "", issued)).toThrow();
  });
});

describe("샘플 확인값 — 수명 (sec-audit-3 #13)", () => {
  it("TTL은 30분이다", () => {
    expect(SAMPLE_CONFIRMATION_TTL_MS).toBe(30 * 60 * 1000);
  });
  it("TTL 안에서는 통과하고 넘으면 거부한다", () => {
    const token = signSampleConfirmation({ ...context, format }, secret, issued);
    expect(verifySampleConfirmation(token, context, secret, after(SAMPLE_CONFIRMATION_TTL_MS))).toEqual(format);
    expect(verifySampleConfirmation(token, context, secret, after(SAMPLE_CONFIRMATION_TTL_MS + 1))).toBeNull();
  });
  it("발급 시각이 미래인 확인값을 거부한다", () => {
    const token = signSampleConfirmation({ ...context, format }, secret, after(1));
    expect(verifySampleConfirmation(token, context, secret, issued)).toBeNull();
  });
  it("옛 라벨(v1)로 서명된 확인값을 거부한다 — 발급 시각이 있어도 수명 없는 시절의 도메인이다", () => {
    const encoded = Buffer.from(JSON.stringify({ ...context, format, issuedAt: issued.getTime() })).toString("base64url");
    const v1 = createHmac("sha256", secret).update(`malmoi:onboarding-sample:v1.${encoded}`).digest("base64url");
    expect(verifySampleConfirmation(`${encoded}.${v1}`, context, secret, issued)).toBeNull();
    // 같은 payload를 현재 라벨로 서명하면 통과한다 — 거부가 모양이 아니라 라벨 때문임을 고정한다.
    const current = signSampleConfirmation({ ...context, format }, secret, issued);
    expect(current.split(".")[0]).toBe(encoded);
  });
});
