import { describe, expect, it } from "vitest";
import { androidInlineTagsMatch } from "../android-inline-tags";

describe("androidInlineTagsMatch — 화면 값의 태그 보존", () => {
  it.each([
    ["", ""], ["", "번역"], ["Plain", "일반 텍스트 < 3 &lt;b&gt;"],
    ['<b>Hello <i>world</i></b>', '<b>안녕 <i>세계</i></b>'],
    ['<b>A</b><i>B</i>', '<i>나</i><b>가</b>'],
    ['<xliff:g id="x" example="a > b">%s</xliff:g>', "<xliff:g example='a > b' id='x'>%s</xliff:g>"],
    ['<br/>A', '가<br />'],
    ['&lt;b&gt;text&lt;/b&gt;', '문자'],
    ['<![CDATA[<b>text</b>]]>', '<![CDATA[<i>글</i>]]>'],
  ])("태그 집합과 닫힘이 같으면 허용: %s", (base, value) => {
    expect(androidInlineTagsMatch(base, value)).toBe(true);
  });
  it.each([
    ['<b>A</b>', '가'], ['Plain', '<b>글</b>'], ['', '<b>글</b>'],
    ['<b>A</b>', '<b>가'], ['<b>A</b>', '</b>가<b>'],
    ['<b><i>A</i></b>', '<b><i>가</b></i>'],
    ['<b>A</b>', '<b>가</b><b>나</b>'],
    ['<xliff:g id="x">%s</xliff:g>', '<xliff:g id="y">%s</xliff:g>'],
    ['<b>A</b>', '<b extra="x">가</b>'], ['<br/>', '<br>'],
    ['<b>A</b>', '<b>가</b extra="x">'], ['<b>A</b>', '<b x=no>가</b>'],
    ['<b>A</b>', '<b x="1" x="2">가</b>'], ['<b>A</b>', '<b'],
    ['<b>A', '<b>가'],
  ])("누락·추가·속성 변경·잘못된 닫힘을 거부: %s → %s", (base, value) => {
    expect(androidInlineTagsMatch(base, value)).toBe(false);
  });
});
