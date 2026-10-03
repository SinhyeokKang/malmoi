// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { shouldIgnoreShortcut, nextActive, reconcileActive } from "../keys";
afterEach(() => { document.body.innerHTML = ""; });
describe("검색 단축키와 활성 id", () => {
  it("input·textarea·편집 영역의 자손·열린 Dialog와 메뉴를 무시", () => {
    document.body.innerHTML = '<input/><textarea></textarea><div contenteditable="true"><span id="child"></span></div><button></button>';
    for (const selector of ["input", "textarea", "#child"]) expect(shouldIgnoreShortcut(document.querySelector(selector), document)).toBe(true);
    expect(shouldIgnoreShortcut(document.querySelector("button"), document)).toBe(false);
    expect(shouldIgnoreShortcut(null, document)).toBe(false);
    for (const role of ["dialog", "menu"]) {
      const overlay = document.createElement("div"); overlay.setAttribute("role", role); document.body.append(overlay);
      expect(shouldIgnoreShortcut(document.querySelector("button"), document)).toBe(true); overlay.remove();
    }
  });
  it("비면 null·양방향 순환·없는 활성은 첫/끝", () => {
    expect(nextActive([], null, 1)).toBeNull();
    expect(nextActive(["a", "b"], "b", 1)).toBe("a");
    expect(nextActive(["a", "b"], "a", -1)).toBe("b");
    expect(nextActive(["a", "b"], null, 1)).toBe("a");
    expect(nextActive(["a", "b"], null, -1)).toBe("b");
  });
  // 첫 열림·질의 직후엔 활성이 첫 행을 따라간다 — 늦게 온 그룹이 위에 끼면 Enter의 목적지가 응답 순서에 달린다(2026-10-03 사용자).
  // 사용자가 ↑↓·hover로 옮긴 뒤에만 그 id를 지킨다. 질의가 바뀌거나 그 id가 사라지면 다시 "옮기지 않음"이다.
  it("옮기지 않았으면 늦은 그룹이 와도 첫 행을 따라간다", () => {
    expect(reconcileActive(["key", "doc"], { activeId: "doc", moved: false }, false)).toEqual({ activeId: "key", moved: false });
    expect(reconcileActive(["d1", "d2", "go-to-docs"], { activeId: "go-to-docs", moved: false }, false)).toEqual({ activeId: "d1", moved: false });
  });
  it("옮긴 뒤엔 늦은 그룹 삽입에도 id를 지킨다", () => {
    expect(reconcileActive(["key", "doc"], { activeId: "doc", moved: true }, false)).toEqual({ activeId: "doc", moved: true });
  });
  it("질의 변경·id 소실은 첫 행이고 옮김을 잊는다", () => {
    expect(reconcileActive(["key", "doc"], { activeId: "doc", moved: true }, true)).toEqual({ activeId: "key", moved: false });
    expect(reconcileActive(["key"], { activeId: "doc", moved: true }, false)).toEqual({ activeId: "key", moved: false });
    expect(reconcileActive([], { activeId: "doc", moved: true }, false)).toEqual({ activeId: null, moved: false });
  });
});
