import { describe, expect, it } from "vitest";
import { chromeLocales, jsonCatalog } from "../index";
import type { AdapterFile, LocaleEntry } from "../types";

/**
 * `read`가 **버리던 두 가지를 관측한다** (`docs/features/key-order-preservation/` 태스크 1).
 *
 * 1. **파일에서의 키 순서** — `read`는 엔트리를 코드 유닛 순으로 정렬해 돌려주므로 원본 순서가
 *    그 지점에서 사라진다. 첫 pull PR이 파일을 통째로 재정렬하는 뿌리가 여기다.
 * 2. **chrome `placeholders`** — `LocaleEntry`에 필드가 없어 read가 아예 안 읽었다. 실측에서
 *    chrome 리포 33개 중 12개가 이 블록을 갖는다 (`docs/ADAPTER-COVERAGE.md` §10.3).
 *
 * ⚠️ **`read`는 계속 정렬해서 돌려준다.** 호출부가 그걸 전제하고, 순서는 `order` 필드로 따로
 * 나른다 — 배열 위치에 의존하는 설계로 바꾸면 회귀 범위가 어댑터 밖까지 번진다
 * (`contract.ts`의 "입력 배열 순서 무관" 불변식).
 */

const f = (path: string, content: string): AdapterFile => ({ path, content });
const two = (obj: unknown) => `${JSON.stringify(obj, null, 2)}\n`;

const orderOf = (entries: readonly LocaleEntry[]): Record<string, number | undefined> =>
  Object.fromEntries(entries.map((e) => [e.key, e.order]));

describe("json-catalog.read — 파일 순서를 order로 관측한다", () => {
  const nested = { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", locales: ["en"] };

  it("중첩은 평탄화 순서(첫 등장)를 준다", () => {
    const r = jsonCatalog.read(nested, [f("i18n/en.json", two({ b: { y: "Y", x: "X" }, a: "A" }))]);
    expect(r.errors).toEqual([]);
    expect(orderOf(r.locales[0]!.entries)).toEqual({ "b.y": 0, "b.x": 1, a: 2 });
  });

  it("엔트리는 **여전히 코드 유닛 순으로 정렬**해서 돌려준다 — 순서는 order가 나른다", () => {
    const r = jsonCatalog.read(nested, [f("i18n/en.json", two({ b: { y: "Y", x: "X" }, a: "A" }))]);
    expect(r.locales[0]!.entries.map((e) => e.key)).toEqual(["a", "b.x", "b.y"]);
  });

  it("배열 인덱스 키도 order를 갖는다", () => {
    const r = jsonCatalog.read(nested, [f("i18n/en.json", two({ list: ["one", "two"], z: "Z" }))]);
    expect(orderOf(r.locales[0]!.entries)).toEqual({ "list.0": 0, "list.1": 1, z: 2 });
  });

  it("건너뛴 리프는 번호를 먹지 않는다 — order에 구멍이 없다", () => {
    // null은 미번역이라 엔트리가 안 되고, 숫자는 에러로 빠진다. 둘 다 번호를 소비하면
    // order가 "몇 번째 엔트리인가"가 아니라 "몇 번째 노드인가"가 되어 읽는 쪽이 헷갈린다.
    const r = jsonCatalog.read(nested, [f("i18n/en.json", two({ a: "A", nil: null, n: 3, z: "Z" }))]);
    expect(orderOf(r.locales[0]!.entries)).toEqual({ a: 0, z: 1 });
  });

  it("파일마다 0부터 다시 센다 — order는 파일 스코프다", () => {
    const fmt = { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", locales: ["en", "ko"] };
    const r = jsonCatalog.read(fmt, [
      f("i18n/en.json", two({ b: "B", a: "A" })),
      f("i18n/ko.json", two({ b: "비", a: "에이" })),
    ]);
    expect(orderOf(r.locales[0]!.entries)).toEqual({ b: 0, a: 1 });
    expect(orderOf(r.locales[1]!.entries)).toEqual({ b: 0, a: 1 });
  });

  it("flat 파일도 order를 갖는다", () => {
    const r = jsonCatalog.read(nested, [f("i18n/en.json", two({ "b.two": "Two", "a.one": "One" }))]);
    expect(orderOf(r.locales[0]!.entries)).toEqual({ "b.two": 0, "a.one": 1 });
  });
});

describe("chrome-locales.read — 파일 순서를 order로 관측한다", () => {
  const format = {
    adapter: "chrome-locales" as const,
    pathTemplate: "_locales/{locale}/messages.json",
    locales: ["en"],
  };

  it("flat이라 Object.entries 순서 그대로다", () => {
    const r = chromeLocales.read(format, [
      f("_locales/en/messages.json", two({ C: { message: "c" }, A: { message: "a" }, B: { message: "b" } })),
    ]);
    expect(r.errors).toEqual([]);
    expect(orderOf(r.locales[0]!.entries)).toEqual({ C: 0, A: 1, B: 2 });
  });

  it("에러로 빠진 키는 번호를 먹지 않는다", () => {
    const r = chromeLocales.read(format, [
      f("_locales/en/messages.json", two({ A: { message: "a" }, BAD: { description: "no message" }, B: { message: "b" } })),
    ]);
    expect(r.errors).toHaveLength(1);
    expect(orderOf(r.locales[0]!.entries)).toEqual({ A: 0, B: 1 });
  });
});

describe("chrome-locales.read — placeholders를 그대로 나른다", () => {
  const format = {
    adapter: "chrome-locales" as const,
    pathTemplate: "_locales/{locale}/messages.json",
    locales: ["en"],
  };

  it("원본 블록을 해석하지 않고 그대로 싣는다", () => {
    // 구조를 검증하기 시작하면 크롬 스펙을 따라다녀야 한다. 요구는 "잃지 않는다"뿐이다.
    const placeholders = { user: { content: "$1", example: "Bob" }, count: { content: "$2" } };
    const r = chromeLocales.read(format, [
      f("_locales/en/messages.json", two({ GREET: { message: "Hi $user$", placeholders } })),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.locales[0]!.entries[0]?.placeholders).toEqual(placeholders);
  });

  it("placeholders 안의 키 순서를 보존한다 — 우리가 만든 구조가 아니다", () => {
    const r = chromeLocales.read(format, [
      f("_locales/en/messages.json", '{"G":{"message":"m","placeholders":{"z":{"content":"$1"},"a":{"content":"$2"}}}}'),
    ]);
    expect(Object.keys(r.locales[0]!.entries[0]!.placeholders!)).toEqual(["z", "a"]);
  });

  it("없으면 필드를 만들지 않는다 — 빈 객체를 넣으면 write가 없던 블록을 만든다", () => {
    const r = chromeLocales.read(format, [f("_locales/en/messages.json", two({ A: { message: "a" } }))]);
    expect(r.locales[0]!.entries[0]).not.toHaveProperty("placeholders");
  });

  it("객체가 아닌 placeholders는 싣지 않는다 — 그대로 되돌리면 크롬이 깨진다", () => {
    const r = chromeLocales.read(format, [
      f("_locales/en/messages.json", two({ A: { message: "a", placeholders: "nope" } })),
    ]);
    expect(r.locales[0]!.entries[0]).not.toHaveProperty("placeholders");
  });

  it("description은 base가 아닌 로케일에서도 읽는다 (기존 동작 — 회귀 감시)", () => {
    const fmt = { ...format, locales: ["en", "ko"] };
    const r = chromeLocales.read(fmt, [
      f("_locales/en/messages.json", two({ A: { message: "a", description: "d" } })),
      f("_locales/ko/messages.json", two({ A: { message: "에이", description: "설명" } })),
    ]);
    expect(r.locales.find((l) => l.locale === "ko")?.entries[0]?.description).toBe("설명");
  });
});
