import { describe, expect, it } from "vitest";

import { legacyAnchorTarget } from "../legacy";

/** 형태만 고정한다 — 옛 id 일곱의 실제 표는 IA 확정(1.2)과 같은 커밋에 선다. */
const TABLE = {
  formats: "/docs/reference/formats#formats",
  workflow: "/docs/setup/workflow#workflow",
};

describe("legacyAnchorTarget — 옛 `/docs#<id>` → 새 페이지", () => {
  it("`#`이 있든 없든 찾는다", () => {
    expect(legacyAnchorTarget("#formats", TABLE)).toBe("/docs/reference/formats#formats");
    expect(legacyAnchorTarget("workflow", TABLE)).toBe("/docs/setup/workflow#workflow");
  });

  it("표에 없으면 null — 빈 해시도", () => {
    expect(legacyAnchorTarget("#nope", TABLE)).toBeNull();
    expect(legacyAnchorTarget("", TABLE)).toBeNull();
    expect(legacyAnchorTarget("#", TABLE)).toBeNull();
  });

  it("프로토타입 키가 찾아지지 않는다 — `location.hash`는 남이 정한 키다", () => {
    expect(legacyAnchorTarget("#__proto__", TABLE)).toBeNull();
    expect(legacyAnchorTarget("#constructor", TABLE)).toBeNull();
    expect(legacyAnchorTarget("#toString", TABLE)).toBeNull();
  });

  it("인코딩된 해시를 풀지 않는다 — 옛 id는 전부 `[a-z-]`다", () => {
    expect(legacyAnchorTarget("#form%61ts", TABLE)).toBeNull();
  });
});
