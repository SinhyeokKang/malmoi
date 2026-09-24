import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";
import { planAddBlock } from "@/lib/sources/add-block";

/**
 * **[Add selected sources]가 꺼진 사유는 막은 갈래를 말한다** (malmoi#93). 전엔 어느 갈래든 `Select at least one new source to add.`
 * 하나였다 — 탐지 중·탐지 실패·경로 충돌·기준 언어 없음에서 그것은 틀린 처방이다. 막는 것이 없으면 `null`이고 문장도 서지 않는다.
 */
const base = { detecting: false, detectError: false, formats: [{ baseLocale: "en" }], conflicts: 0 };
describe("planAddBlock", () => {
  it("막는 것이 없으면 null이다", () => { expect(planAddBlock(base)).toBeNull(); });
  it.each([
    [{ detecting: true }, m.settings.sources.blocked.detecting],
    [{ detectError: true }, m.settings.sources.blocked.detectFailed],
    [{ formats: [] }, m.settings.sources.selectHelp],
    [{ conflicts: 1 }, m.settings.sources.blocked.conflict],
    [{ formats: [{ baseLocale: "" }] }, m.settings.sources.blocked.base],
  ])("%o → 그 갈래의 문장", (patch, reason) => {
    expect(planAddBlock({ ...base, ...patch })).toBe(reason);
  });
  it("탐지가 먼저다 — 그동안은 고를 것이 아직 없다", () => {
    expect(planAddBlock({ ...base, detecting: true, formats: [] })).toBe(m.settings.sources.blocked.detecting);
  });
});
