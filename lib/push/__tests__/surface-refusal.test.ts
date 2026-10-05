import { describe, expect, it } from "vitest";

import { classifyMissingSurface } from "../surface-refusal";

/**
 * 활성 표면을 못 찾았을 때의 갈래 (sources-add-remove design §3.3). 같은 프로젝트에 그 slug의 제거된 행이 있으면
 * `removed`(409 `surface removed` + 거부 기록), 아니면 현행 `mismatch`(기록 없음 — 목록을 노출하지 않는다).
 */
describe("classifyMissingSurface", () => {
  it("같은 slug의 제거된 행이 있으면 removed", () => {
    expect(classifyMissingSurface({ archivedAt: new Date() })).toBe("removed");
  });

  it("행이 없으면 mismatch — 없음·다른 프로젝트가 같은 답이다", () => {
    expect(classifyMissingSurface(null)).toBe("mismatch");
  });

  it("활성 행이면 removed가 아니다 — 호출부가 활성 조회에서 못 찾은 경우만 부른다", () => {
    expect(classifyMissingSurface({ archivedAt: null })).toBe("mismatch");
  });
});
