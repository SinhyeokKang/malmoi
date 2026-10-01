import { describe, expect, it } from "vitest";

import { IMPORT_FAILURE_CODES, importFailureTone } from "../import-failure";

/** 실패의 톤 (2026-09-30 상태 통일) — 일부 반영만 호박이고 나머지는 빨강. 모든 화면이 이 한 판정을 따른다. */
describe("importFailureTone", () => {
  it("partial-import만 warning이고 나머지는 전부 danger다", () => {
    for (const code of IMPORT_FAILURE_CODES) expect(importFailureTone(code), code).toBe(code === "partial-import" ? "warning" : "danger");
  });
});
