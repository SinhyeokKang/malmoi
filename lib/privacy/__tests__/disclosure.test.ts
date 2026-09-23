import { describe, expect, it } from "vitest";

import { sectionGaps } from "../disclosure";

/**
 * 등재 ↔ 본문 대조 (privacy design §2.2 (B)). **대조 단위는 절 id다** — 표가 필드 여럿을 한 행으로
 * 접으므로 항목 라벨 문자열은 본문에 나타나지 않는다. 반환은 배열 셋이다(실패 메시지에 이름이 나와야 한다).
 */
const sections = [{ id: "collected" }, { id: "purposes" }, { id: "retention" }, { id: "cookies" }];
const targets = ["collected", "retention", "cookies"];

describe("sectionGaps", () => {
  it("등재가 가리키는 절이 전부 있고 대상 절이 전부 쓰이면 셋 다 빈 배열이다", () => {
    expect(sectionGaps(["collected", "retention", "cookies", "collected"], sections, targets)).toEqual({
      missingSections: [],
      unusedSections: [],
      duplicateIds: [],
    });
  });

  it("등재가 없는 절을 가리키면 missingSections에 이름이 나온다", () => {
    expect(sectionGaps(["collected", "retention", "cookies", "colected"], sections, targets).missingSections).toEqual(["colected"]);
  });

  it("대상 절이 본문에 없으면 missingSections에 나온다", () => {
    expect(sectionGaps(["collected", "retention"], sections.filter((s) => s.id !== "cookies"), ["collected", "retention", "cookies"]).missingSections).toEqual(["cookies"]);
  });

  it("아무 등재도 가리키지 않는 대상 절은 unusedSections다 — 본문이 말하는데 근거가 없다", () => {
    expect(sectionGaps(["collected", "retention"], sections, targets).unusedSections).toEqual(["cookies"]);
  });

  it("대상이 아닌 절(purposes)은 안 쓰여도 잡지 않는다", () => {
    expect(sectionGaps(["collected", "retention", "cookies"], sections, targets).unusedSections).toEqual([]);
  });

  it("절 id 중복을 따로 센다 — Set이면 조용히 사라지고 앵커는 첫 절로만 간다", () => {
    expect(sectionGaps(["collected", "retention", "cookies"], [...sections, { id: "retention" }], targets).duplicateIds).toEqual(["retention"]);
  });
});
