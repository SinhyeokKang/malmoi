import { expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { sessionRevocationMessage } from "../message";

const SESSIONS = m.account.sessions;

/**
 * `?sessionRevocation=` → 문구 (account-settings 태스크 5·10).
 *
 * ⚠️ **인자가 `string | undefined`다 — union이 아니다.** 주소창 값이고, 단언으로 좁히면
 * "모르는 값에는 문구를 내지 않는다"가 검사에서 지워진다 (POSTMORTEM 2026-09-08).
 */
it("갈래마다 그 결과를 말하는 문구를 낸다", () => {
  expect(sessionRevocationMessage("cancelled")).toBe(SESSIONS.cancelled);
  expect(sessionRevocationMessage("wrong-account")).toBe(SESSIONS.wrongAccount);
  expect(sessionRevocationMessage("expired")).toBe(SESSIONS.expired);
});

/** 사용자가 할 일이 같은 둘은 같은 문구다 — 내부 갈래 이름을 화면 어휘로 쓰지 않는다. */
it("invalid와 unavailable은 하나의 재시도 문구로 접힌다", () => {
  expect(sessionRevocationMessage("invalid")).toBe(SESSIONS.failed);
  expect(sessionRevocationMessage("unavailable")).toBe(SESSIONS.failed);
});

it("값이 없거나 모르는 갈래에는 문구를 내지 않는다", () => {
  expect(sessionRevocationMessage(undefined)).toBeNull();
  expect(sessionRevocationMessage("")).toBeNull();
  expect(sessionRevocationMessage("revoked")).toBeNull();
});

/**
 * ⚠️ **`??` 폴백은 `Object.prototype`에서 찾아진 값을 못 막는다** — 문자열 자리에 함수가 오면
 * 화면이 통째로 죽는다 (POSTMORTEM 2026-09-08). 갈래를 아는 값만 먹이는 테스트는 이 부류를
 * 원리적으로 못 본다.
 */
it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])(
  "프로토타입 키 %s에 함수를 돌려주지 않는다",
  (key) => {
    expect(sessionRevocationMessage(key)).toBeNull();
  },
);
