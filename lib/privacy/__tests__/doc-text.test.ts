import { describe, expect, it } from "vitest";
import { createElement } from "react";

import { docDigest, docText } from "../doc-text";

/**
 * 방침 본문의 텍스트와 해시 (privacy design §2.2 (C)). ⚠️ **jsdom을 부르지 않는다** — `renderToStaticMarkup`
 * + 태그 제거로 node에서 닫는다(파일 단위 환경 지시자가 다른 검사까지 끌고 간다).
 */
const doc = (p: string) => [{ id: "a", heading: "Title", blocks: [{ p }, { ul: ["one", "two"] }] }];

describe("docText", () => {
  it("제목·문단·목록을 텍스트로 모은다", () => {
    expect(docText(doc("Hello world"))).toBe("Title Hello world one two");
  });

  it("ReactNode가 섞인 블록에서 [object Object]가 나오지 않는다", () => {
    const text = docText([{ id: "a", heading: "T", blocks: [{ p: createElement("span", null, "Write to ", createElement("a", { href: "mailto:x@y.z" }, "x@y.z")) }] }]);
    expect(text).toBe("T Write to x@y.z");
    expect(text).not.toContain("[object");
  });

  it("표의 머리와 셀도 든다", () => {
    expect(docText([{ id: "a", heading: "T", blocks: [{ table: { label: "L", head: ["A", "B"], rows: [["1", "2"]] } }] }])).toBe("T A B 1 2");
  });

  it("빈 sections는 빈 문자열이다", () => {
    expect(docText([])).toBe("");
  });

  it("엔티티를 되돌린다 — 따옴표를 쓴 문장과 쓰지 않은 문장의 해시가 표기 차이로 갈리지 않게", () => {
    expect(docText(doc(`Don't & "quote"`))).toBe(`Title Don't & "quote" one two`);
  });
});

describe("docDigest", () => {
  it("같은 내용 다른 공백은 같은 해시다", () => {
    expect(docDigest(docText(doc("Hello   world")))).toBe(docDigest(docText(doc("Hello world"))));
  });

  it("한 글자 바꾸면 다른 해시다", () => {
    expect(docDigest(docText(doc("Hello world")))).not.toBe(docDigest(docText(doc("Hello World"))));
  });

  it("sha256 hex 64자다", () => {
    expect(docDigest("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});
