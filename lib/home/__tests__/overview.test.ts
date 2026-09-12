import { describe, expect, it } from "vitest";

import { activeLocaleProgress, recentActivity } from "../overview";

/**
 * Home(`/projects/:slug`)의 순수 판정 둘 (6b-6).
 *
 * ⚠️ **이 화면의 가장 큰 위험은 복제다** (PRODUCT §7.7 결정 2). 번역 화면 툴바가 키 수·미배포 건수·
 * 마지막 전송·PR 링크를 들고 설정 화면이 리포·연결·적재 상태를 든다 — 세 번째 사본을 만들면
 * 그중 하나가 낡는다. 그래서 진행률은 **6b-5의 `localeProgress`를 그대로 재사용**하고, 여기서
 * 새로 계산하는 것은 "어느 로케일이 일거리인가"와 "세 출처를 어떻게 한 줄로 세우나"뿐이다.
 *
 * ⚠️ **착지 클릭 하나를 갚아야 한다** (결정 1이 받아들인 대가). 번역자의 일은 `translations`
 * 하나이므로 개요만 있고 링크가 없으면 그 클릭이 순손실이다 — 그 배선은 `home-screen.test.ts`가 센다.
 */

const at = (iso: string): Date => new Date(iso);

describe("activeLocaleProgress — 일거리인 로케일만 (6b-6)", () => {
  const locales = [
    { code: "en", isBase: true, orphaned: false },
    { code: "ko", isBase: false, orphaned: false },
    { code: "fr", isBase: false, orphaned: true },
  ];

  /**
   * ⚠️ **orphaned 로케일은 일이 아니다.** 그 파일은 리포에서 사라졌고 번역 화면에서 그 열의 입력이
   * `disabled`다 (ARCHITECTURE §5.5.16) — Home의 행은 `?focus=` 링크이므로, 넣으면 번역자를
   * **편집할 수 없는 열**로 보낸다. 로케일 화면은 반대로 그것을 **보여주는 것**이 요지다(6b-5).
   */
  it("orphaned 로케일을 뺀다 — 그 열은 편집이 막혀 있다", () => {
    expect(activeLocaleProgress({ locales, total: 2, cells: [] }).map((l) => l.code)).toEqual(["en", "ko"]);
  });

  it("나머지는 `localeProgress`와 같은 값이다 — 여기서 다시 세지 않는다", () => {
    const rows = activeLocaleProgress({
      locales,
      total: 4,
      cells: [
        { localeCode: "ko", needsReview: false },
        { localeCode: "ko", needsReview: true },
        // orphaned 로케일의 셀은 행이 빠지므로 어디에도 안 실린다.
        { localeCode: "fr", needsReview: false },
      ],
    });
    expect(rows.find((l) => l.code === "ko")).toEqual({
      code: "ko",
      isBase: false,
      orphaned: false,
      total: 4,
      translated: 1,
      needsReview: 1,
      untranslated: 2,
      percent: 25,
    });
  });

  it("base가 먼저다 — 나머지가 그것의 번역이다", () => {
    expect(
      activeLocaleProgress({
        locales: [
          { code: "ko", isBase: false, orphaned: false },
          { code: "en", isBase: true, orphaned: false },
        ],
        total: 1,
        cells: [],
      }).map((l) => l.code),
    ).toEqual(["en", "ko"]);
  });

  /** base 파일에도 빈 값이 있을 수 있다 (POSTMORTEM 2026-09-09) — 100%로 보이면 화면이 거짓말이다. */
  it("base도 100%가 아닐 수 있다", () => {
    const [base] = activeLocaleProgress({
      locales: [{ code: "en", isBase: true, orphaned: false }],
      total: 4,
      cells: [{ localeCode: "en", needsReview: false }],
    });
    expect(base).toMatchObject({ percent: 25, untranslated: 3 });
  });

  it("빈 프로젝트는 percent 0이고 행은 남는다 — 0으로 나누지 않는다", () => {
    expect(activeLocaleProgress({ locales, total: 0, cells: [] })).toEqual([
      { code: "en", isBase: true, orphaned: false, total: 0, translated: 0, needsReview: 0, untranslated: 0, percent: 0 },
      { code: "ko", isBase: false, orphaned: false, total: 0, translated: 0, needsReview: 0, untranslated: 0, percent: 0 },
    ]);
  });

  it("살아 있는 로케일이 없으면 빈 배열이다", () => {
    expect(
      activeLocaleProgress({ locales: [{ code: "fr", isBase: true, orphaned: true }], total: 3, cells: [] }),
    ).toEqual([]);
  });
});

/**
 * **최근 활동 — 지금 재료로만** (PRODUCT §7.7 결정 3). `logs` 화면은 7단계 `SyncRun`의 소비자이고
 * (§6), 그 테이블이 서기 전에 낼 수 있는 것은 셋뿐이다: 사람의 편집 · CI push · 마지막 Publish.
 * **그것은 "변경 이력"이 아니라 그 부분집합**이고, `SyncRun`이 서면 이 블록이 그 테이블로 갈아탄다.
 */
describe("recentActivity — 세 출처를 한 줄로 (6b-6)", () => {
  const edits = [
    { at: at("2026-09-09T10:00:00Z"), key: "a.greet", namespace: "a", locale: "ko", actor: "Kim" },
    { at: at("2026-09-09T08:00:00Z"), key: "a.bye", namespace: "a", locale: "ja", actor: null },
  ];

  it("시각 내림차순으로 병합한다", () => {
    expect(
      recentActivity({
        edits,
        lastCommitAt: at("2026-09-09T09:00:00Z"),
        lastPublishedAt: at("2026-09-09T07:00:00Z"),
        lastPrUrl: "https://github.com/o/r/pull/1",
        limit: 10,
      }).map((i) => [i.kind, i.at.toISOString()]),
    ).toEqual([
      ["edit", "2026-09-09T10:00:00.000Z"],
      ["push", "2026-09-09T09:00:00.000Z"],
      ["edit", "2026-09-09T08:00:00.000Z"],
      ["publish", "2026-09-09T07:00:00.000Z"],
    ]);
  });

  it("편집 항목이 어느 키·어느 로케일인지 든다 — 그것이 `?ns=`·`?focus=` 링크의 재료다", () => {
    const [first] = recentActivity({ edits, lastCommitAt: null, lastPublishedAt: null, lastPrUrl: null, limit: 10 });
    expect(first).toEqual({
      kind: "edit",
      at: at("2026-09-09T10:00:00Z"),
      key: "a.greet",
      namespace: "a",
      locale: "ko",
      actor: "Kim",
    });
  });

  /** 이름을 못 찾은 편집자는 `actorLabel`이 원문을 내거나 `null`이다 — 여기서 지어내지 않는다. */
  it("편집자가 없어도 항목은 남는다", () => {
    const items = recentActivity({ edits, lastCommitAt: null, lastPublishedAt: null, lastPrUrl: null, limit: 10 });
    expect(items[1]).toMatchObject({ kind: "edit", actor: null });
  });

  it("PR 링크는 publish 항목이 든다 — 없을 수도 있다", () => {
    const withPr = recentActivity({
      edits: [],
      lastCommitAt: null,
      lastPublishedAt: at("2026-09-09T07:00:00Z"),
      lastPrUrl: "https://github.com/o/r/pull/1",
      limit: 10,
    });
    expect(withPr).toEqual([
      { kind: "publish", at: at("2026-09-09T07:00:00Z"), prUrl: "https://github.com/o/r/pull/1" },
    ]);

    const withoutPr = recentActivity({
      edits: [],
      lastCommitAt: null,
      lastPublishedAt: at("2026-09-09T07:00:00Z"),
      lastPrUrl: null,
      limit: 10,
    });
    expect(withoutPr).toEqual([{ kind: "publish", at: at("2026-09-09T07:00:00Z"), prUrl: null }]);
  });

  /** ⚠️ `lastPrUrl`만 있고 시각이 없는 것은 사건이 아니다 — `skipped`는 그 둘을 안 건드린다 (design §3.4). */
  it("시각이 없는 출처는 항목을 만들지 않는다", () => {
    expect(
      recentActivity({
        edits: [],
        lastCommitAt: null,
        lastPublishedAt: null,
        lastPrUrl: "https://github.com/o/r/pull/1",
        limit: 10,
      }),
    ).toEqual([]);
  });

  it("빈 프로젝트는 빈 배열이다", () => {
    expect(
      recentActivity({ edits: [], lastCommitAt: null, lastPublishedAt: null, lastPrUrl: null, limit: 10 }),
    ).toEqual([]);
  });

  it("limit은 병합 뒤에 적용된다 — 편집만 자르면 push·publish가 항상 밀려난다", () => {
    const items = recentActivity({
      edits,
      lastCommitAt: at("2026-09-09T09:00:00Z"),
      lastPublishedAt: at("2026-09-09T07:00:00Z"),
      lastPrUrl: null,
      limit: 2,
    });
    expect(items.map((i) => i.kind)).toEqual(["edit", "push"]);
  });

  /**
   * ⚠️ **DB가 준 순서에 기대지 않는다** (code-review 🟡1). `orderBy: { updatedAt: "desc" }`에 보조 키가
   * 없으면 같은 시각의 편집 둘의 순서가 요청마다 다를 수 있고, `Array.sort`는 안정 정렬이라 **그
   * 순서를 그대로 보존한다** — 같은 DB 상태가 다른 화면을 낸다. 보증을 조회 문자열이 아니라
   * **이 함수**에 둔다: 여기서 깨면 테스트가 잡고, 조회는 어느 8건을 고를지만 정한다.
   */
  it("같은 시각의 편집은 키·로케일 순으로 결정적이다 — 입력 순서가 뒤바뀌어도 같다", () => {
    const same = at("2026-09-09T10:00:00Z");
    const a = { at: same, key: "a.one", namespace: "a", locale: "ko", actor: null };
    const b = { at: same, key: "a.one", namespace: "a", locale: "ja", actor: null };
    const c = { at: same, key: "b.two", namespace: "b", locale: "ko", actor: null };

    const order = (edits: typeof a[]) =>
      recentActivity({ edits, lastCommitAt: null, lastPublishedAt: null, lastPrUrl: null, limit: 10 }).map(
        (i) => (i.kind === "edit" ? `${i.key}:${i.locale}` : i.kind),
      );

    expect(order([a, b, c])).toEqual(["a.one:ja", "a.one:ko", "b.two:ko"]);
    // 조회가 다른 순서로 줘도 화면이 같아야 한다 — 그것이 이 케이스의 요지다.
    expect(order([c, a, b])).toEqual(["a.one:ja", "a.one:ko", "b.two:ko"]);
    expect(order([b, c, a])).toEqual(["a.one:ja", "a.one:ko", "b.two:ko"]);
  });

  /**
   * ⚠️ **동시각 정렬이 결정적이어야 한다.** 같은 DB 상태가 같은 화면을 내야 하고, 안 그러면
   * 새로고침마다 순서가 바뀌는 목록이 된다 — 이 리포가 export 결정성에 대해 지키는 규칙과 같은 축이다.
   * 리포 수준 사건(publish·push)이 그 시각의 편집들 **위**에 온다: 그것들이 편집을 감싸는 사건이다.
   */
  it("같은 시각이면 publish → push → edit 순이고 두 번 불러도 같다", () => {
    const same = at("2026-09-09T10:00:00Z");
    const input = {
      edits: [{ at: same, key: "a.one", namespace: "a", locale: "ko", actor: null }],
      lastCommitAt: same,
      lastPublishedAt: same,
      lastPrUrl: null,
      limit: 10,
    };
    const first = recentActivity(input).map((i) => i.kind);
    expect(first).toEqual(["publish", "push", "edit"]);
    expect(recentActivity(input).map((i) => i.kind)).toEqual(first);
  });
});
