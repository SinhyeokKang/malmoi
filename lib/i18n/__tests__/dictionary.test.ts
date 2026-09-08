import { createElement, isValidElement, type ReactElement } from "react";

import { describe, expect, it } from "vitest";

import { m, pick } from "@/lib/i18n";

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

  /**
   * ⚠️ **1건이 가장 흔한 경우다** (2026-09-08 code-review 🟡A). 사전에 카운터를 만들어 두고 이 자리에서
   * 쓰지 않아 "1 values"가 나갔다 — 사용자가 읽는 문장의 문법 오류다.
   */
  it("건수가 1이면 단수다", () => {
    expect(m.translations.publish.partial(1, true)).toContain("1 value ");
    expect(m.translations.publish.partial(1, true)).not.toContain("1 values");
    expect(m.translations.publish.partial(1, false)).toContain("1 value ");
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

/**
 * ⚠️ **사전 조회는 `Object.hasOwn`을 지나야 한다** (2026-09-08 code-review 🔴1).
 *
 * `DICT[key] ?? fallback`은 프로토타입 키(`constructor`·`toString`·`valueOf`·`hasOwnProperty`)에서
 * **값이 찾아지므로** `??`가 안 걸린다 — 문자열 자리에 **함수**가 돌아가고, 그것이 JSX 자식으로
 * 렌더되면 화면이 통째로 죽는다. 초대 화면처럼 **외부인이 여는 페이지**가 `?e=`를 그대로 넘기므로
 * 이 경로는 주소창에서 도달 가능하다.
 */
describe("pick — 모르는 키에 항상 문자열", () => {
  const dict = { known: "Known message" };

  it("아는 키는 그 문구다", () => {
    expect(pick(dict, "known", "fallback")).toBe("Known message");
  });

  it("모르는 키는 폴백이다", () => {
    expect(pick(dict, "nope", "fallback")).toBe("fallback");
  });

  it("프로토타입 키가 폴백을 우회하지 못한다 — 넷을 하나씩 먹인다", () => {
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(pick(dict, key, "fallback"), key).toBe("fallback");
    }
  });

  it("문자열이 아닌 값도 폴백으로 접는다 — 사전에 함수 값이 섞여 있다", () => {
    expect(pick({ counter: (n: number) => `${n}` }, "counter", "fallback")).toBe("fallback");
  });
});
