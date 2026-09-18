import { describe, expect, it } from "vitest";

import {
  filterByState,
  filterRows,
  groupByNamespace,
  namespaceCountsFor,
  parseLocaleSelection,
  pendingFirst,
  type KeyRow,
} from "../view";

/**
 * 로케일이 **행**이 된 뒤의 순수 판정 (8-4 T1 — DESIGN §6.1).
 *
 * 옛 축(로케일이 열)에서는 "기준 로케일 하나"가 집계·필터·착지를 정했다. 행이 되면 그 개념에
 * 대응물이 없으므로 **선택된 로케일 집합**이 그 자리를 대신하고, 아래 다섯이 그 집합 위에 선다.
 */

const EPOCH = new Date("2026-09-01T00:00:00Z");

const row = (over: Partial<KeyRow> & Pick<KeyRow, "key">): KeyRow => ({
  id: `id-${over.key}`,
  namespace: over.key.split(/[._]/)[0] ?? "_root",
  orphaned: false,
  createdAt: EPOCH,
  cells: {},
  refs: [],
  ...over,
});

const cell = (over: Partial<NonNullable<KeyRow["cells"][string]>> = {}) => ({
  value: null, needsReview: false, updatedBy: null, updatedAt: EPOCH, surfaceArchivedAt: null, pending: false, ...over,
});

const locale = (code: string, orphaned = false) => ({ code, orphaned });

describe("parseLocaleSelection — `?locales=`의 해석", () => {
  const LOCALES = [locale("en"), locale("ko"), locale("ja")];

  it("미지정이면 전체다 — 폴백이 빈 배열이면 화면이 통째로 빈다", () => {
    expect(parseLocaleSelection(undefined, LOCALES)).toEqual(["en", "ko", "ja"]);
  });

  it("빈 문자열도 전체다 — 필터를 비운 것은 필터가 없는 것이다", () => {
    expect(parseLocaleSelection("", LOCALES)).toEqual(["en", "ko", "ja"]);
    expect(parseLocaleSelection("  ,  ", LOCALES)).toEqual(["en", "ko", "ja"]);
  });

  /**
   * ⚠️ orphaned 로케일이 폴백에 섞이면 그 로케일의 빈 셀이 전부 `untranslated`로 잡혀
   * `defaultNamespace`가 **행이 전부 disabled인 네임스페이스**에 착지한다.
   */
  it("폴백에서 orphaned 로케일을 뺀다", () => {
    expect(parseLocaleSelection(undefined, [locale("en"), locale("fr", true)])).toEqual(["en"]);
  });

  it("명시 선택은 orphaned를 허용한다 — 사라진 로케일의 값을 볼 길이 있어야 한다", () => {
    expect(parseLocaleSelection("fr", [locale("en"), locale("fr", true)])).toEqual(["fr"]);
  });

  it("전부 orphaned면 그래도 전체를 낸다 — 빈 화면보다 낫다", () => {
    expect(parseLocaleSelection(undefined, [locale("en", true), locale("fr", true)])).toEqual(["en", "fr"]);
  });

  it("순서는 URL이 아니라 인자 순서다 — 같은 선택이 두 링크에서 다르게 보이지 않는다", () => {
    expect(parseLocaleSelection("ja,en", LOCALES)).toEqual(["en", "ja"]);
  });

  it("중복은 접는다", () => {
    expect(parseLocaleSelection("ko,ko,ko", LOCALES)).toEqual(["ko"]);
  });

  it("모르는 코드는 버린다 — 404가 아니다", () => {
    expect(parseLocaleSelection("ko,zz", LOCALES)).toEqual(["ko"]);
  });

  it("전부 걸러지면 폴백이다 — 선택 0개로 두지 않는다", () => {
    expect(parseLocaleSelection("zz,yy", LOCALES)).toEqual(["en", "ko", "ja"]);
  });

  /**
   * ⚠️ 주소창 값이라 객체 조회가 아니라 배열 `includes`다 — 조회 쪽의 프로토타입 차단이고,
   * 대입 쪽의 짝은 `lib/search-params.ts`의 `Object.create(null)`이다 (CLAUDE.md 코드 컨벤션).
   */
  it("`__proto__`가 갈래로 새지 않는다", () => {
    expect(parseLocaleSelection("__proto__", LOCALES)).toEqual(["en", "ko", "ja"]);
    expect(parseLocaleSelection("constructor", LOCALES)).toEqual(["en", "ko", "ja"]);
  });

  it("로케일 목록에 있으면 이상한 이름도 통과한다 — 진실은 리포다", () => {
    expect(parseLocaleSelection("__proto__", [locale("__proto__"), locale("en")])).toEqual(["__proto__"]);
  });
});

describe("namespaceCountsFor — 선택된 로케일 기준 집계", () => {
  /** ⚠️ 키 단위로 한 번만 센다 — 로케일마다 세면 `pending`이 `total`을 넘는다. */
  it("pending 합계가 total을 넘지 않는다", () => {
    const rows = [
      row({ key: "a.one", cells: { ko: cell(), ja: cell() } }),
      row({ key: "a.two", cells: { ko: cell({ value: "값", needsReview: true }), ja: cell() } }),
    ];
    const [counts] = namespaceCountsFor(rows, ["ko", "ja"]);
    expect(counts).toEqual({ namespace: "a", total: 2, untranslated: 2, needsReview: 0, orphaned: 0 });
    expect(counts!.untranslated + counts!.needsReview).toBeLessThanOrEqual(counts!.total);
  });

  it("로케일 둘 중 하나만 미번역이면 그 키가 미번역이다", () => {
    const rows = [row({ key: "a.one", cells: { ko: cell({ value: "값" }) } })];
    expect(namespaceCountsFor(rows, ["ko"])[0]).toMatchObject({ untranslated: 0, needsReview: 0 });
    expect(namespaceCountsFor(rows, ["ko", "ja"])[0]).toMatchObject({ untranslated: 1 });
  });

  it("전부 채워졌고 하나가 검토 대기면 needsReview다", () => {
    const rows = [row({ key: "a.one", cells: { ko: cell({ value: "값" }), ja: cell({ value: "値", needsReview: true }) } })];
    expect(namespaceCountsFor(rows, ["ko", "ja"])[0]).toMatchObject({ untranslated: 0, needsReview: 1 });
  });

  it("orphaned 키가 전부를 이긴다 — 번역 상태를 논할 의미가 없다", () => {
    const rows = [row({ key: "a.gone", orphaned: true, cells: { ko: cell() } })];
    expect(namespaceCountsFor(rows, ["ko"])[0]).toMatchObject({ orphaned: 1, untranslated: 0 });
  });

  it("네임스페이스가 `compareKeys` 순서로 나온다", () => {
    const rows = [row({ key: "z.a" }), row({ key: "a.b" }), row({ key: "m.c" })];
    expect(namespaceCountsFor(rows, ["ko"]).map((c) => c.namespace)).toEqual(["a", "m", "z"]);
  });

  /** ⚠️ 누산기가 `Map`이다 — 네임스페이스 이름이 리포의 키다(남이 정한 값). */
  it("`__proto__` 네임스페이스가 조용히 사라지지 않는다", () => {
    // ⚠️ 픽스처가 `_`로도 가르므로 네임스페이스를 명시한다 — 재는 것은 누산기이지 `namespaceOf`가 아니다.
    const rows = [row({ key: "__proto__.a", namespace: "__proto__" }), row({ key: "b.c" })];
    expect(namespaceCountsFor(rows, ["ko"]).map((c) => c.namespace)).toContain("__proto__");
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(namespaceCountsFor([], ["ko"])).toEqual([]);
  });
});

describe("filterRows — 검색의 대상이 선택된 로케일이다", () => {
  const rows = [
    row({ key: "auth.login", cells: { ko: cell({ value: "로그인" }), fr: cell({ value: "connexion" }) } }),
    row({ key: "common.ok", cells: { ko: cell({ value: "확인" }) } }),
  ];

  it("키에 맞으면 걸린다", () => {
    expect(filterRows(rows, { locales: ["ko"], q: "auth" }).map((r) => r.key)).toEqual(["auth.login"]);
  });

  it("선택된 로케일의 값에 맞으면 걸린다", () => {
    expect(filterRows(rows, { locales: ["ko"], q: "로그인" }).map((r) => r.key)).toEqual(["auth.login"]);
  });

  /**
   * ⚠️ 옛 축에서는 전 로케일이 열로 보여서 어디가 맞았는지 눈에 띄었다. 행이 되고 로케일을
   * 고르면 **안 보이는 값에 맞은 키**가 이유 없이 나타난다.
   */
  it("선택 밖 로케일의 값에 맞아도 안 걸린다", () => {
    expect(filterRows(rows, { locales: ["ko"], q: "connexion" })).toEqual([]);
    expect(filterRows(rows, { locales: ["ko", "fr"], q: "connexion" }).map((r) => r.key)).toEqual(["auth.login"]);
  });

  it("대소문자를 무시한다", () => {
    expect(filterRows(rows, { locales: ["ko"], q: "AUTH" })).toHaveLength(1);
  });

  it("검색어가 없으면 전부 통과한다 — 공백만도 같다", () => {
    expect(filterRows(rows, { locales: ["ko"] })).toHaveLength(2);
    expect(filterRows(rows, { locales: ["ko"], q: "   " })).toHaveLength(2);
  });
});

describe("pendingFirst — 상태 필터를 뺀 대가를 갚는다 (spec Q3)", () => {
  it("남은 일이 있는 키가 위로 온다", () => {
    const rows = [
      row({ key: "a.done", cells: { ko: cell({ value: "값" }) } }),
      row({ key: "b.empty" }),
      row({ key: "c.review", cells: { ko: cell({ value: "값", needsReview: true }) } }),
    ];
    expect(pendingFirst(rows, ["ko"]).map((r) => r.key)).toEqual(["b.empty", "c.review", "a.done"]);
  });

  /** ⚠️ 안정 정렬이다 — 같은 통 안에서는 `compareKeys` 순서(입력 순서)를 보존한다. */
  it("같은 통 안의 순서를 보존한다 — 정렬을 두 벌로 만들지 않는다", () => {
    const rows = [
      row({ key: "a.z" }),
      row({ key: "a.a" }),
      row({ key: "b.done", cells: { ko: cell({ value: "값" }) } }),
      row({ key: "b.also", cells: { ko: cell({ value: "값" }) } }),
    ];
    expect(pendingFirst(rows, ["ko"]).map((r) => r.key)).toEqual(["a.z", "a.a", "b.done", "b.also"]);
  });

  it("orphaned 키는 위로 올리지 않는다 — 편집할 수 없으므로 거짓이다", () => {
    const rows = [
      row({ key: "a.live", cells: { ko: cell({ value: "값" }) } }),
      row({ key: "b.gone", orphaned: true }),
    ];
    expect(pendingFirst(rows, ["ko"]).map((r) => r.key)).toEqual(["a.live", "b.gone"]);
  });

  it("선택된 로케일 중 하나라도 비어 있으면 pending이다", () => {
    const rows = [
      row({ key: "a.full", cells: { ko: cell({ value: "값" }), ja: cell({ value: "値" }) } }),
      row({ key: "b.half", cells: { ko: cell({ value: "값" }) } }),
    ];
    expect(pendingFirst(rows, ["ko"]).map((r) => r.key)).toEqual(["a.full", "b.half"]);
    expect(pendingFirst(rows, ["ko", "ja"]).map((r) => r.key)).toEqual(["b.half", "a.full"]);
  });
});

describe("groupByNamespace — `?ns=*`의 섹션", () => {
  /**
   * ⚠️ **순서를 `counts`에서 받는다.** `rows`만 보면 출처가 Postgres collation이고
   * `namespaceCountsFor`가 쓰는 것은 UTF-16 코드 유닛 비교라, 섹션 헤딩 순서와 드롭다운 순서가
   * 갈릴 수 있다 — 이 배송이 막으려던 바로 그 결과다.
   */
  it("섹션 순서가 드롭다운 순서와 같다", () => {
    const rows = [row({ key: "z.a" }), row({ key: "a.b" }), row({ key: "m.c" })];
    const counts = namespaceCountsFor(rows, ["ko"]);
    expect(groupByNamespace(rows, counts).map((g) => g.namespace)).toEqual(counts.map((c) => c.namespace));
  });

  it("행을 그 네임스페이스 밑에 모은다", () => {
    const rows = [row({ key: "a.one" }), row({ key: "b.x" }), row({ key: "a.two" })];
    const groups = groupByNamespace(rows, namespaceCountsFor(rows, ["ko"]));
    expect(groups.map((g) => g.rows.map((r) => r.key))).toEqual([["a.one", "a.two"], ["b.x"]]);
  });

  it("행이 없는 네임스페이스는 섹션이 되지 않는다 — 필터가 통째로 비운 경우다", () => {
    const all = [row({ key: "a.one" }), row({ key: "b.x" })];
    const counts = namespaceCountsFor(all, ["ko"]);
    expect(groupByNamespace([all[0]!], counts).map((g) => g.namespace)).toEqual(["a"]);
  });

  it("빈 배열은 빈 배열이다", () => {
    expect(groupByNamespace([], [])).toEqual([]);
  });

  /** ⚠️ 평범한 `{}`에 `out["__proto__"] = v`를 하면 그 그룹이 조용히 사라진다. */
  it("`__proto__` 네임스페이스의 행이 사라지지 않는다", () => {
    const rows = [row({ key: "__proto__.a", namespace: "__proto__" })];
    const groups = groupByNamespace(rows, namespaceCountsFor(rows, ["ko"]));
    expect(groups).toEqual([{ namespace: "__proto__", rows }]);
  });
});

/**
 * 파이프라인 구간으로 좁힌다 (DESIGN §6.64) — Home의 카운트 카드 넷이 여기로 착지한다.
 *
 * ⚠️ **카드의 수와 정확히 같지 않을 수 있다.** 합계는 프로젝트 전체이고 이 좁힘은 한 표면이다 —
 * 그 사실은 카드의 보조 줄이 미리 말한다. 여기서 재는 것은 **구간의 정의가 카드의 술어와 같은가**다.
 */
describe("filterByState — 카드 넷이 가리키는 구간", () => {
  const PULLED = new Date("2026-09-10T00:00:00Z");
  const before = new Date("2026-09-09T00:00:00Z");
  const after = new Date("2026-09-11T00:00:00Z");

  const rows = [
    // 마지막 pull 뒤에 들어온 키 — 값도 없다(New와 To translate에 둘 다 센다).
    row({ key: "a.fresh", createdAt: after, cells: { ko: cell() } }),
    // 검토 대기.
    row({ key: "b.review", cells: { ko: cell({ value: "값", needsReview: true }) } }),
    // 사람이 저장했고 아직 안 보냈다.
    row({ key: "c.unsent", cells: { ko: cell({ value: "값", updatedBy: "u1", updatedAt: after, pending: true }) } }),
    // 보낸 뒤로 안 만졌다 — 저자는 남고 토큰은 전달 확인으로 비었다.
    row({ key: "d.sent", cells: { ko: cell({ value: "값", updatedBy: "u1", updatedAt: after, pending: false }) } }),
    // 코드에서 사라진 키 — 어느 구간도 아니다.
    row({ key: "e.gone", orphaned: true, cells: { ko: cell() } }),
  ];
  const ctx = { locales: ["ko"], lastPulledAt: PULLED };
  const keys = (state: Parameters<typeof filterByState>[1]["state"]) =>
    filterByState(rows, { ...ctx, state }).map((r) => r.key);

  it("`new`는 마지막 pull 뒤에 들어온 키다 — 단위가 키라서 로케일을 안 본다", () => {
    expect(keys("new")).toEqual(["a.fresh"]);
  });

  it("`untranslated`는 보이는 로케일에 빈 칸이 있는 키다", () => {
    expect(keys("untranslated")).toEqual(["a.fresh"]);
  });

  it("`review`는 검토 대기 칸이 있는 키다", () => {
    expect(keys("review")).toEqual(["b.review"]);
  });

  /** ⚠️ **`isUnpublished`와 같은 술어다** — 넷째 벌을 만들면 카드와 표가 다른 행을 센다. */
  it("`unsent`는 아직 전달 확인되지 않은 편집 칸이 있는 키다 — 시각이 아니라 토큰 투영이다", () => {
    expect(keys("unsent")).toEqual(["c.unsent"]);
  });

  it("orphaned 키는 어느 구간에도 없다 — 편집할 수 없으므로 일이 아니다", () => {
    for (const state of ["new", "untranslated", "review", "unsent"] as const) {
      expect(keys(state), state).not.toContain("e.gone");
    }
  });

  it("보고 있지 않은 로케일의 상태는 세지 않는다", () => {
    const only = [row({ key: "f.ja", cells: { ja: cell({ value: "値", needsReview: true }) } })];
    expect(filterByState(only, { ...ctx, state: "review" })).toEqual([]);
    expect(filterByState(only, { locales: ["ja"], lastPulledAt: PULLED, state: "review" }).map((r) => r.key)).toEqual(["f.ja"]);
  });

  it("첫 pull 전에는 살아 있는 키 전체가 신규다 — 승인된 정의다", () => {
    expect(filterByState(rows, { ...ctx, lastPulledAt: null, state: "new" }).map((r) => r.key))
      .toEqual(["a.fresh", "b.review", "c.unsent", "d.sent"]);
  });

  it("원본을 건드리지 않는다 — 호출부가 같은 배열로 총계도 센다", () => {
    const snapshot = [...rows];
    filterByState(rows, { ...ctx, state: "review" });
    expect(rows).toEqual(snapshot);
  });
});
