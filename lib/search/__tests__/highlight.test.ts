import { describe, expect, it } from "vitest";
import { firstMatchRange, highlightSegments, snippet } from "../highlight";
import { searchTokens } from "../match";
const matched = (text: string, tokens: string[]) => highlightSegments(text, tokens).filter(s => s.match).map(s => s.text);
describe("원문의 첫 일치 범위", () => {
  it.each([
    ["İabc", "a", { start: 1, end: 2 }],
    ["İabc", "i\u0307", { start: 0, end: 1 }],
    ["i\u0307abc", "İa", { start: 0, end: 3 }],
    ["İİabc", "abc", { start: 2, end: 5 }],
    ["😀İabc", "a", { start: 3, end: 4 }],
    ["ΟΣ", "ος", { start: 0, end: 2 }],
    ["aaaa", "aa", { start: 0, end: 2 }],
    ["abc", "", null],
    ["abc", "z", null],
  ])("%s / %s → UTF-16 원문 경계", (text, q, range) => {
    expect(firstMatchRange(text, q)).toEqual(range);
  });
});
describe("강조와 스니펫", () => {
  it("İ 소문자화의 위치를 원문 경계로 되돌린다", () => {
    expect(matched("İstanbul", ["stan"])).toEqual(["stan"]);
    expect(matched("İabc", ["a"])).toEqual(["a"]);
    expect(matched("İİ", ["i"])).toEqual(["İİ"]);
    expect(matched("ΟΣ", ["ος"])).toEqual(["ΟΣ"]);
  });
  it("겹침·인접·중복 일치를 합치고 빈 토큰은 무시한다", () => {
    expect(highlightSegments("banana!", ["ana", "nan"])).toEqual([{ text: "b", match: false }, { text: "anana", match: true }, { text: "!", match: false }]);
    expect(highlightSegments("abc", [])).toEqual([{ text: "abc", match: false }]);
    expect(highlightSegments("", ["a"])).toEqual([{ text: "", match: false }]);
    expect(highlightSegments("abc", [""])).toEqual([{ text: "abc", match: false }]);
  });
  it("서로게이트 쌍을 가르지 않는다", () => {
    expect(highlightSegments("a😀b", ["😀"])).toEqual([{ text: "a", match: false }, { text: "😀", match: true }, { text: "b", match: false }]);
    const result = snippet("😀😀😀needle😀😀😀", ["needle"], 9);
    expect(result).toContain("needle");
    expect(result?.replace(/😀/g, "")).not.toMatch(/[\ud800-\udfff]/);
  });
  it("후반 일치·앞뒤 경계·표시할 원문 공백·긴 질의 전체를 보인다", () => {
    expect(snippet("x".repeat(200) + "settings demo" + "y".repeat(200), ["settings demo"], 30)).toContain("settings demo");
    expect(snippet("x".repeat(200) + "settings demo" + "y".repeat(200), ["settings demo"], 5)).toContain("settings demo");
    expect(snippet("hello world", ["hello"], 7)).toBe("hello w…");
    expect(snippet("hello world", ["world"], 7)).toBe("…o world");
    const multiline = snippet("hello\n  world", ["world"], 20);
    expect(multiline).toBe("hello\n  world");
    expect(multiline?.replace(/\s+/g, " ")).toBe("hello world");
    expect(matched(multiline ?? "", ["world"])).toEqual(["world"]);
    expect(snippet("İstanbul", ["stan"], 4)).toBe("…stan…");
    expect(snippet("none", ["other"], 20)).toBeNull();
  });
  it.each(["  ", "\t", "\n"])("전체 질의 안의 공백 %j를 후반 스니펫과 강조에 보존한다", whitespace => {
    const q = `settings${whitespace}demo`;
    const body = "Before ".repeat(40) + q + " After".repeat(10);
    for (const width of [5, 30]) {
      const excerpt = snippet(body, [q], width);
      expect(excerpt).toContain(q);
      expect(matched(excerpt ?? "", [q])).toEqual([q]);
      expect(excerpt?.replace(/\s+/g, " ")).toContain("settings demo");
    }
    expect(snippet("settings demo", [q], 30)).toBeNull();
  });
  it.each(["  ", "\t", "\n"])("공백 %j를 표시 정규화해 만든 앞쪽 가짜 일치 대신 원문 일치를 추린다", whitespace => {
    const q = "settings demo";
    const body = `false settings${whitespace}demo ` + "Before ".repeat(40) + `actual ${q} After`;
    const excerpt = snippet(body, [q], 30);
    expect(excerpt).toContain(`actual ${q}`);
    expect(excerpt).not.toContain("false");
    expect(matched(excerpt ?? "", [q])).toEqual([q]);
    expect(snippet(`settings${whitespace}demo`, [q], 30)).toBeNull();
  });
});

/**
 * **`/projects`도 이 함수로 이름을 칠한다** (search-ux-unify C6 — 옛 `highlightName`의 케이스를 옮겼다).
 * 대상은 이름 하나이고 토큰은 `searchTokens(q)`다 — 대조(`matchesAllTokens`)와 같은 토큰이라 찾은 행엔 칠한 자리가 있다.
 */
describe("/projects 이름 강조", () => {
  const name = (text: string, q: string) => highlightSegments(text, searchTokens(q));
  it("질의가 없으면 조각 하나다 — 칠할 것이 없다", () => {
    expect(name("chrome-extension", "")).toEqual([{ text: "chrome-extension", match: false }]);
    expect(name("chrome-extension", "   ")).toEqual([{ text: "chrome-extension", match: false }]);
  });
  it("대소문자를 무시하되 원문 표기를 보존한다", () => {
    expect(name("BugShot Web", "bugshot")).toEqual([{ text: "BugShot", match: true }, { text: " Web", match: false }]);
  });
  it("여러 번 나오면 전부, 일치가 없으면 통째로 하나, 앞뒤가 맞아도 빈 조각이 없다", () => {
    expect(name("a-b-a", "a")).toEqual([{ text: "a", match: true }, { text: "-b-", match: false }, { text: "a", match: true }]);
    expect(name("chrome", "figma")).toEqual([{ text: "chrome", match: false }]);
    expect(name("chrome", "chrome")).toEqual([{ text: "chrome", match: true }]);
  });
  it("여러 토큰을 각각 칠한다", () => {
    expect(name("Web App", "app web")).toEqual([{ text: "Web", match: true }, { text: " ", match: false }, { text: "App", match: true }]);
  });
  // POSTMORTEM 2026-09-13 — 소문자화가 길이를 늘리는 글자. 인접 일치는 한 조각으로 합쳐진다.
  it.each([
    ["İabc", "a", [{ text: "İ", match: false }, { text: "a", match: true }, { text: "bc", match: false }]],
    ["İabc", "i", [{ text: "İ", match: true }, { text: "abc", match: false }]],
    ["İİ", "i", [{ text: "İİ", match: true }]],
  ])("소문자 변환이 길이를 늘려도 원래 이름의 일치 구간을 보존한다: %s / %s", (text, q, expected) => {
    expect(name(text, q)).toEqual(expected);
  });
});
