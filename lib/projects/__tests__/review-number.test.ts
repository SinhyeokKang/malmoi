import { describe, expect, it } from "vitest";

import * as leaf from "../review-number";
import * as remote from "../remote-plan";

/**
 * 리뷰 번호 판정은 **클라이언트 잎**에 산다(locale-add E1) — Sources 상세 모달이 `View pull request #N` 링크를 세우는데, 옛 자리
 * `remote-plan.ts`는 `lib/adapters`를 물어 클라이언트가 못 문다. 옛 이름은 같은 함수를 재수출한다(소비자 수정 0).
 */
describe("review-number 잎", () => {
  it("remote-plan의 두 이름은 잎의 같은 함수다", () => {
    expect(remote.pullNumberFrom).toBe(leaf.pullNumberFrom);
    expect(remote.reviewNumberFrom).toBe(leaf.reviewNumberFrom);
  });

  it("호스트로 고른다 — 판정은 옛 자리와 같다", () => {
    expect(leaf.reviewNumberFrom("https://github.com/o/r/pull/128", "github")).toBe(128);
    expect(leaf.reviewNumberFrom("https://gitlab.com/g/app/-/merge_requests/128", "gitlab")).toBe(128);
    expect(leaf.reviewNumberFrom("https://github.com/o/r/pull/128", "gitlab")).toBeNull();
    expect(leaf.reviewNumberFrom(null, "github")).toBeNull();
    expect(leaf.pullNumberFrom("https://github.com/o/r/pull/0")).toBeNull();
  });
});
