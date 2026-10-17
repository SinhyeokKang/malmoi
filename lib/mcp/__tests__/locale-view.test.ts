import { describe, expect, it } from "vitest";

import { languageChangesOf, languageChangeTotals } from "../locale-view";

/**
 * **MCP 조회의 언어 변경 투영** (locale-add design §5 "MCP 조회 — 상태와 전달 여부를 싣고 편집 불가 이유 노출"). 입력은 `readLocaleStates`의
 * 한 소스 상태다. 전달 여부는 코어 미리보기(`previewLocaleRemoval`·`cancelLocaleRemoval`)와 같은 판정이다 — ADD는 `create`, REMOVE는 `delete`가
 * 전달 목록에 있나이고, 확인이 무효화 중이면 `null`(모름)이다.
 */
const at = new Date("2026-10-14T01:02:03.000Z");
const state = (over: Partial<Parameters<typeof languageChangesOf>[0]> = {}): Parameters<typeof languageChangesOf>[0] => ({
  rows: [
    { localeCode: "fr", operation: "ADD", orphaned: false, requestedAt: at },
    { localeCode: "ko", operation: "REMOVE", orphaned: false, requestedAt: at },
  ],
  delivered: [],
  ...over,
});

describe("languageChangesOf", () => {
  it("행마다 언어·변경·요청 시각(ISO)·편집 가능 여부 — 제거 예정만 편집할 수 없다", () => {
    expect(languageChangesOf(state())).toEqual([
      { language: "fr", change: "add", requestedAt: "2026-10-14T01:02:03.000Z", delivered: false, editable: true },
      { language: "ko", change: "remove", requestedAt: "2026-10-14T01:02:03.000Z", delivered: false, editable: false, reason: "removal-pending" },
    ]);
  });

  it("전달 목록에 같은 효과가 있으면 delivered: true — 다른 효과(create ≠ delete)는 전달이 아니다", () => {
    const views = languageChangesOf(state({ delivered: [{ localeCode: "fr", effect: "create" }, { localeCode: "ko", effect: "create" }] }));
    expect(views.map(v => [v.language, v.delivered])).toEqual([["fr", true], ["ko", false]]);
  });

  it("확인이 무효화 중(delivered: null)이면 모름(null)이다 — \"보내지 않았다\"로 말하지 않는다", () => {
    expect(languageChangesOf(state({ delivered: null })).map(v => v.delivered)).toEqual([null, null]);
  });

  it("코드는 프로퍼티 키가 아니다 — __proto__ 행도 그대로 한 행이다", () => {
    const views = languageChangesOf(state({ rows: [{ localeCode: "__proto__", operation: "ADD", orphaned: false, requestedAt: at }], delivered: [{ localeCode: "__proto__", effect: "create" }] }));
    expect(views).toEqual([{ language: "__proto__", change: "add", requestedAt: at.toISOString(), delivered: true, editable: true }]);
  });

  it("행이 없으면 빈 목록", () => {
    expect(languageChangesOf(state({ rows: [] }))).toEqual([]);
  });
});

describe("languageChangeTotals", () => {
  it("소스별 보낼 언어 변경 수(작업 수)와 합 — 취소된 전달 삭제처럼 행 없는 작업도 센다", () => {
    const totals = languageChangeTotals([
      { surfaceId: "s1", work: [{ localeCode: "ko", current: "delete", delivered: null }] },
      { surfaceId: "s2", work: [{ localeCode: "ja", current: null, delivered: "delete" }, { localeCode: "fr", current: "create", delivered: null }] },
    ]);
    expect(totals.total).toBe(3);
    expect(totals.bySurface.get("s1")).toBe(1);
    expect(totals.bySurface.get("s2")).toBe(2);
    expect(totals.bySurface.get("s3")).toBeUndefined();
  });
});
