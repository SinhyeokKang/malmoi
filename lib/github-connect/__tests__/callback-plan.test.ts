import { describe, expect, it } from "vitest";

import { planCallback, type CallbackInput } from "../callback-plan";
import type { StateCheck } from "../state";

/**
 * callback 갈래 판정 (ARCHITECTURE §6.4 · install-and-connect). **쓰기는 route에 남고 판정만 여기 있다** —
 * `lib/login-link/__tests__/exclusive.test.ts`가 `account.create`의 자리를 route로 고정한다.
 *
 * 이 표가 지키는 것 둘:
 * 1. **서명 state가 있는 복귀만 쓴다**(code 교환·Account·요청 기록). state 쿼리 자체가 없는 설치 계열 복귀는
 *    **착지만** 한다 — GitHub 앱 페이지에서 직접 설치, 리포 선택 Save, 관리자의 승인 복귀가 전부 그 모양이다.
 * 2. state 쿼리가 **있으면** 설치 계열이어도 서명 검증을 지난다 — land-only가 검증을 우회하는 문이 되지 않는다.
 */

const DEST = { kind: "new" } as const;
const OK: StateCheck = { status: "ok", dest: DEST };

function input(over: Partial<CallbackInput> = {}): CallbackInput {
  return { setupAction: null, stateParam: "nonce-1", state: OK, denied: false, code: "abc", ...over };
}

describe("서명 state가 맞으면 연결한다 — 요청 기록 지시는 setup_action이 정한다", () => {
  it.each([
    [null, "keep"],
    ["install", "clear"],
    ["request", "set"],
    ["update", "keep"],
    ["INSTALL", "keep"],
  ] as const)("setup_action=%s → link(%s)", (setupAction, request) => {
    expect(planCallback(input({ setupAction }))).toEqual({ kind: "link", dest: DEST, code: "abc", request });
  });
});

describe("state 쿼리가 없는 복귀", () => {
  it.each(["install", "update", "request"])("setup_action=%s면 착지만 한다 — 쓰기 0", (setupAction) => {
    expect(planCallback(input({ setupAction, stateParam: null, state: { status: "state-mismatch" } }))).toEqual({
      kind: "land-only",
    });
  });

  it("setup_action이 없으면 state-mismatch다 — Authorize 복귀에는 항상 state가 있다", () => {
    expect(planCallback(input({ stateParam: null, state: { status: "state-mismatch" } }))).toEqual({
      kind: "reject",
      dest: null,
      error: "state-mismatch",
    });
  });

  it("모르는 setup_action도 state-mismatch다", () => {
    expect(planCallback(input({ setupAction: "delete", stateParam: null, state: { status: "state-mismatch" } }))).toEqual({
      kind: "reject",
      dest: null,
      error: "state-mismatch",
    });
  });

  it("쿠키 state가 살아 있어도 쿼리가 없으면 연결하지 않는다 — 다른 탭의 왕복을 이 요청이 소비하지 않는다", () => {
    expect(planCallback(input({ setupAction: "install", stateParam: null, state: OK }))).toEqual({ kind: "land-only" });
  });
});

describe("state 쿼리가 있으면 설치 계열이어도 서명 검증을 지난다 (land-only 대조군)", () => {
  it.each(["state-mismatch", "state-expired", "wrong-user"] as const)("%s면 거부하고 dest를 믿지 않는다", (status) => {
    expect(planCallback(input({ setupAction: "install", state: { status } }))).toEqual({
      kind: "reject",
      dest: null,
      error: status,
    });
  });
});

describe("취소와 빈 code", () => {
  it("state가 맞으면 dest로 denied를 싣는다", () => {
    expect(planCallback(input({ denied: true }))).toEqual({ kind: "reject", dest: DEST, error: "denied" });
  });

  it("state가 틀리면 dest 없이 denied다", () => {
    expect(planCallback(input({ denied: true, state: { status: "state-mismatch" } }))).toEqual({
      kind: "reject",
      dest: null,
      error: "denied",
    });
  });

  it.each([null, ""])("code가 %j면 exchange-failed다 — 빈 요청을 성공으로 읽지 않는다", (code) => {
    expect(planCallback(input({ code }))).toEqual({ kind: "reject", dest: DEST, error: "exchange-failed" });
  });
});
