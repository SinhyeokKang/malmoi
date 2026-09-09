import { describe, expect, it } from "vitest";

import { isValidBranchName } from "../branch-name";

/**
 * base branch 입력의 형식 판정 (translation-ui design §3.13, 6b-3).
 *
 * ⚠️ **`isRefSafeSlug`보다 넓다.** 그쪽은 **우리가 만드는** ref 이름(`l10n/sync-<slug>`)이라 좁게
 * 잠가야 하고, 이쪽은 **남의 리포에 이미 있는** 브랜치라 `/`·대문자·`.`을 받아야 한다
 * (`release/2.0`·`feat/UI-1`이 정상이다). 둘을 한 함수로 합치면 한쪽이 반드시 틀린다.
 *
 * ⚠️ **`git check-ref-format`의 부분집합이다** — 전부 구현하지 않는다. 우리가 막는 것은 "사용자가
 * 오타로 넣을 수 있고 넣으면 pull이 이해 못 하는 값"이고, GitHub이 거부할 나머지는 pull이
 * "base 브랜치를 읽을 수 없다"로 시끄럽게 실패한다(그쪽이 낫다 — 조용히 안 도는 것보다).
 */
describe("isValidBranchName — 정상", () => {
  it.each(["main", "release/2.0", "feat/UI-1", "v1.0"])("%s", (name) => {
    expect(isValidBranchName(name)).toBe(true);
  });
});

describe("isValidBranchName — 거부", () => {
  it("빈 문자열", () => expect(isValidBranchName("")).toBe(false));
  it("공백이 들어간 이름", () => expect(isValidBranchName("a b")).toBe(false));
  it("`..` — git이 범위 문법으로 읽는다", () => expect(isValidBranchName("a..b")).toBe(false));
  it("`~`", () => expect(isValidBranchName("a~b")).toBe(false));
  it("`:` — refspec 구분자다", () => expect(isValidBranchName("a:b")).toBe(false));
  it("`^`", () => expect(isValidBranchName("he^ad")).toBe(false));
  it("`/`로 끝난다", () => expect(isValidBranchName("a/")).toBe(false));
  it("`.lock`으로 끝난다 — git이 잠금 파일 이름으로 쓴다", () => {
    expect(isValidBranchName("a.lock")).toBe(false);
  });
});

describe("isValidBranchName — 경계", () => {
  it("`?`·`*`·`[`도 거부한다 — glob 문자다", () => {
    for (const n of ["a?b", "a*b", "a[b"]) expect(isValidBranchName(n), n).toBe(false);
  });

  it("제어문자를 거부한다 — 붙여넣기로 들어온다", () => {
    expect(isValidBranchName("a\tb")).toBe(false);
    expect(isValidBranchName("a\nb")).toBe(false);
  });

  /**
   * ⚠️ **트림하지 않는다.** 트림하면 화면이 보여준 값과 저장된 값이 갈리고, 그 차이가
   * `checkFormat` 비교에서 조용한 409가 된다(`guard.ts`가 같은 이유로 트림을 금지한다).
   */
  it("앞뒤 공백은 거부다 — 조용히 트림하지 않는다", () => {
    expect(isValidBranchName(" main")).toBe(false);
    expect(isValidBranchName("main ")).toBe(false);
  });
});
