import { describe, expect, it } from "vitest";

import { keptAddLocales, planLocaleImportGate } from "../locale-gate";

/**
 * **자동 적재의 언어 변경 게이트** (locale-add design §1 "보류"). 입력은 소스별 언어 작업(현재 효과 ≠ 전달 효과)뿐이고 리포 값은 보지 않는다.
 * 전달 목록과 다른 REMOVE가 하나라도 있으면 적재 **전체**를 `locale-change-pending`으로 보류한다. ADD만 있으면 적재하고 그 언어를 orphan
 * 대상에서 뺀다(`keptAddLocales`). 전달된 뒤의 보호는 열린 PR 게이트가 맡는다.
 */

const item = (localeCode: string, current: "create" | "delete" | null, delivered: "create" | "delete" | null) => ({ localeCode, current, delivered });

describe("planLocaleImportGate", () => {
  it("작업 없음 → apply", () => {
    expect(planLocaleImportGate([])).toEqual({ action: "apply" });
    expect(planLocaleImportGate([{ work: [] }])).toEqual({ action: "apply" });
  });

  it("전달 안 된 REMOVE → 전체 보류", () => {
    expect(planLocaleImportGate([{ work: [item("ko", "delete", null)] }])).toEqual({ action: "defer", reason: "locale-change-pending" });
  });

  it("다른 소스의 전달 안 된 REMOVE도 보류한다 — 미전달 편집 보류와 같이 프로젝트 단위다", () => {
    expect(planLocaleImportGate([{ work: [] }, { work: [item("ko", "delete", null)] }])).toEqual({ action: "defer", reason: "locale-change-pending" });
  });

  it.each([
    ["값 있는 ADD 미전달", item("fr", "create", null)],
    ["전달 뒤 취소한 ADD", item("fr", null, "create")],
    ["전달 뒤 취소한 REMOVE", item("ko", null, "delete")],
  ])("%s → apply (REMOVE 미전달이 아니다)", (_name, work) => {
    expect(planLocaleImportGate([{ work: [work] }])).toEqual({ action: "apply" });
  });

  it("__proto__ 코드도 같은 판정이다", () => {
    expect(planLocaleImportGate([{ work: [item("__proto__", "delete", null)] }])).toEqual({ action: "defer", reason: "locale-change-pending" });
  });
});

describe("keptAddLocales", () => {
  it("ADD 행의 코드만, 코드순·중복 없이", () => {
    expect(keptAddLocales([
      { localeCode: "fr", operation: "ADD" },
      { localeCode: "ko", operation: "REMOVE" },
      { localeCode: "de", operation: "ADD" },
      { localeCode: "fr", operation: "ADD" },
    ])).toEqual(["de", "fr"]);
  });

  it("행 없음 → 빈 목록", () => {
    expect(keptAddLocales([])).toEqual([]);
  });

  it("__proto__ 코드를 객체 키로 잃지 않는다", () => {
    expect(keptAddLocales([{ localeCode: "__proto__", operation: "ADD" }])).toEqual(["__proto__"]);
  });
});
