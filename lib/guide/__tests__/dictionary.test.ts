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

  it("뺄 경로(exclude)의 값과 그 아래를 모으지 않는다 — 다른 경로의 같은 문자열은 남는다", () => {
    const withAxis = { filters: { axis: { kind: "Kind", source: "Source" }, state: { axis: "State", any: "Any state" } }, detail: { source: "Source" } };
    const strings = dictionaryStrings(withAxis, new Set(["filters.axis", "filters.state.axis"]));
    for (const text of ["Kind", "State"]) expect(strings.has(text), text).toBe(false);
    for (const text of ["Any state", "Source"]) expect(strings.has(text), text).toBe(true);
    // 경로는 정확히 맞아야 한다 — 이름이 비슷한 형제는 빠지지 않는다
    expect(dictionaryStrings({ a: { axis: "X", axisx: "Y" } }, new Set(["a.axis"])).has("Y")).toBe(true);
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
