import { describe, expect, it } from "vitest";

import { accessErrorMessage, signInErrorMessage, type AccessError } from "../message";

/**
 * 인가 거부 → 사용자 문구 (design §4.1). `pullMessage`(`lib/pull/message.ts`)와 같은 형태다 —
 * **케이스 누락을 컴파일 타임에 막는 `never` 검사**가 구현에 있고, 여기서는 값을 대조한다.
 *
 * ⚠️ 이 문구가 필요한 이유: DB 세션에서 "권한 회수가 즉시 반영된다"는 성질은 사용자에게
 * **blur 저장 실패 한 줄로만** 드러난다. 그 자리에 `unauthorized`라는 영어 토큰이 뜨면
 * 번역 편집자는 무슨 일이 일어났는지 알 수 없다.
 */

const ERRORS: readonly AccessError[] = ["unauthorized", "forbidden", "not-found"];

describe("accessErrorMessage — 셋이 서로 다른 문구다", () => {
  it("세 거부 사유가 각자 다른 문장을 낸다", () => {
    const texts = ERRORS.map(accessErrorMessage);
    expect(new Set(texts).size).toBe(3);
  });

  it("빈 문구를 내지 않는다", () => {
    for (const error of ERRORS) {
      expect(accessErrorMessage(error).trim().length).toBeGreaterThan(0);
    }
  });

  it("영어 토큰을 그대로 흘리지 않는다 — 읽는 사람은 비개발자다", () => {
    for (const error of ERRORS) {
      expect(accessErrorMessage(error)).not.toContain(error);
    }
  });

  it("unauthorized는 다시 로그인하라고 말한다 — 세션 만료가 이 경로로 온다", () => {
    expect(accessErrorMessage("unauthorized")).toContain("로그인");
  });

  it("forbidden은 권한 부족을 말한다 — 없는 프로젝트라고 말하지 않는다", () => {
    const text = accessErrorMessage("forbidden");
    expect(text).toContain("권한");
    expect(text).not.toBe(accessErrorMessage("not-found"));
  });
});

/**
 * Auth.js가 `pages.error`로 넘기는 `?error=` 코드 → 사용자 문구.
 *
 * ⚠️ **거부와 장애를 가른다.** 2026-09-05 preview 실측에서 `OAuthAccountNotLinked`가
 * "로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요."로 떴다 — **정확히 거부됐는데 일시적 장애처럼
 * 읽혀** 사용자가 같은 버튼을 계속 누르게 된다. 몇 번을 눌러도 결과가 같은 종류의 실패는
 * **무엇을 하면 되는지**를 말해야 한다.
 */
describe("signInErrorMessage — 거부와 장애를 가른다", () => {
  it("OAuthAccountNotLinked는 같은 이메일의 다른 로그인 방식을 가리킨다", () => {
    const text = signInErrorMessage("OAuthAccountNotLinked");
    expect(text).toContain("이메일");
    expect(text).not.toContain("잠시");
  });

  it("AccessDenied는 이 계정으로 못 들어온다고 말한다", () => {
    expect(signInErrorMessage("AccessDenied")).not.toContain("잠시");
  });

  it("두 거부가 서로 다른 문구다 — 원인이 다르면 안내도 달라야 한다", () => {
    expect(signInErrorMessage("OAuthAccountNotLinked")).not.toBe(signInErrorMessage("AccessDenied"));
  });

  it("모르는 코드는 재시도를 권한다 — 그때만 '잠시 뒤'가 맞다", () => {
    expect(signInErrorMessage("Configuration")).toContain("잠시");
    expect(signInErrorMessage("무엇이든")).toContain("잠시");
  });

  it("코드를 그대로 노출하지 않는다 — 읽는 사람은 비개발자다", () => {
    for (const code of ["OAuthAccountNotLinked", "AccessDenied", "Verification"]) {
      expect(signInErrorMessage(code)).not.toContain(code);
    }
  });
});

