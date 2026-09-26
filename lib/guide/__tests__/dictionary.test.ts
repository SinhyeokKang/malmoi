import { createElement } from "react";

import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { dictionaryStrings } from "../dictionary";

describe("dictionaryStrings — 굵게 라벨이 대조할 사전 문자열", () => {
  const dict = {
    publish: { button: "Publish", count: (n: number) => `Publish ${n} changes` },
    sources: { title: "Sources", body: createElement("p", null, "JSX text") },
    tabs: ["Home", "Logs"],
    publicDocs: { back: { app: "Back to projects" }, docs: { title: "Docs", intro: "Docs intro", sections: [{ title: "Only in docs" }] } },
    nested: { docs: { sections: ["Kept — only the path from the root is excluded"] } },
  };

  it("문자열 잎을 전부 모은다 — 배열 포함", () => {
    const strings = dictionaryStrings(dict);
    for (const text of ["Publish", "Sources", "Home", "Logs"]) expect(strings.has(text)).toBe(true);
  });

  it("`publicDocs.docs.sections`만 뺀다 — 옛 본문이 자기 자신을 근거로 늘 green이 된다", () => {
    const strings = dictionaryStrings(dict);
    expect(strings.has("Only in docs")).toBe(false);
    expect(strings.has("Kept — only the path from the root is excluded")).toBe(true);
  });

  it("`publicDocs`의 나머지는 화면 라벨이라 남는다 — 복귀 링크·셸 라벨", () => {
    const strings = dictionaryStrings(dict);
    for (const text of ["Back to projects", "Docs", "Docs intro"]) expect(strings.has(text)).toBe(true);
  });

  it("함수 값과 JSX 값을 뺀다 — 보간·조각은 굵게 쓰지 않는다", () => {
    const strings = dictionaryStrings(dict);
    expect([...strings].some((text) => text.includes("changes"))).toBe(false);
    expect(strings.has("JSX text")).toBe(false);
  });

  it("실제 사전에서 화면 라벨을 찾는다", () => {
    const strings = dictionaryStrings(m);
    expect(strings.has(m.translations.publish.button)).toBe(true);
    expect(strings.has(m.publicDocs.back.app)).toBe(true);
    expect(strings.has(m.publicDocs.privacy.title)).toBe(true);
    expect(strings.has(m.publicDocs.docs.title)).toBe(true);
    expect(strings.size).toBeGreaterThan(500);
  });
});
