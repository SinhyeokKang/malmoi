import { createElement, isValidElement, type ReactElement } from "react";

import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

/**
 * 사전의 **함수 값**만 테스트한다 (design §3.1.3). 문자열 값은 `as const` 접근이 곧 타입 검사라
 * 런타임 단언이 더할 것이 없지만, 함수는 복수형·보간·노드 삽입 로직을 들고 있어 틀릴 수 있다.
 */
describe("사전 — 카운터는 단수·복수를 가른다", () => {
  it("0·1·2", () => {
    expect(m.translations.keys(0)).toBe("0 keys");
    expect(m.translations.keys(1)).toBe("1 key");
    expect(m.translations.keys(2)).toBe("2 keys");
  });

  it("첫 적재 헤드라인은 실패 0건일 때만 성공 문장이다 — 버린 값을 숨기지 않는다 (SAAS 불변식 9)", () => {
    expect(m.newProject.imported(4, 0)).toBe("Imported 4 keys.");
    expect(m.newProject.imported(1, 0)).toBe("Imported 1 key.");
    expect(m.newProject.imported(903, 2)).toContain("2 couldn't be read");
  });

  it("Publish의 '일부 미기록'은 보냈는지에 따라 문장이 갈린다 — skipped에 'Sent'라고 쓰지 않는다", () => {
    expect(m.translations.publish.partial(3, true)).toMatch(/^Sent, but 3 values/);
    expect(m.translations.publish.partial(3, false)).toMatch(/^Nothing new was sent/);
  });

  it("실패 문구는 원인을 그대로 싣는다 — 삼키면 개발자에게 물어보는 것 말고 방법이 없어진다", () => {
    expect(m.translations.publish.failed("internal (ref abc)")).toContain("internal (ref abc)");
  });
});

describe("사전 — 노드를 삽입하는 값", () => {
  it("받은 노드를 그대로(참조 동일성) 문장 안에 둔다 — 문장은 사전이 소유한다", () => {
    const path = createElement("code", null, ".github/workflows/l10n.yml");
    const sentence = m.settings.workflow.saveAs(path);

    expect(isValidElement(sentence)).toBe(true);
    const children = (sentence as ReactElement<{ children: unknown[] }>).props.children;
    expect(children).toContain(path);
    // 문장의 나머지를 사전이 든다 — 화면이 앞뒤 조각을 들면 ko가 어순을 못 바꾼다.
    expect(children.some((child) => typeof child === "string" && child.includes("Save this"))).toBe(true);
  });
});
