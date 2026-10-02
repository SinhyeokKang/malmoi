// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isSearchShortcut, shouldIgnoreShortcut, nextActive, reconcileActive } from "../keys";
const event = (extra: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: "k", ...extra });
afterEach(() => { document.body.innerHTML = ""; });
describe("검색 단축키와 활성 id", () => {
  it("플랫폼 수식키만 받고 Shift·Alt·반대 키·조합을 무시", () => {
    expect(isSearchShortcut(event({ metaKey: true }), "MacIntel")).toBe(true);
    expect(isSearchShortcut(event({ ctrlKey: true }), "MacIntel")).toBe(false);
    expect(isSearchShortcut(event({ ctrlKey: true, key: "K" }), "Win32")).toBe(true);
    expect(isSearchShortcut(event({ metaKey: true }), "Linux")).toBe(false);
    for (const extra of [{ shiftKey: true }, { altKey: true }, { ctrlKey: true }, { isComposing: true }, { keyCode: 229 }, { key: "j" }]) expect(isSearchShortcut(event({ metaKey: true, ...extra }), "MacIntel")).toBe(false);
  });
  it("input·textarea·편집 영역의 자손·열린 Dialog와 메뉴를 무시", () => {
    document.body.innerHTML = '<input/><textarea/><div contenteditable="true"><span id="child"></span></div><button></button>';
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
  it("질의 변경은 첫 id·늦은 그룹 삽입은 id 보존·사라지면 첫 id", () => {
    expect(reconcileActive(["doc"], ["key", "doc"], "doc", false)).toBe("doc");
    expect(reconcileActive(["doc"], ["key", "doc"], "doc", true)).toBe("key");
    expect(reconcileActive(["doc"], ["key"], "doc", false)).toBe("key");
    expect(reconcileActive(["doc"], [], "doc", false)).toBeNull();
  });
});
