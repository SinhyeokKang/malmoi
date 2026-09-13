import { describe, expect, it } from "vitest";

import { signSampleConfirmation, verifySampleConfirmation } from "../sample-confirmation";

const secret = "test-only-signing-secret";
const context = { userId: "u1", repositoryId: "123", installationId: "77", ref: "main", headSha: "abc" };
const format = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en", "ko"] };

describe("샘플 확인값 — 서버가 확인한 포맷만 다시 읽는다", () => {
  it("같은 사용자·리포·설치·브랜치·스냅샷에서만 포맷을 반환한다", () => {
    const token = signSampleConfirmation({ ...context, format }, secret);
    expect(verifySampleConfirmation(token, context, secret)).toEqual(format);
    for (const key of Object.keys(context) as (keyof typeof context)[]) {
      expect(verifySampleConfirmation(token, { ...context, [key]: "other" }, secret)).toBeNull();
    }
  });
  it("변조·다른 키·깨진 입력을 거부한다", () => {
    const token = signSampleConfirmation({ ...context, format }, secret);
    const tampered = Buffer.from(JSON.stringify({ ...context, format: { ...format, pathTemplate: ".github/{locale}" } })).toString("base64url");
    expect(verifySampleConfirmation(`${tampered}.${token.split(".")[1]}`, context, secret)).toBeNull();
    expect(verifySampleConfirmation(token, context, "different")).toBeNull();
    for (const raw of ["", "a.b", "a.b.c", "x".repeat(100_000)]) expect(verifySampleConfirmation(raw, context, secret)).toBeNull();
  });
  it("빈 키로 확인값을 발급하거나 검증하지 않는다", () => {
    expect(() => signSampleConfirmation({ ...context, format }, "")).toThrow();
    expect(() => verifySampleConfirmation("anything", context, "")).toThrow();
  });
});
