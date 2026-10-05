import { describe, expect, it } from "vitest";

import { en } from "@/messages/en";
import { planAddBlock, planAddStep } from "@/lib/sources/add-block";

/**
 * **[Add selected sources]가 꺼진 사유는 막은 갈래를 말한다** (malmoi#93). 전엔 어느 갈래든 `Select at least one new source to add.`
 * 하나였다 — 탐지 중·탐지 실패·경로 충돌·기준 언어 없음에서 그것은 틀린 처방이다. 막는 것이 없으면 `null`이고 문장도 서지 않는다.
 */
const base = { detecting: false, detectError: false, formats: [{ baseLocale: "en" }], conflicts: 0 };
describe("planAddBlock", () => {
  it("막는 것이 없으면 null이다", () => { expect(planAddBlock(en, base)).toBeNull(); });
  it.each([
    [{ detecting: true }, en.settings.sources.blocked.detecting],
    [{ detectError: true }, en.settings.sources.blocked.detectFailed],
    [{ formats: [] }, en.settings.sources.selectHelp],
    [{ conflicts: 1 }, en.settings.sources.blocked.conflict],
    [{ formats: [{ baseLocale: "" }] }, en.settings.sources.blocked.base],
  ])("%o → 그 갈래의 문장", (patch, reason) => {
    expect(planAddBlock(en, { ...base, ...patch })).toBe(reason);
  });
  it("탐지가 먼저다 — 그동안은 고를 것이 아직 없다", () => {
    expect(planAddBlock(en, { ...base, detecting: true, formats: [] })).toBe(en.settings.sources.blocked.detecting);
  });
});

/**
 * **①→② [Next]의 사유는 ①이 고칠 수 있는 갈래뿐이다** (sources-add-remove A2). 기준 언어는 ②가 정하므로 ①을 막지 않는다 —
 * 막으면 ①에 기준 언어 컨트롤이 없어(A6) 사용자가 고칠 자리가 없는 사유를 읽는다.
 */
describe("planAddStep", () => {
  it("막는 것이 없으면 null이다", () => { expect(planAddStep(en, base)).toBeNull(); });
  it.each([
    [{ detecting: true }, en.settings.sources.blocked.detecting],
    [{ detectError: true }, en.settings.sources.blocked.detectFailed],
    [{ formats: [] }, en.settings.sources.selectHelp],
    [{ conflicts: 1 }, en.settings.sources.blocked.conflict],
  ])("%o → 그 갈래의 문장", (patch, reason) => {
    expect(planAddStep(en, { ...base, ...patch })).toBe(reason);
  });
  it("기준 언어가 빈 후보는 ①을 막지 않는다 — 그 값은 ②가 정한다", () => {
    expect(planAddStep(en, { ...base, formats: [{ baseLocale: "" }] })).toBeNull();
  });
  it("planAddBlock은 ①의 사유를 먼저 들고, 그다음이 기준 언어다", () => {
    expect(planAddBlock(en, { ...base, formats: [] })).toBe(planAddStep(en, { ...base, formats: [] }));
    expect(planAddBlock(en, { ...base, conflicts: 1, formats: [{ baseLocale: "" }] })).toBe(en.settings.sources.blocked.conflict);
  });
});
