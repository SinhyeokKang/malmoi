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

  it("첫 적재 헤드라인은 실패 0건일 때만 성공 문장이다 — 버린 값을 숨기지 않는다 (ARCHITECTURE §0 불변식 9)", () => {
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

  /**
   * 편집 손실 배너 (design §3.11). **주어가 편집자의 행동이다** — 처음 초안은 "code push"가 주어였고,
   * 실제 경계가 pull 실행이 아니라 **PR 머지**인 것도 담지 못했다 (CDO·CPO 검수).
   */
  it("배너는 1건과 여러 건의 문장이 갈린다", () => {
    expect(m.translations.banner.unsent(1)).toContain("1 change ");
    expect(m.translations.banner.unsent(1)).not.toContain("1 changes");
    expect(m.translations.banner.unsent(4)).toContain("4 changes ");
  });

  it("배너는 편집자가 할 수 있는 일로 끝난다 — 막힌 사실만 말하면 갇힌다", () => {
    expect(m.translations.banner.unsent(2)).toMatch(/send them/i);
    expect(m.translations.banner.unsent(2)).toContain("Sync");
    expect(m.translations.banner.unsent(2)).toContain("merged");
  });

  it("Publish 버튼 라벨이 미배포 건수를 든다 — 0이면 숫자를 붙이지 않는다", () => {
    expect(m.translations.publish.button(0)).toBe("Send changes");
    expect(m.translations.publish.button(3)).toBe("Send changes (3)");
  });
});

describe("사전 — 관사는 데이터를 따라가지 못한다", () => {
  /**
   * ⚠️ 2026-09-08 실물 검증에서 "as a Editor"가 나왔다. 역할 이름은 데이터라 문장이 a/an을 알 수 없고,
   * 알려면 역할마다 관사 표를 두게 된다 — 직함처럼 관사 없이 쓴다.
   */
  /**
   * ⚠️ **초대 문장이 그 자리를 떠났다** (account-linking §6) — 프로젝트 이름과 역할은 이제 카드의
   * 두 행이라 관사가 붙을 문장 자체가 없다. 규칙이 사라진 것이 아니라 **대상이 옮겨갔다**:
   * 지금 데이터를 문장에 넣는 자리는 병합 화면의 provider 이름 둘이다.
   */
  it("데이터를 문장에 넣는 자리에 부정관사를 붙이지 않는다", () => {
    expect(m.invite.title).not.toMatch(/ an? /);
    expect(m.link.confirm("GitHub")).toBe("Confirm with GitHub");
    for (const provider of ["GitHub", "Google"]) {
      expect(m.link.confirm(provider)).not.toMatch(/ an? /);
      expect(m.link.description(provider, "GitHub")).not.toMatch(/ an? /);
    }
  });
});

describe("사전 — 노드를 삽입하는 값", () => {
  it("받은 노드를 그대로(참조 동일성) 문장 안에 둔다 — 문장은 사전이 소유한다", () => {
    const path = createElement("code", null, ".github/workflows/malmoi-i18n.yml");
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
