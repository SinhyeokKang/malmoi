import { expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { uploadRejectMessage } from "../message";

const UPLOAD = m.errors.upload;

/**
 * 업로드 거부 → 문구 (account-settings 태스크 4b).
 *
 * ⚠️ **능력 쪽(`lib/upload/image.ts`)은 갈래 이름만 정의한다.** 문구를 그 모듈에 두면
 * `no-korean-ui.test.ts`가 한글만 세므로 green인 채 사전을 통째로 우회한다.
 */
it.each(["too-large", "unsupported-type", "not-a-file", "empty", "unavailable"])(
  "거부 %s가 각자 다른 문구로 화면에 닿는다",
  (reason) => {
    const message = uploadRejectMessage(reason);
    expect(typeof message).toBe("string");
    expect(message).not.toBe("");
  },
);

it("갈래마다 문구가 갈린다 — 하나로 접히면 사유가 사라진다", () => {
  const all = ["too-large", "unsupported-type", "not-a-file", "empty", "unavailable"].map(uploadRejectMessage);
  expect(new Set(all).size).toBe(all.length);
});

/** 사전 절이 하나다 — 화면이 문자열을 조립하면 같은 거부가 화면마다 다르게 읽힌다. */
it("사전 값을 그대로 쓴다", () => {
  expect(uploadRejectMessage("too-large")).toBe(UPLOAD["too-large"]);
  expect(uploadRejectMessage("unsupported-type")).toBe(UPLOAD["unsupported-type"]);
});

/** ⚠️ 모르는 값은 폴백이다 — 던지면 거부가 화면 대신 콘솔로 간다 (POSTMORTEM 2026-09-08). */
it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "nope", ""])(
  "모르는 갈래 %s에도 문자열 폴백을 낸다",
  (reason) => {
    expect(uploadRejectMessage(reason)).toBe(UPLOAD.fallback);
  },
);
