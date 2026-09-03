import { describe, expect, it } from "vitest";
import { buildWriteEntries, type PullRow } from "../plan";
import { rowsForLocale, type RenderKey } from "../render";

/**
 * **`sortIndex`가 `LocaleEntry.order`까지 도달하는 배선**
 * (`docs/features/key-order-preservation/` 태스크 4-2).
 *
 * ⚠️ **경로가 넷이고 하나만 빠져도 조용히 죽는다.** `orderedEntries`가 `order === undefined`를
 * 보고 코드 유닛 폴백으로 떨어지므로 **어댑터 테스트는 전부 green이고 기능만 멎는다** —
 * POSTMORTEM 2026-09-02 "순위 픽스가 자기 단위 테스트만 통과하고 실제 경로에서 죽어 있었다"의
 * 정확한 재발 형태다. 이 파일이 그 중간 두 홉(`rowsForLocale`·`buildWriteEntries`)을 덮고,
 * 진입점 전체는 태스크 5의 L1이 덮는다.
 */

const key = (over: Partial<RenderKey> & Pick<RenderKey, "key">): RenderKey => ({
  sourceText: `src:${over.key}`,
  orphaned: false,
  cells: {},
  ...over,
});

describe("rowsForLocale — sortIndex와 로케일별 chrome 필드를 나른다", () => {
  it("sortIndex를 그대로 전달한다", () => {
    const rows = rowsForLocale([key({ key: "b", sortIndex: 0 }), key({ key: "a", sortIndex: 1 })], "ko");
    expect(rows.map((r) => [r.key, r.sortIndex])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("sortIndex 0을 빠뜨리지 않는다", () => {
    expect(rowsForLocale([key({ key: "a", sortIndex: 0 })], "ko")[0]?.sortIndex).toBe(0);
  });

  it("sortIndex가 없으면 undefined다 — 폴백은 어댑터가 한다", () => {
    expect(rowsForLocale([key({ key: "a" })], "ko")[0]?.sortIndex).toBeUndefined();
  });

  it("**그 로케일 셀의** description을 싣는다 — 키 단위 값이 아니다", () => {
    const rows = rowsForLocale(
      [key({ key: "a", description: "키 설명", cells: { ko: { value: "값", description: "ko 설명" } } })],
      "ko",
    );
    expect(rows[0]?.description).toBe("ko 설명");
  });

  it("비-base는 셀에 없으면 키 단위 값으로 폴백하지 않는다 — 원본에 없던 값을 만들게 된다", () => {
    const rows = rowsForLocale([key({ key: "a", description: "키 설명", cells: { ko: { value: "값" } } })], "ko");
    expect(rows[0]?.description).toBeUndefined();
  });

  it("base는 셀에 없으면 키 단위 description으로 폴백한다", () => {
    // 마이그레이션 직후 Translation.description이 전부 null이다. 폴백이 없으면 **첫 pull에서
    // base 파일이 description을 잃는다** — `value ?? sourceText`와 같은 축의 폴백이고, 그 값은
    // 애초에 base 파일에서 온 것이라 원본 복원이다.
    const rows = rowsForLocale([key({ key: "a", description: "키 설명", cells: { en: { value: "v" } } })], "en", {
      isBase: true,
    });
    expect(rows[0]?.description).toBe("키 설명");
  });

  it("base라도 셀에 값이 있으면 그쪽이 이긴다", () => {
    const rows = rowsForLocale(
      [key({ key: "a", description: "키 설명", cells: { en: { value: "v", description: "파일 설명" } } })],
      "en",
      { isBase: true },
    );
    expect(rows[0]?.description).toBe("파일 설명");
  });

  it("placeholders를 그 로케일 셀에서 싣는다", () => {
    const ph = { u: { content: "$1" } };
    const rows = rowsForLocale([key({ key: "a", cells: { ko: { value: "값", placeholders: ph } } })], "ko");
    expect(rows[0]?.placeholders).toEqual(ph);
  });

  it("placeholders는 base 폴백이 없다 — StringKey에 담을 곳이 없다", () => {
    const rows = rowsForLocale([key({ key: "a", cells: { en: { value: "v" } } })], "en", { isBase: true });
    expect(rows[0]?.placeholders).toBeUndefined();
  });
});

describe("buildWriteEntries — PullRow를 LocaleEntry로 접는 유일한 관문", () => {
  const row = (over: Partial<PullRow> & Pick<PullRow, "key">): PullRow => ({
    sourceText: `src:${over.key}`,
    orphaned: false,
    value: `v:${over.key}`,
    ...over,
  });

  it("sortIndex를 order로 싣는다 — 이 홉이 빠지면 기능 전체가 조용히 죽는다", () => {
    const entries = buildWriteEntries([row({ key: "b", sortIndex: 0 }), row({ key: "a", sortIndex: 1 })], {
      isBase: false,
    });
    expect(entries.map((e) => [e.key, e.order])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("order 0을 빠뜨리지 않는다", () => {
    expect(buildWriteEntries([row({ key: "a", sortIndex: 0 })], { isBase: false })[0]?.order).toBe(0);
  });

  it("sortIndex가 없으면 order 필드를 만들지 않는다", () => {
    expect(buildWriteEntries([row({ key: "a" })], { isBase: false })[0]).not.toHaveProperty("order");
  });

  it("description과 placeholders를 싣는다", () => {
    const ph = { u: { content: "$1" } };
    const e = buildWriteEntries([row({ key: "a", description: "설명", placeholders: ph })], { isBase: false })[0];
    expect(e?.description).toBe("설명");
    expect(e?.placeholders).toEqual(ph);
  });

  it("placeholders가 없으면 필드를 만들지 않는다 — 빈 값을 넣으면 write가 없던 블록을 만든다", () => {
    expect(buildWriteEntries([row({ key: "a" })], { isBase: false })[0]).not.toHaveProperty("placeholders");
  });

  it("orphaned·빈 값 필터는 그대로다 — 순서를 나른다고 기존 관문이 느슨해지지 않는다", () => {
    const entries = buildWriteEntries(
      [
        row({ key: "gone", orphaned: true, sortIndex: 0 }),
        row({ key: "empty", value: "", sortIndex: 1 }),
        row({ key: "ok", sortIndex: 2 }),
      ],
      { isBase: false },
    );
    expect(entries.map((e) => e.key)).toEqual(["ok"]);
  });
});
