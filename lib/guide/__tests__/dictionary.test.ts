import { createElement } from "react";

import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { dictionaryStrings } from "../dictionary";

describe("dictionaryStrings — 굵게 라벨이 대조할 사전 문자열", () => {
  const dict = {
    publish: { button: "Publish", count: (n: number) => `Publish ${n} changes` },
    sources: { title: "Sources", body: createElement("p", null, "JSX text") },
    tabs: ["Home", "Logs"],
    publicDocs: { docs: { title: "Docs", toc: "On this page" }, privacy: { title: "Privacy Policy" } },
  };

  it("문자열 잎을 전부 모은다 — 배열 포함", () => {
    const strings = dictionaryStrings(dict);
    for (const text of ["Publish", "Sources", "Home", "Logs"]) expect(strings.has(text)).toBe(true);
  });

  /** 문서 본문이 원고(md)로 옮겨 사전의 `publicDocs`는 셸 라벨과 방침뿐이다 — 뺄 서브트리가 없다(2026-09-26). */
  it("`publicDocs`도 화면 라벨이라 다른 구역과 같이 모인다", () => {
    const strings = dictionaryStrings(dict);
    for (const text of ["Docs", "On this page", "Privacy Policy"]) expect(strings.has(text)).toBe(true);
  });

  it("함수 값과 JSX 값을 뺀다 — 보간·조각은 굵게 쓰지 않는다", () => {
    const strings = dictionaryStrings(dict);
    expect([...strings].some((text) => text.includes("changes"))).toBe(false);
    expect(strings.has("JSX text")).toBe(false);
  });

  it("실제 사전에서 화면 라벨을 찾는다", () => {
    const strings = dictionaryStrings(m);
    expect(strings.has(m.translations.publish.button)).toBe(true);
    expect(strings.has(m.publicDocs.docs.toc)).toBe(true);
    expect(strings.has(m.publicDocs.privacy.title)).toBe(true);
    expect(strings.has(m.publicDocs.docs.title)).toBe(true);
    expect(strings.size).toBeGreaterThan(500);
  });
});
