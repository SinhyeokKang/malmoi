import { describe, expect, it } from "vitest";
import { planTranslationSelection } from "../selection";

/**
 * 선택 키 우선순위 (translation-rework T2 — spec §3.2 · R3 · design §3.1).
 *
 * ⚠️ **"범위 밖이면 비운다"를 모든 갱신에 적용하지 않는다** — 그러면 저장 직후 상세가 비고, 남겨 둔
 * Saved 행을 눌러도 안 열린다. 원인(reason)마다 규칙이 다르다.
 */
describe("planTranslationSelection", () => {
  it("트리 전환은 새 목록의 첫 키를 연다", () => {
    expect(planTranslationSelection({ reason: "tree", current: "k9", firstKeyId: "k1" })).toEqual({ key: "k1" });
  });

  it("트리 전환의 새 목록이 비면 미선택이다", () => {
    expect(planTranslationSelection({ reason: "tree", current: "k9", firstKeyId: undefined })).toEqual({ key: undefined });
  });

  it("필터·검색·초기화는 선택 키가 새 결과에 남으면 유지한다", () => {
    for (const reason of ["filter", "search", "clear"] as const) {
      expect(planTranslationSelection({ reason, current: "k1", currentInResult: true, firstKeyId: "k0" })).toEqual({ key: "k1" });
    }
  });

  it("필터·검색·초기화로 범위 밖이 되면 비우고 다른 키를 자동 선택하지 않는다", () => {
    for (const reason of ["filter", "search", "clear"] as const) {
      expect(planTranslationSelection({ reason, current: "k1", currentInResult: false, firstKeyId: "k0" })).toEqual({ key: undefined });
    }
  });

  it("선택이 없던 상태의 필터 변경은 첫 키를 고르지 않는다", () => {
    expect(planTranslationSelection({ reason: "filter", current: undefined, currentInResult: false, firstKeyId: "k0" })).toEqual({ key: undefined });
  });

  it("저장 응답·재검증은 선택을 그대로 둔다 — 조건에서 벗어나도", () => {
    expect(planTranslationSelection({ reason: "revalidate", current: "k1", currentInResult: false })).toEqual({ key: "k1" });
  });

  it("목록 행 클릭은 그 키를 연다", () => {
    expect(planTranslationSelection({ reason: "row", current: "k1", target: "k2", targetSelectable: true })).toEqual({ key: "k2" });
  });

  it("같은 필터 세대의 Saved 보존 행은 조건 밖이어도 다시 열린다", () => {
    expect(planTranslationSelection({ reason: "row", current: "k1", target: "saved", targetSelectable: true })).toEqual({ key: "saved" });
  });

  it("목록에도 보존 행에도 없는 키는 열지 않는다 — 선택을 유지한다", () => {
    expect(planTranslationSelection({ reason: "row", current: "k1", target: "ghost", targetSelectable: false })).toEqual({ key: "k1" });
  });

  it("오래된 링크(부재 키)를 다른 키로 바꾸지 않는다 — 상세가 부재를 말한다", () => {
    expect(planTranslationSelection({ reason: "landing", current: "gone", firstKeyId: "k0" })).toEqual({ key: "gone" });
  });

  it("키 없이 착지하면 자동 선택하지 않는다", () => {
    expect(planTranslationSelection({ reason: "landing", current: undefined, firstKeyId: "k0" })).toEqual({ key: undefined });
  });
});
