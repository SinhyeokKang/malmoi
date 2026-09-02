import { describe, expect, it } from "vitest";
import { orderedEntries } from "../shared";
import type { LocaleEntry } from "../types";

/**
 * `orderedEntries` — 재생성 writer 전부가 지나는 **유일한 관문**이다 (`usableEntries`를 대체).
 *
 * 거르는 규칙(orphaned·빈 값)은 그대로고, **정렬 규칙만 바뀐다**: `order`가 있으면 그 순서,
 * 없으면 코드 유닛 순으로 뒤에 붙는다 (`docs/features/key-order-preservation/`).
 *
 * ⚠️ **전순서라야 한다.** 동률에서 입력 배열 순서로 갈리면 DB 조회 순서가 바이트에 새어
 * `같은 DB 상태 → 같은 바이트`가 환경에 묶인다 — blob SHA 비교 전체가 그 위에 서 있다.
 */

const keys = (entries: readonly LocaleEntry[]) => entries.map((e) => e.key);
const e = (key: string, over: Partial<LocaleEntry> = {}): LocaleEntry => ({
  key,
  message: `V_${key}`,
  ...over,
});

describe("orderedEntries — order가 있으면 그 순서", () => {
  it("order 오름차순으로 낸다 (키 순서가 아니다)", () => {
    expect(keys(orderedEntries([e("a", { order: 2 }), e("b", { order: 0 }), e("c", { order: 1 })]))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("배열 위치가 아니라 order 필드에만 의존한다", () => {
    const list = [e("a", { order: 2 }), e("b", { order: 0 }), e("c", { order: 1 })];
    expect(keys(orderedEntries(list))).toEqual(keys(orderedEntries([...list].reverse())));
  });

  it("order 0을 빠뜨리지 않는다 — falsy라 `e.order ? …`로 짜면 맨 뒤로 밀린다", () => {
    expect(keys(orderedEntries([e("z", { order: 1 }), e("a", { order: 0 })]))).toEqual(["a", "z"]);
  });

  it("음수 order도 순서대로 — 값의 의미를 해석하지 않는다", () => {
    expect(keys(orderedEntries([e("a", { order: 1 }), e("b", { order: -1 })]))).toEqual(["b", "a"]);
  });
});

describe("orderedEntries — order가 없으면 코드 유닛 순으로 뒤에", () => {
  it("전부 없으면 코드 유닛 순 — 지금까지의 동작 그대로다", () => {
    expect(keys(orderedEntries([e("b"), e("A"), e("a"), e("1")]))).toEqual(["1", "A", "a", "b"]);
  });

  it("있는 것이 먼저, 없는 것이 뒤에 붙는다", () => {
    // 마이그레이션 직후 sortIndex가 전부 null인 상태와, 새 키가 하나 들어온 상태가 이 경로다.
    expect(keys(orderedEntries([e("zz"), e("aa"), e("m", { order: 5 })]))).toEqual(["m", "aa", "zz"]);
  });

  it("order가 커도 order 없는 것보다 앞이다 — 크기 비교가 아니라 두 층이다", () => {
    expect(keys(orderedEntries([e("aaa"), e("zzz", { order: 999 })]))).toEqual(["zzz", "aaa"]);
  });
});

describe("orderedEntries — 동률은 코드 유닛으로 갈라 결정적이다", () => {
  it("같은 order면 키 코드 유닛 순", () => {
    expect(keys(orderedEntries([e("b", { order: 0 }), e("a", { order: 0 })]))).toEqual(["a", "b"]);
  });

  it("동률에서도 배열 순서에 의존하지 않는다", () => {
    const list = [e("b", { order: 0 }), e("a", { order: 0 }), e("c", { order: 0 })];
    expect(keys(orderedEntries(list))).toEqual(keys(orderedEntries([...list].reverse())));
  });
});

describe("orderedEntries — 거르는 규칙은 그대로다", () => {
  it("orphaned를 뺀다 — DB엔 남기고 파일에서만 뺀다", () => {
    expect(keys(orderedEntries([e("a", { order: 0 }), e("gone", { order: 1, orphaned: true })]))).toEqual(["a"]);
  });

  it("빈 값을 뺀다 — 미번역이라 폴백해야 한다", () => {
    expect(keys(orderedEntries([e("a", { order: 0 }), e("empty", { order: 1, message: "" })]))).toEqual(["a"]);
  });

  it("거른 뒤 order에 구멍이 남아도 순서가 유지된다", () => {
    const out = orderedEntries([
      e("a", { order: 0 }),
      e("gone", { order: 1, orphaned: true }),
      e("c", { order: 2 }),
    ]);
    expect(keys(out)).toEqual(["a", "c"]);
  });

  it("입력을 변형하지 않는다 — 호출부가 같은 배열을 다시 쓴다", () => {
    const list = [e("b", { order: 1 }), e("a", { order: 0 })];
    orderedEntries(list);
    expect(keys(list)).toEqual(["b", "a"]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(orderedEntries([])).toEqual([]);
  });
});
