import { describe, expect, it } from "vitest";

import { requirePinnedRepositoryId, requireSameRepository } from "../repository-id";

/**
 * 이름 재사용을 막는 것은 pin 하나다 (sec-audit-2 발견 34). ⚠️ **판정이 둘로 갈려 있다** —
 * "고정돼 있는가"와 "지금 그것인가"는 서로 다른 실패이고, 앞의 것은 옛 행이라 [다시 연결]이 답이다.
 */
describe("requirePinnedRepositoryId — 저장된 pin의 모양", () => {
  it("고정되지 않은 옛 행은 던진다 — 이름만 맞는 상태로 쓰기에 들어가지 않는다", () => {
    expect(() => requirePinnedRepositoryId(null)).toThrow();
    expect(() => requirePinnedRepositoryId(undefined)).toThrow();
    expect(() => requirePinnedRepositoryId("")).toThrow();
  });

  it("양의 정수 십진수만 통과한다 — 선행 0·부호·공백은 같은 리포를 두 문자열로 만든다", () => {
    expect(requirePinnedRepositoryId("42")).toBe("42");
    for (const bad of ["042", "-1", "0", "4 2", "1e3", "42n", "abc"]) {
      expect(() => requirePinnedRepositoryId(bad)).toThrow();
    }
  });

  it("⚠️ 안전 정수를 넘는 값은 던진다 — `Number()`의 반올림이 남의 id와 같아질 수 있다", () => {
    // 이 값이 설치 토큰의 `repositoryIds`로 들어간다. 자릿수만 맞는 문자열을 통과시키면
    // 토큰 범위가 우리가 검사한 리포와 다른 리포를 가리킬 수 있다.
    expect(() => requirePinnedRepositoryId("9007199254740993")).toThrow();
  });
});

describe("requireSameRepository — 지금 그 주소에 있는 것", () => {
  it("id가 다르면 던진다 — 이름이 같아도 다른 리포다", () => {
    expect(() => requireSameRepository("1", "2")).toThrow();
  });

  it("같으면 통과한다", () => {
    expect(() => requireSameRepository("42", "42")).not.toThrow();
  });
});
