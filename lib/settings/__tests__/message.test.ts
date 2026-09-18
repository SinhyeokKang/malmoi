import { describe, expect, it } from "vitest";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "../message";

/**
 * 설정 화면이 **서버가 준 문자열**로 문구를 고른다 (launch-readiness L4.8 — 전에는 `hasOwn` 가드가 소스 텍스트로만 검사됐다).
 * `in`·`DICT[value] !== undefined`로 바꾸면 `constructor`가 `Object.prototype`에서 찾아져 **함수**가 문구 자리에 온다.
 */
describe("isRepositorySettingsError", () => {
  it.each(["invalid-branch", "unknown-locale", "orphaned-locale"] as const)("%s는 갈래이고 문구가 있다", (error) => {
    expect(isRepositorySettingsError(error)).toBe(true);
    expect(repositorySettingsErrorMessage(error)).toEqual(expect.any(String));
    expect(repositorySettingsErrorMessage(error).length).toBeGreaterThan(0);
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])("프로토타입 키 %s는 갈래가 아니다", (key) => {
    expect(isRepositorySettingsError(key)).toBe(false);
  });

  // `noop`은 거부가 아니라 성공이다 — 갈래에 넣으면 "현재 값을 다시 저장했다"가 오류 Alert로 나온다.
  it.each([undefined, "", "noop", "INVALID-BRANCH"])("%s는 갈래가 아니다", (value) => {
    expect(isRepositorySettingsError(value)).toBe(false);
  });
});
