import { describe, expect, it } from "vitest";
import { androidInlineTagsMatch, androidInlineTagsIssue } from "../android-inline-tags";

describe("androidInlineTagsMatch — 화면 값의 태그 보존", () => {
  it.each([
    ["", ""], ["", "번역"], ["Plain", "일반 텍스트 &lt; 3 &lt;b&gt;"],
    ['<b>Hello <i>world</i></b>', '<b>안녕 <i>세계</i></b>'],
    ['<b>A</b><i>B</i>', '<i>나</i><b>가</b>'],
    ['<xliff:g id="x" example="a > b">%s</xliff:g>', "<xliff:g example='a > b' id='x'>%s</xliff:g>"],
    ['<br/>A', '가<br />'],
    ['&lt;b&gt;text&lt;/b&gt;', '문자'],
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
  ])("누락·추가·속성 변경·잘못된 닫힘을 거부: %s → %s", (base, value) => {
    expect(androidInlineTagsMatch(base, value)).toBe(false);
  });
});


describe("결정 14 — 문자 꺾쇠와 깨진 기준 값", () => {
  it.each(["a < b", "x <y", "사랑 </3", "<Enter>", "<", "</", "<3"])("정상 기준에서 원시 꺾쇠 입력을 거부한다: %s", value => {
    expect(androidInlineTagsMatch("Plain", value)).toBe(false);
  });
  it.each([
    ["<![CDATA[<b>text</b>]]>", "<![CDATA[<i>글</i>]]>"],
    ["Line1<br>Line2", "줄1<br>줄2"], ["<unknown>", "<unknown>"], ["a </ b", "a </ b"],
    ["<b>A", "<b>가"],
  ])("깨진 기준이어도 writer가 쓸 수 없는 번역은 거부한다: %s", (base, value) => {
    expect(androidInlineTagsIssue(base, value)).toBe("inline-markup-invalid");
  });
  it.each([["<unknown>", "<unknown><unknown>"], ["<b>A", "<i>가"]])("깨진 기준에서도 쓸 수 없는 번역은 거부한다", (base, value) => {
    expect(androidInlineTagsMatch(base, value)).toBe(false);
  });
});


describe("저장과 Android writer의 태그 문법", () => {
  it.each([
    "<한글>번역</한글>", '<b title="&broken;">번역</b>',
    '<b title="&#12abc;">번역</b>', "<!-- 주석 -->", "<![CDATA[번역]]>",
  ])("정상 기준에서 writer가 거부할 문법은 저장부터 거부한다: %s", value => {
    expect(androidInlineTagsIssue("Plain", value)).toBe("inline-markup-invalid");
  });
});


it.each([
  ["Line1<br>Line2", "줄1&lt;br>줄2"], ["<unknown>", "&lt;unknown>"], ["a </ b", "a &lt;/ b"], ["<unknown>", "알 수 없음"],
])("옛 기준이 깨졌으면 집합 비교 없이 쓸 수 있는 번역을 허용한다: %s", (base, value) => {
  expect(androidInlineTagsIssue(base, value)).toBeNull();
});
