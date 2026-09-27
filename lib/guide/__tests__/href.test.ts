import { describe, expect, it } from "vitest";

import { docHref } from "../href";

describe("docHref — SUMMARY slug → 문서 경로", () => {
  it("개요는 `/docs`, 하위는 세그먼트를 잇는다", () => {
    expect(docHref([])).toBe("/docs");
    expect(docHref(["setup"])).toBe("/docs/setup");
    expect(docHref(["setup", "workflow"])).toBe("/docs/setup/workflow");
  });
});
