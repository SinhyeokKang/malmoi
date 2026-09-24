import { describe, expect, it } from "vitest";

import { syncBranchFor } from "../sync-branch";

/**
 * 브랜치 이름이 상수 `malmoi-i18n/sync`였다. 한 리포에 번역 표면이 둘이면 Project가 둘이 되는데
 * (PRODUCT §7.1), 그 둘이 **같은 브랜치를 force update로 서로 덮는다** — 그때는
 * 순차 실행으로 피해 간 함정이고 bugshot-2가 정확히 그 모양이다(`_locales` 4키 +
 * `ts-dict` 903키).
 */
describe("syncBranchFor — 프로젝트마다 다른 브랜치", () => {
  it("slug를 이름에 넣는다", () => {
    expect(syncBranchFor("bugshot-2")).toBe("malmoi-i18n/sync-bugshot-2");
  });

  it("**다른 프로젝트는 다른 브랜치를 받는다** — 이 함수가 존재하는 이유다", () => {
    expect(syncBranchFor("chrome-surface")).not.toBe(syncBranchFor("ts-surface"));
  });

  it("같은 slug는 언제나 같은 브랜치다 — pull이 자기 브랜치를 다시 찾아야 한다", () => {
    expect(syncBranchFor("order-check")).toBe(syncBranchFor("order-check"));
  });

  /**
   * `Project.slug`에 형식 제약이 없다(`slug String @unique`). 여기가 유일한 방어선이라
   * git이 거부할 이름을 미리 던진다 — 안 던지면 `createRef`가 422로 죽고 원인이
   * "GitHub이 거절함"으로만 보인다.
   */
  it.each([
    ["빈 문자열", ""],
    ["공백", "a b"],
    ["물결", "a~b"],
    ["캐럿", "a^b"],
    ["콜론", "a:b"],
    ["물음표", "a?b"],
    ["별표", "a*b"],
    ["대괄호", "a[b"],
    ["역슬래시", "a\\b"],
    ["연속 점", "a..b"],
    ["점으로 끝남", "ab."],
    ["점으로 시작", ".ab"],
    ["reflog 문법", "a@{b"],
    ["슬래시 — 브랜치 계층을 갈라 남의 ref를 덮을 수 있다", "a/b"],
    ["제어문자", "a\u0001b"],
  ])("git이 거부할 slug를 던진다: %s", (_label, slug) => {
    expect(() => syncBranchFor(slug)).toThrow();
  });

  it("정상 slug는 통과한다", () => {
    for (const slug of ["a", "bugshot-2", "order-check", "my_project", "v1.2"]) {
      expect(() => syncBranchFor(slug)).not.toThrow();
    }
  });
});
