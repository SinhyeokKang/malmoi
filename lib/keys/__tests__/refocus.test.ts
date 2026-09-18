import { describe, expect, it } from "vitest";

import { shouldRefocus } from "../refocus";

/**
 * ⚠️ **blur 저장은 비동기다** (DESIGN §6.1). 실패 응답이 올 때 사용자는 이미 **다음 셀에
 * 타이핑 중**일 수 있고, 그 순간 커서를 뺏으면 입력이 엉뚱한 셀로 들어간다 (WCAG 3.2 예측 가능성).
 * 처음 초안은 실패 시 무조건 `focus()`였고 CDO 검수가 그것을 잡았다.
 *
 * DOM 없이 판정할 수 있어야 이 테스트가 성립한다 — vitest 환경이 `node`라 `document`가 없다.
 */
const el = (tagName: string): Element => ({ tagName }) as unknown as Element;

describe("shouldRefocus — 저장 실패 뒤 커서를 되돌릴까", () => {
  const own = el("TEXTAREA");

  it("포커스가 아무 데도 없으면(body) 되돌린다 — 뺏을 것이 없다", () => {
    expect(shouldRefocus(el("BODY"), own)).toBe(true);
  });

  it("`activeElement`가 null이어도 되돌린다 — body와 같은 상태다", () => {
    expect(shouldRefocus(null, own)).toBe(true);
  });

  it("그 셀에 아직 있으면 되돌린다 — 이동한 적이 없다", () => {
    expect(shouldRefocus(own, own)).toBe(true);
  });

  it("⚠️ 다른 셀을 치고 있으면 뺏지 않는다 — 이것이 이 함수가 존재하는 이유다", () => {
    expect(shouldRefocus(el("TEXTAREA"), own)).toBe(false);
  });

  it("다른 컨트롤에 있어도 뺏지 않는다 — Publish를 누르려던 중일 수 있다", () => {
    expect(shouldRefocus(el("BUTTON"), own)).toBe(false);
    expect(shouldRefocus(el("INPUT"), own)).toBe(false);
  });

  it("돌려줄 대상이 없으면 false다 — 언마운트된 셀에 focus()를 부르지 않는다", () => {
    expect(shouldRefocus(el("BODY"), null)).toBe(false);
    expect(shouldRefocus(null, null)).toBe(false);
  });
});
