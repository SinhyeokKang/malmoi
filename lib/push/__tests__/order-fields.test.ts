import { describe, expect, it } from "vitest";
import { PushPayload, planPush, sourceHash, type ExistingKey } from "../plan";

/**
 * push가 **키 순서와 chrome 필드를 DB로 나른다**
 * (ARCHITECTURE §1.1).
 *
 * ⚠️ **`order`가 없으면 `sortIndex`를 null로 남긴다 — 배열 인덱스로 채우지 않는다.**
 * `read`가 이미 코드 유닛 순으로 정렬해 돌려주므로(`json-catalog.ts`) 구 CI가 보내는 배열
 * 인덱스는 곧 **코드 유닛 순위**다. 그걸 박으면 "순서를 모른다"가 "코드 유닛이 원본 순서다"로
 * DB에 굳고, 바이트 결과가 같아서 조용하다. null은 모른다는 뜻이고 나중에 진짜 order가 오면
 * 복구된다.
 */

const base = {
  projectSlug: "acme",
  commitSha: "a".repeat(40),
  commitAt: "2026-09-03T00:00:00+09:00",
  format: { adapter: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", nested: false, baseLocale: "en" },
  locales: ["en", "ko"],
  refs: [],
};

describe("PushPayload — order와 chrome 필드를 받는다", () => {
  it("keys[].order를 받는다", () => {
    const r = PushPayload.safeParse({
      ...base,
      keys: [{ key: "A", sourceText: "a", namespace: "A", order: 0 }],
      translations: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.keys[0]?.order).toBe(0);
  });

  it("order가 없어도 통과한다 — 구 CI의 페이로드를 거부하지 않는다", () => {
    const r = PushPayload.safeParse({
      ...base,
      keys: [{ key: "A", sourceText: "a", namespace: "A" }],
      translations: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.keys[0]?.order).toBeUndefined();
  });

  it("음수 order를 거부한다 — 파일 위치라 음수가 나올 경로가 없다", () => {
    const r = PushPayload.safeParse({
      ...base,
      keys: [{ key: "A", sourceText: "a", namespace: "A", order: -1 }],
      translations: [],
    });
    expect(r.success).toBe(false);
  });

  it("translations[]가 로케일별 description과 placeholders를 받는다", () => {
    const r = PushPayload.safeParse({
      ...base,
      keys: [{ key: "A", sourceText: "a", namespace: "A", order: 0 }],
      translations: [
        { locale: "ko", key: "A", value: "에이", description: "설명", placeholders: { u: { content: "$1" } } },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.translations[0]?.description).toBe("설명");
      expect(r.data.translations[0]?.placeholders).toEqual({ u: { content: "$1" } });
    }
  });

  it("placeholders는 모양을 검사하지 않는다 — 잃지 않는 것만이 요구다", () => {
    const r = PushPayload.safeParse({
      ...base,
      keys: [{ key: "A", sourceText: "a", namespace: "A" }],
      translations: [{ locale: "ko", key: "A", value: "에이", placeholders: "nope" }],
    });
    expect(r.success).toBe(true);
  });

  it("둘 다 없어도 통과한다", () => {
    const r = PushPayload.safeParse({
      ...base,
      keys: [{ key: "A", sourceText: "a", namespace: "A" }],
      translations: [{ locale: "ko", key: "A", value: "에이" }],
    });
    expect(r.success).toBe(true);
  });
});

describe("planPush — order를 sortIndex로 싣는다", () => {
  const existing: readonly ExistingKey[] = [];

  it("신규 키에 sortIndex가 실린다", () => {
    const plan = planPush(
      existing,
      [
        { key: "b", sourceText: "B", namespace: "n", order: 0 },
        { key: "a", sourceText: "A", namespace: "n", order: 1 },
      ],
      { baseChanged: false },
    );
    expect(plan.toInsert.map((k) => [k.key, k.sortIndex])).toEqual([
      ["a", 1],
      ["b", 0],
    ]);
  });

  it("기존 키도 매 push마다 sortIndex가 갱신된다 — drift가 생기지 않는 근거다", () => {
    const plan = planPush(
      [{ id: "id-a", key: "a", sourceHash: "h", orphaned: false }],
      [{ key: "a", sourceText: "A", namespace: "n", order: 7 }],
      { baseChanged: false },
    );
    expect(plan.toUpdate[0]?.sortIndex).toBe(7);
  });

  it("order가 없으면 sortIndex가 undefined로 남는다 — 배열 인덱스로 채우지 않는다", () => {
    const plan = planPush(
      existing,
      [
        { key: "b", sourceText: "B", namespace: "n" },
        { key: "a", sourceText: "A", namespace: "n" },
      ],
      { baseChanged: false },
    );
    expect(plan.toInsert.every((k) => k.sortIndex === undefined)).toBe(true);
  });

  it("order 0을 빠뜨리지 않는다 — falsy라 조건문으로 거르면 사라진다", () => {
    const plan = planPush(existing, [{ key: "a", sourceText: "A", namespace: "n", order: 0 }], { baseChanged: false });
    expect(plan.toInsert[0]?.sortIndex).toBe(0);
  });

  it("order 변경만으로는 needsReview를 세우지 않는다 — 원문 해시만이 그 축이다", () => {
    const plan = planPush(
      [{ id: "id-a", key: "a", sourceHash: sourceHash("A"), orphaned: false }],
      [{ key: "a", sourceText: "A", namespace: "n", order: 3 }],
      { baseChanged: false },
    );
    // 원문이 같으면 stale이 아니다. (해시가 다르면 stale인 것은 기존 테스트가 덮는다.)
    expect(plan.staleKeyIds).not.toContain("id-a");
  });
});
