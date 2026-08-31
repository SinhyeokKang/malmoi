import { describe, expect, it } from "vitest";
import { PushPayload, planPush, sourceHash, type ExistingKey } from "../plan";

const existing = (over: Partial<ExistingKey> & Pick<ExistingKey, "key">): ExistingKey => ({
  id: `id-${over.key}`,
  sourceHash: sourceHash("old"),
  orphaned: false,
  ...over,
});

const incoming = (key: string, sourceText: string, extra: Record<string, unknown> = {}) => ({
  key,
  sourceText,
  namespace: key.split(/[._]/)[0] ?? "_root",
  ...extra,
});

describe("sourceHash", () => {
  it("같은 원문 → 같은 해시 (결정적)", () => {
    expect(sourceHash("Hello")).toBe(sourceHash("Hello"));
  });

  it("다른 원문 → 다른 해시", () => {
    expect(sourceHash("Hello")).not.toBe(sourceHash("Hellp"));
  });

  it("한 글자·공백 차이도 잡는다 (stale 판정의 근거다)", () => {
    expect(sourceHash("Hello ")).not.toBe(sourceHash("Hello"));
  });

  it("UTF-8 바이트 기준이다 (한글·이모지)", () => {
    expect(sourceHash("안녕 🎉")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("planPush — 신규 키", () => {
  it("DB에 없는 키는 insert 대상이다", () => {
    const p = planPush([], [incoming("a_one", "One")]);
    expect(p.toInsert.map((k) => k.key)).toEqual(["a_one"]);
    expect(p.toUpdate).toEqual([]);
    expect(p.toOrphan).toEqual([]);
  });

  it("insert 키에 sourceHash·namespace가 채워진다", () => {
    const p = planPush([], [incoming("popup_title", "Start")]);
    expect(p.toInsert[0]).toMatchObject({
      key: "popup_title",
      sourceText: "Start",
      namespace: "popup",
      sourceHash: sourceHash("Start"),
    });
  });

  it("신규 키는 stale이 아니다 — 번역이 애초에 없다", () => {
    const p = planPush([], [incoming("a_one", "One")]);
    expect(p.staleKeyIds).toEqual([]);
  });
});

describe("planPush — 기존 키", () => {
  it("원문이 같으면 update하지만 stale은 아니다", () => {
    const p = planPush(
      [existing({ key: "a_one", sourceHash: sourceHash("One") })],
      [incoming("a_one", "One")],
    );
    expect(p.toUpdate.map((k) => k.key)).toEqual(["a_one"]);
    expect(p.staleKeyIds).toEqual([]);
  });

  it("원문이 바뀌면 그 키가 stale이다 (needsReview 전파 대상)", () => {
    const p = planPush(
      [existing({ key: "a_one", sourceHash: sourceHash("One") })],
      [incoming("a_one", "One changed")],
    );
    expect(p.staleKeyIds).toEqual(["id-a_one"]);
  });

  it("stale 판정은 sourceHash로만 한다 — description·namespace 변경은 무관하다", () => {
    const p = planPush(
      [existing({ key: "a_one", sourceHash: sourceHash("One") })],
      [incoming("a_one", "One", { description: "새 설명" })],
    );
    expect(p.staleKeyIds).toEqual([]);
    expect(p.toUpdate[0]?.description).toBe("새 설명");
  });
});

describe("planPush — orphaned", () => {
  it("페이로드에 없는 기존 키는 orphan 대상이다", () => {
    const p = planPush([existing({ key: "gone" }), existing({ key: "alive" })], [incoming("alive", "A")]);
    expect(p.toOrphan).toEqual(["id-gone"]);
  });

  it("**삭제 목록은 존재하지 않는다** — orphaned로만 표시한다", () => {
    const p = planPush([existing({ key: "gone" })], []);
    expect(p).not.toHaveProperty("toDelete");
    expect(p.toOrphan).toEqual(["id-gone"]);
  });

  it("이미 orphaned인 키는 다시 orphan하지 않는다 (무의미한 UPDATE 방지)", () => {
    const p = planPush([existing({ key: "gone", orphaned: true })], []);
    expect(p.toOrphan).toEqual([]);
  });

  it("돌아온 키는 unorphan 대상이다", () => {
    const p = planPush(
      [existing({ key: "back", orphaned: true, sourceHash: sourceHash("B") })],
      [incoming("back", "B")],
    );
    expect(p.toUnorphan).toEqual(["id-back"]);
    expect(p.toOrphan).toEqual([]);
  });

  it("orphaned가 아닌 채로 다시 온 키는 unorphan 목록에 없다", () => {
    const p = planPush([existing({ key: "k", sourceHash: sourceHash("V") })], [incoming("k", "V")]);
    expect(p.toUnorphan).toEqual([]);
  });
});

describe("planPush — 결정성", () => {
  it("입력 순서를 뒤섞어도 계획이 같다", () => {
    const ex = [existing({ key: "b" }), existing({ key: "a" })];
    const inc = [incoming("a", "A"), incoming("b", "B"), incoming("c", "C")];
    const forward = planPush(ex, inc);
    const reversed = planPush([...ex].reverse(), [...inc].reverse());
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it("모든 목록이 정렬되어 나온다", () => {
    const p = planPush(
      [existing({ key: "z_gone" }), existing({ key: "a_gone" })],
      [incoming("m_new", "M"), incoming("b_new", "B")],
    );
    expect(p.toInsert.map((k) => k.key)).toEqual(["b_new", "m_new"]);
    expect(p.toOrphan).toEqual(["id-a_gone", "id-z_gone"]);
  });
});

describe("planPush — 중복 키", () => {
  it("페이로드에 같은 키가 두 번 오면 뒤가 이긴다 (마지막 승)", () => {
    const p = planPush([], [incoming("k", "First"), incoming("k", "Second")]);
    expect(p.toInsert).toHaveLength(1);
    expect(p.toInsert[0]?.sourceText).toBe("Second");
  });
});

describe("PushPayload 검증 — 외부 진입점이라 조용히 통과시키지 않는다", () => {
  const valid = {
    commitSha: "a".repeat(40),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" },
    locales: ["en", "ko"],
    keys: [{ key: "a.b", sourceText: "V", namespace: "a" }],
    translations: [{ locale: "ko", key: "a.b", value: "값" }],
    refs: [{ key: "a.b", path: "src/a.ts", line: 3 }],
  };

  it("정상 페이로드를 통과시킨다", () => {
    expect(PushPayload.safeParse(valid).success).toBe(true);
  });

  it("commitSha가 40자 hex가 아니면 거부한다", () => {
    for (const sha of ["", "abc", "z".repeat(40), "a".repeat(41)]) {
      expect(PushPayload.safeParse({ ...valid, commitSha: sha }).success).toBe(false);
    }
  });

  it("baseLocale이 locales에 없으면 거부한다", () => {
    const bad = { ...valid, format: { ...valid.format, baseLocale: "fr" } };
    expect(PushPayload.safeParse(bad).success).toBe(false);
  });

  it("어댑터 이름이 등록된 것이 아니면 거부한다", () => {
    const bad = { ...valid, format: { ...valid.format, adapter: "made-up" } };
    expect(PushPayload.safeParse(bad).success).toBe(false);
  });

  it("pathTemplate이 글롭이어도 통과시킨다 — multi-locale 어댑터는 {locale}을 쓰지 않는다", () => {
    const glob = { ...valid, format: { ...valid.format, adapter: "ts-dict", pathTemplate: "src/i18n/namespaces/*.ts" } };
    expect(PushPayload.safeParse(glob).success).toBe(true);
  });

  it("키가 0개면 거부한다 — 실수로 전부 orphan시키는 것을 막는다", () => {
    expect(PushPayload.safeParse({ ...valid, keys: [] }).success).toBe(false);
  });

  it("translations의 locale이 locales에 없으면 거부한다", () => {
    const bad = { ...valid, translations: [{ locale: "ja", key: "a.b", value: "v" }] };
    expect(PushPayload.safeParse(bad).success).toBe(false);
  });

  it("line이 양의 정수가 아니면 거부한다", () => {
    for (const line of [0, -1, 1.5]) {
      expect(PushPayload.safeParse({ ...valid, refs: [{ key: "a.b", path: "p", line }] }).success).toBe(false);
    }
  });
});
