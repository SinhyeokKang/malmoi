import { describe, expect, it } from "vitest";
import { jsonShape, sameCommonOrder } from "../json-shape";

/**
 * `jsonShape` — **원본 JSON 텍스트**에서 키 등장 순서와 들여쓰기를 뽑는다.
 *
 * ⚠️ **어댑터의 `read`를 쓸 수 없어서 존재한다.** `json-catalog.read`는 엔트리를 코드 유닛 순으로
 * 정렬해 돌려주므로(`json-catalog.ts:173`) 파일 순서가 그 지점에서 사라진다. `JSON.parse`도
 * 답이 아니다 — 정규 정수 키(`"0"`·`"10"`)를 JS 객체가 앞으로 끌어올려 삽입 순서를 지운다.
 *
 * 그래서 텍스트를 직접 훑는다. 이 모듈의 존재 이유가 곧 그 두 문장이다.
 */

const two = (obj: unknown) => `${JSON.stringify(obj, null, 2)}\n`;

describe("jsonShape — 키 등장 순서", () => {
  it("최상위 키를 파일에 쓰인 순서 그대로 준다 (정렬하지 않는다)", () => {
    expect(jsonShape(two({ b: "B", a: "A", c: "C" })).keyOrder).toEqual(["b", "a", "c"]);
  });

  it("중첩은 평탄화 순서(첫 등장)로 준다 — flatten과 같은 표기", () => {
    const text = two({ b: { y: "Y", x: "X" }, a: "A" });
    expect(jsonShape(text).keyOrder).toEqual(["b.y", "b.x", "a"]);
  });

  it("배열은 인덱스 키로 펼친다 (flatten과 같다)", () => {
    expect(jsonShape(two({ list: ["one", "two"] })).keyOrder).toEqual(["list.0", "list.1"]);
  });

  it("문자열이 아닌 리프는 세지 않는다 — flatten의 엔트리 집합과 맞춘다", () => {
    // null은 미번역, 숫자·불린은 어댑터가 에러로 거른다. 어느 쪽도 `entries`에 안 들어간다.
    const text = two({ ok: "OK", nil: null, n: 3, yes: true, after: "A" });
    expect(jsonShape(text).keyOrder).toEqual(["ok", "after"]);
  });

  it("빈 객체·빈 배열은 키를 만들지 않는다", () => {
    expect(jsonShape(two({ a: {}, b: [], c: "C" })).keyOrder).toEqual(["c"]);
  });

  it("정규 정수 키의 파일 순서를 지킨다 — JSON.parse는 이걸 못 한다", () => {
    // JS 객체는 "10"·"2"를 숫자 오름차순으로 끌어올린다. 파일에는 10이 먼저 쓰여 있다.
    const text = '{\n  "m": {\n    "10": "ten",\n    "2": "two"\n  }\n}\n';
    expect(jsonShape(text).keyOrder).toEqual(["m.10", "m.2"]);
    expect(Object.keys((JSON.parse(text) as { m: object }).m)).toEqual(["2", "10"]);
  });

  it("키에 든 이스케이프와 `.`을 그대로 다룬다", () => {
    const text = two({ "a.b": "flat", "quo\"te": "Q" });
    expect(jsonShape(text).keyOrder).toEqual(["a.b", 'quo"te']);
  });

  it("값에 든 중괄호·대괄호에 속지 않는다", () => {
    const text = two({ a: "{not:a,brace}", b: "[1,2]", c: "C" });
    expect(jsonShape(text).keyOrder).toEqual(["a", "b", "c"]);
  });

  it("이스케이프된 역슬래시로 끝나는 값에 속지 않는다", () => {
    const text = '{"a": "back\\\\", "b": "B"}\n';
    expect(jsonShape(text).keyOrder).toEqual(["a", "b"]);
  });

  it("깨진 JSON은 failed로 알린다 — 순서를 신뢰하면 안 된다", () => {
    const s = jsonShape("{ this is not json\n");
    expect(s.failed).toBe(true);
    expect(s.keyOrder).toEqual([]);
  });

  it("failed면 표현 관측(이스케이프·한 줄 컨테이너)도 버린다 — 프로덕션 `observeJsonStyle`과 같은 판정이다 (2026-09-04 audit #21)", () => {
    // 트레일링 콤마 파일: 스캔이 중간에 죽는다. 부분 관측을 세면 지표만 "축 덮임"으로 과대 계상한다.
    const s = jsonShape('{\n  "a": { "message": "\\ud55c" },\n}\n');
    expect(s.failed).toBe(true);
    expect(s.escapedNonAscii).toBe(false);
    expect(s.compactContainer).toBe(false);
  });

  it("최상위가 객체가 아니면 failed다", () => {
    expect(jsonShape("[1,2,3]\n").failed).toBe(true);
  });
});

describe("jsonShape — 들여쓰기", () => {
  it("2칸 스페이스를 읽는다", () => {
    expect(jsonShape(two({ a: { b: "B" } })).indent).toEqual({ char: "space", width: 2 });
  });

  it("4칸 스페이스를 읽는다", () => {
    expect(jsonShape(`${JSON.stringify({ a: { b: "B" } }, null, 4)}\n`).indent).toEqual({ char: "space", width: 4 });
  });

  it("탭을 읽는다", () => {
    expect(jsonShape(`${JSON.stringify({ a: { b: "B" } }, null, "\t")}\n`).indent).toEqual({ char: "tab", width: 1 });
  });

  it("한 줄짜리 파일은 none이다 — 들여쓰기를 관측할 수 없다", () => {
    expect(jsonShape('{"a":"A"}\n').indent).toEqual({ char: "none", width: 0 });
  });

  it("첫 들여쓴 줄을 기준으로 한다 — 깊은 층의 배수에 흔들리지 않는다", () => {
    expect(jsonShape(`${JSON.stringify({ a: { b: { c: "C" } } }, null, 4)}\n`).indent).toEqual({
      char: "space",
      width: 4,
    });
  });
});

describe("jsonShape — 잔여 diff 원인", () => {
  it("비ASCII 이스케이프를 관측한다 — 이제 원인이 아니라 관측치다 (태스크 1b)", () => {
    const escaped = '{\n  "a": "\\uD55C\\uAD6D"\n}\n';
    expect(jsonShape(escaped).escapedNonAscii).toBe(true);
    expect(jsonShape(two({ a: "한국" })).escapedNonAscii).toBe(false);
  });

  it("ASCII 이스케이프(\\n·\\\")는 원인이 아니다 — write도 같게 낸다", () => {
    expect(jsonShape('{\n  "a": "line\\nbreak"\n}\n').escapedNonAscii).toBe(false);
  });

  it("빈 값이 낀 배열을 관측한다 — write가 객체로 모양을 바꾼다", () => {
    // orderedEntries가 ""를 빼고 null은 flatten이 건너뛰므로, 복원에서 dense가 깨진다.
    expect(jsonShape(two({ list: ["a", "", "c"] })).causes.sparseArray).toBe(true);
    expect(jsonShape(two({ list: ["a", null, "c"] })).causes.sparseArray).toBe(true);
    expect(jsonShape(two({ list: ["a", "b"] })).causes.sparseArray).toBe(false);
  });

  it("정수형 키를 관측한다 — JS가 앞으로 끌어올려 순서 보존이 원리적으로 불가능하다", () => {
    expect(jsonShape('{\n  "m": {\n    "10": "ten",\n    "2": "two"\n  }\n}\n').causes.integerKeys).toBe(true);
    expect(jsonShape(two({ a: "A" })).causes.integerKeys).toBe(false);
  });

  it("배열 안의 인덱스는 정수형 키로 세지 않는다 — 배열은 원래 인덱스가 순서다", () => {
    expect(jsonShape(two({ list: ["a", "b"] })).causes.integerKeys).toBe(false);
  });

  it("배열 인덱스 범위를 넘는 숫자 키는 원인이 아니다 — JS가 끌어올리지 않는다", () => {
    // 2^32-1 이상은 배열 인덱스가 아니라 평범한 문자열 키라 삽입 순서가 유지된다.
    // 넓게 잡으면 "정수 키는 원리적으로 보존 불가"라는 비목표의 근거가 부풀려진다.
    expect(jsonShape(two({ "4294967295": "max", z: "Z" })).causes.integerKeys).toBe(false);
    expect(jsonShape(two({ "99999999999999": "big", z: "Z" })).causes.integerKeys).toBe(false);
    expect(jsonShape(two({ "4294967294": "in-range", z: "Z" })).causes.integerKeys).toBe(true);
  });

  it("음수·선행 0·소수는 정수형 키가 아니다", () => {
    expect(jsonShape(two({ "-1": "neg", z: "Z" })).causes.integerKeys).toBe(false);
    expect(jsonShape(two({ "01": "pad", z: "Z" })).causes.integerKeys).toBe(false);
    expect(jsonShape(two({ "1.5": "frac", z: "Z" })).causes.integerKeys).toBe(false);
  });

  it("미번역(빈 값)을 원인으로 표시한다 — write가 그 줄을 통째로 뺀다", () => {
    // zulip 실측: base가 `ar`이고 미번역이 `""`라 2285줄이 1378줄이 됐다. 순서 보존과 무관하고
    // 고쳐서도 안 된다(빈 값을 남기면 크롬이 빈 문자열을 그대로 렌더한다 — MVP §4.1).
    expect(jsonShape(two({ a: "A", b: "" })).causes.emptyValues).toBe(true);
    expect(jsonShape(two({ a: "A", b: "B" })).causes.emptyValues).toBe(false);
  });

  it("null도 미번역이다 — flatten이 건너뛰어 같은 결과가 된다", () => {
    expect(jsonShape(two({ a: "A", b: null })).causes.emptyValues).toBe(true);
  });

  it("빈 배열 원소는 sparseArray가 담당한다 — 두 원인이 겹쳐 세어지지 않는다", () => {
    const c = jsonShape(two({ list: ["a", "", "c"] })).causes;
    expect(c.sparseArray).toBe(true);
    expect(c.emptyValues).toBe(false);
  });

  it("점 포함 키가 중첩과 공존하면 원인으로 표시한다 — 경로로 쪼개져 구조가 바뀐다", () => {
    // musicblocks·scratchblocks·siyuan이 이 축이다. 키 구분자 계약을 빼는 별 기능이 담당한다.
    expect(jsonShape(two({ "a.b": "flat", c: { d: "nested" } })).causes.dottedWithNested).toBe(true);
  });

  it("중첩이 없으면 점 키가 있어도 원인이 아니다 — flat write는 키를 쪼개지 않는다", () => {
    expect(jsonShape(two({ "a.b": "x", "a.c": "y" })).causes.dottedWithNested).toBe(false);
  });

  it("점이 없으면 중첩이 있어도 원인이 아니다", () => {
    expect(jsonShape(two({ a: { b: "x" } })).causes.dottedWithNested).toBe(false);
  });

  it("한 줄에 담은 객체를 관측한다 — 이제 원인이 아니라 관측치다 (태스크 1b)", () => {
    // chrome `_locales`의 흔한 관례다: `"k": { "message": "..." }`. 전에는 `serialize`가 2칸으로
    // 펼쳐 파일 전체가 diff였다(button-stealer 실측 0.964, 38줄→128줄). 이제 되돌린다.
    expect(jsonShape('{\n  "a": { "message": "A" }\n}\n').compactContainer).toBe(true);
    expect(jsonShape(two({ a: { message: "A" } })).compactContainer).toBe(false);
  });

  it("한 줄에 담은 배열도 마찬가지다", () => {
    expect(jsonShape('{\n  "list": ["a", "b"]\n}\n').compactContainer).toBe(true);
    expect(jsonShape(two({ list: ["a", "b"] })).compactContainer).toBe(false);
  });

  it("빈 객체·빈 배열은 세지 않는다 — 우리도 한 줄로 낸다", () => {
    expect(jsonShape('{\n  "a": {},\n  "b": [],\n  "c": "C"\n}\n').compactContainer).toBe(false);
  });

  it("파일 전체가 한 줄이어도 최상위 자체는 세지 않는다 — 들여쓰기 관측 불가와 같은 축이다", () => {
    expect(jsonShape('{"a":"A"}\n').compactContainer).toBe(false);
  });

  /**
   * ⚠️ **들여쓰기는 더 이상 diff 원인이 아니다** (2026-09-04, 원본 포맷 보존). 재생성 writer가
   * 원본 폭을 따르므로 diff를 만들지 않고, **관측치로만 남는다.** 원인으로 남겨 두면 그 리포들이
   * `diff.clean` 분모에서 계속 빠져 개선이 게이트에 안 나타난다 (POSTMORTEM 2026-09-03).
   */
  it("들여쓰기는 관측치이지 원인이 아니다", () => {
    expect(jsonShape(`${JSON.stringify({ a: { b: "B" } }, null, 4)}\n`).indent).toEqual({ char: "space", width: 4 });
    expect(jsonShape(two({ a: { b: "B" } })).indent).toEqual({ char: "space", width: 2 });
    expect("indent" in jsonShape(two({ a: "A" })).causes).toBe(false);
  });

  it("들여쓰기를 관측할 수 없으면(한 줄) none이다", () => {
    // 0칸이라고 보고하면 "2칸이 아니다"가 되어 없는 사실이 선다.
    expect(jsonShape('{"a":"A"}\n').indent).toEqual({ char: "none", width: 0 });
  });
});

describe("sameCommonOrder — 로케일 간 순서 일치 판정", () => {
  it("같은 순서면 true", () => {
    expect(sameCommonOrder(["b", "a", "c"], ["b", "a", "c"])).toBe(true);
  });

  it("한 쌍이라도 뒤집히면 false", () => {
    expect(sameCommonOrder(["b", "a"], ["a", "b"])).toBe(false);
  });

  it("공통 키만 비교한다 — 한쪽에만 있는 키는 판정에서 뺀다", () => {
    // 로케일 파일은 번역이 덜 된 키가 빠져 있는 게 정상이다. 그걸 불일치로 세면
    // 일치율이 "번역 완성도"를 재게 되고, 순서 보존 설계와 무관한 숫자가 된다.
    expect(sameCommonOrder(["b", "a", "c"], ["b", "extra", "a", "c"])).toBe(true);
    expect(sameCommonOrder(["b", "a", "c"], ["b", "c"])).toBe(true);
  });

  it("공통 키가 없으면 false — 판정할 근거가 없는 것을 '같다'로 세지 않는다", () => {
    expect(sameCommonOrder(["a"], ["b"])).toBe(false);
    expect(sameCommonOrder([], ["a"])).toBe(false);
  });

  it("공통 키가 하나뿐이면 true — 순서가 성립하는 최소 조건은 만족한다", () => {
    expect(sameCommonOrder(["a", "z"], ["q", "a"])).toBe(true);
  });
});
