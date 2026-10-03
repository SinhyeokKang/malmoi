// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isImeComposing, isPlainPrimaryClick, searchShortcut } from "../keyboard";

const key = (extra: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: "k", ...extra });
const click = (extra: MouseEventInit = {}) => new MouseEvent("click", { button: 0, ...extra });

describe("searchShortcut — 매처·칩 라벨·aria가 한 출력", () => {
  it.each([
    ["MacIntel", "mac", "Meta+K"],
    ["iPhone Mac", "mac", "Meta+K"],
    ["Win32", "other", "Control+K"],
    ["Linux x86_64", "other", "Control+K"],
  ] as const)("%s → label %s · aria %s", (platform, label, aria) => {
    const shortcut = searchShortcut(platform);
    expect(shortcut.label).toBe(label);
    expect(shortcut.aria).toBe(aria);
  });

  it("플랫폼을 모르면(서버 렌더) 칩·aria가 없지만 매처는 동작한다", () => {
    const shortcut = searchShortcut(null);
    expect(shortcut.label).toBeNull();
    expect(shortcut.aria).toBeNull();
    expect(shortcut.matches(key({ ctrlKey: true }))).toBe(true);
    expect(shortcut.matches(key({ metaKey: true }))).toBe(false);
  });

  it("플랫폼 수식키만 받고 Shift·Alt·반대 키·조합을 무시", () => {
    expect(searchShortcut("MacIntel").matches(key({ metaKey: true }))).toBe(true);
    expect(searchShortcut("MacIntel").matches(key({ ctrlKey: true }))).toBe(false);
    expect(searchShortcut("Win32").matches(key({ ctrlKey: true, key: "K" }))).toBe(true);
    expect(searchShortcut("Linux").matches(key({ metaKey: true }))).toBe(false);
    for (const extra of [{ shiftKey: true }, { altKey: true }, { ctrlKey: true }, { isComposing: true }, { keyCode: 229 }, { key: "j" }]) {
      expect(searchShortcut("MacIntel").matches(key({ metaKey: true, ...extra }))).toBe(false);
    }
  });
});

describe("isImeComposing", () => {
  it("isComposing 또는 keyCode 229면 조합 중", () => {
    expect(isImeComposing(key({ isComposing: true }))).toBe(true);
    expect(isImeComposing(key({ keyCode: 229 }))).toBe(true);
    expect(isImeComposing(key({ key: "Escape" }))).toBe(false);
    expect(isImeComposing({ isComposing: false, keyCode: 0 })).toBe(false);
  });
});

describe("isPlainPrimaryClick", () => {
  it("수식키 없는 주 버튼만 일반 클릭", () => {
    expect(isPlainPrimaryClick(click())).toBe(true);
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) expect(isPlainPrimaryClick(click(extra))).toBe(false);
  });

  it("가운데·보조 버튼은 일반 클릭이 아니다", () => {
    expect(isPlainPrimaryClick(click({ button: 1 }))).toBe(false);
    expect(isPlainPrimaryClick(click({ button: 2 }))).toBe(false);
  });
});
