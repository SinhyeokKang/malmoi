import { describe, expect, it } from "vitest";
import { highlightSegments, snippet } from "../highlight";
const matched = (text: string, tokens: string[]) => highlightSegments(text, tokens).filter(s => s.match).map(s => s.text);
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
