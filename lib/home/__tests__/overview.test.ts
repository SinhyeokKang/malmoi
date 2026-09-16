import { describe, expect, it } from "vitest";

import { ACTIVITY_LIMIT, ACTIVITY_WINDOW_DAYS, activeLocaleProgress, recentActivity } from "../overview";

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
 * **최근 로그 — 갈래 넷** (project-home design §3.4). `SyncRun`이 서면서 Publish 줄이 PR 번호와 파일
 * 수를 들게 됐고, `lastImportFailedAt`이 서면서 **실패도 사건이 됐다.**
 *
 * ⚠️ **상한이 건수에서 기간으로 바뀌었다.** 8건 고정이면 "오늘 조용했다"와 "7일 조용했다"가 화면에서
 * 구별되지 않는다 (spec §2.2-3). 건수 상한은 남지만 **자르는 축이 아니라 방어선**이다.
 *
 * ⚠️ **`{who} added the {surface} surface` 줄은 만들지 않는다** — 출처가 아예 없다. `SyncRun`은
 * Publish 전용이고 `trigger`/`status` enum이 그 가정 위에 선다. 캔버스와의 **의도된 이탈**이다.
 */
describe("recentActivity — 네 출처를 한 줄로", () => {
  const now = at("2026-09-15T12:00:00Z");
  const empty = { edits: [], pushes: [], publishes: [], syncFailures: [], now, windowDays: ACTIVITY_WINDOW_DAYS, limit: ACTIVITY_LIMIT };

  const edits = [
    { at: at("2026-09-15T10:00:00Z"), key: "a.greet", surfaceSlug: "web", namespace: "a", locale: "ko", actor: "Kim" },
    { at: at("2026-09-15T08:00:00Z"), key: "a.bye", surfaceSlug: "web", namespace: "a", locale: "ja", actor: null },
  ];

  it("시각 내림차순으로 병합한다", () => {
    expect(
      recentActivity({
        ...empty,
        edits,
        pushes: [{ surfaceSlug: "web", at: at("2026-09-15T09:00:00Z"), newKeys: 12 }],
        publishes: [{ at: at("2026-09-15T07:00:00Z"), prNumber: 3, changed: 2 }],
        syncFailures: [{ surfaceSlug: "emails", at: at("2026-09-15T11:00:00Z") }],
      }).map((i) => [i.kind, i.at.toISOString()]),
    ).toEqual([
      ["sync_failed", "2026-09-15T11:00:00.000Z"],
      ["edit", "2026-09-15T10:00:00.000Z"],
      ["push", "2026-09-15T09:00:00.000Z"],
      ["edit", "2026-09-15T08:00:00.000Z"],
      ["publish", "2026-09-15T07:00:00.000Z"],
    ]);
  });

  it("편집 항목이 어느 키·어느 로케일인지 든다 — 그것이 `?ns=`·`?locales=` 링크의 재료다", () => {
    const [first] = recentActivity({ ...empty, edits });
    expect(first).toEqual({
      kind: "edit", at: at("2026-09-15T10:00:00Z"), key: "a.greet",
      surfaceSlug: "web", namespace: "a", locale: "ko", actor: "Kim",
    });
  });

  /** 이름을 못 찾은 편집자는 `actorLabel`이 원문을 내거나 `null`이다 — 여기서 지어내지 않는다. */
  it("편집자가 없어도 항목은 남는다", () => {
    expect(recentActivity({ ...empty, edits })[1]).toMatchObject({ kind: "edit", actor: null });
  });

  /** ⚠️ **`{n} new keys`는 그 Sync가 들여온 키 수다** — 표면마다 갈리므로 표면도 함께 든다. */
  it("push 줄이 표면과 들어온 키 수를 든다", () => {
    expect(recentActivity({ ...empty, pushes: [{ surfaceSlug: "emails", at: at("2026-09-15T09:00:00Z"), newKeys: 12 }] })).toEqual([
      { kind: "push", at: at("2026-09-15T09:00:00Z"), surfaceSlug: "emails", newKeys: 12 },
    ]);
  });

  /**
   * ⚠️ **`changed`는 파일 수다** — `SyncRun.changed`가 그렇고 문장이 그것을 그대로 말한다. 칸 수로
   * 읽히면 "3칸 보냈다"가 되는데 실제로는 3개 파일이다.
   */
  it("publish 줄이 PR 번호와 파일 수를 든다 — 둘 다 없을 수 있다", () => {
    expect(recentActivity({ ...empty, publishes: [{ at: at("2026-09-15T07:00:00Z"), prNumber: 3, changed: 2 }] })).toEqual([
      { kind: "publish", at: at("2026-09-15T07:00:00Z"), prNumber: 3, changed: 2 },
    ]);
    expect(recentActivity({ ...empty, publishes: [{ at: at("2026-09-15T07:00:00Z"), prNumber: null, changed: null }] })).toEqual([
      { kind: "publish", at: at("2026-09-15T07:00:00Z"), prNumber: null, changed: null },
    ]);
  });

  /**
   * ⚠️ **`CI synced 0 new keys into web`은 정보가 아니다.** 들여온 키가 없는 Sync는 로그에서
   * 말할 것이 없고(`lastCommitAt`이 표면마다 상시로 서 있으므로 그 줄이 영구히 남는다), 그 사실을
   * 알아야 하는 자리는 메타 열의 `Last sync`다.
   */
  it("들여온 키가 0인 Sync는 줄을 만들지 않는다", () => {
    expect(recentActivity({ ...empty, pushes: [{ surfaceSlug: "web", at: at("2026-09-15T09:00:00Z"), newKeys: 0 }] })).toEqual([]);
  });

  it("Sync 실패도 사건이다 — 어느 표면을 못 읽었는지 든다", () => {
    expect(recentActivity({ ...empty, syncFailures: [{ surfaceSlug: "emails", at: at("2026-09-15T11:00:00Z") }] })).toEqual([
      { kind: "sync_failed", at: at("2026-09-15T11:00:00Z"), surfaceSlug: "emails" },
    ]);
  });

  /**
   * ⚠️ **"오늘 조용했다"와 "7일 조용했다"가 갈려야 한다** (spec §2.2-3). 건수로 자르면 한 달 전
   * 사건 여덟이 상시로 서서 이 블록이 무엇을 말하는 자리인지 사라진다.
   */
  it("창 밖의 사건은 항목을 만들지 않는다", () => {
    const old = at("2026-09-07T11:59:00Z");
    const fresh = at("2026-09-08T13:00:00Z");
    const items = recentActivity({
      ...empty,
      pushes: [{ surfaceSlug: "web", at: old, newKeys: 1 }, { surfaceSlug: "web", at: fresh, newKeys: 2 }],
    });
    expect(items.map((i) => i.at.toISOString())).toEqual([fresh.toISOString()]);
  });

  it("창은 상수로 7일이다 — 문구가 그 수를 그대로 말한다", () => {
    expect(ACTIVITY_WINDOW_DAYS).toBe(7);
    expect(ACTIVITY_LIMIT).toBe(20);
  });

  /** ⚠️ **건수 상한은 방어선이지 자르는 축이 아니다** — 903키 리포에서 편집이 하루에 수백 건 난다. */
  it("건수 상한은 병합 뒤에 적용된다 — 편집만 자르면 다른 갈래가 항상 밀려난다", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      at: new Date(now.getTime() - (i + 1) * 60_000),
      key: `k${i}`, surfaceSlug: "web", namespace: "a", locale: "ko", actor: null,
    }));
    const items = recentActivity({
      ...empty,
      edits: many,
      publishes: [{ at: new Date(now.getTime() - 60 * 60_000), prNumber: 1, changed: 1 }],
      limit: 5,
    });
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.kind === "edit")).toBe(true);
  });

  it("빈 프로젝트는 빈 배열이다", () => {
    expect(recentActivity(empty)).toEqual([]);
  });

  /**
   * ⚠️ **DB가 준 순서에 기대지 않는다.** `orderBy`에 보조 키가 없으면 같은 시각의 편집 둘의 순서가
   * 요청마다 다를 수 있고, `Array.sort`는 안정 정렬이라 **그 순서를 그대로 보존한다** — 같은 DB
   * 상태가 다른 화면을 낸다. 보증을 조회 문자열이 아니라 **이 함수**에 둔다.
   */
  it("같은 시각의 편집은 표면·키·로케일 순으로 결정적이다 — 입력 순서가 뒤바뀌어도 같다", () => {
    const same = at("2026-09-15T10:00:00Z");
    const a = { at: same, key: "a.one", surfaceSlug: "web", namespace: "a", locale: "ko", actor: null };
    const b = { at: same, key: "a.one", surfaceSlug: "web", namespace: "a", locale: "ja", actor: null };
    const c = { at: same, key: "b.two", surfaceSlug: "web", namespace: "b", locale: "ko", actor: null };
    const order = (rows: (typeof a)[]) =>
      recentActivity({ ...empty, edits: rows }).map((i) => (i.kind === "edit" ? `${i.key}:${i.locale}` : i.kind));
    expect(order([a, b, c])).toEqual(["a.one:ja", "a.one:ko", "b.two:ko"]);
    expect(order([c, a, b])).toEqual(["a.one:ja", "a.one:ko", "b.two:ko"]);
    expect(order([b, c, a])).toEqual(["a.one:ja", "a.one:ko", "b.two:ko"]);
  });

  /** 리포 수준 사건이 그 시각의 편집 **위**에 온다 — 그것들이 편집을 감싸는 사건이다. */
  it("같은 시각이면 publish → push → sync_failed → edit 순이고 두 번 불러도 같다", () => {
    const same = at("2026-09-15T10:00:00Z");
    const input = {
      ...empty,
      edits: [{ at: same, key: "a.one", surfaceSlug: "web", namespace: "a", locale: "ko", actor: null }],
      pushes: [{ surfaceSlug: "web", at: same, newKeys: 1 }],
      publishes: [{ at: same, prNumber: 1, changed: 1 }],
      syncFailures: [{ surfaceSlug: "emails", at: same }],
    };
    const first = recentActivity(input).map((i) => i.kind);
    expect(first).toEqual(["publish", "push", "sync_failed", "edit"]);
    expect(recentActivity(input).map((i) => i.kind)).toEqual(first);
  });

  it("같은 시각의 표면 사건 둘은 표면 slug로 기울인다", () => {
    const same = at("2026-09-15T10:00:00Z");
    const order = (rows: { surfaceSlug: string; at: Date; newKeys: number }[]) =>
      recentActivity({ ...empty, pushes: rows }).map((i) => (i.kind === "push" ? i.surfaceSlug : i.kind));
    const rows = [{ surfaceSlug: "web", at: same, newKeys: 1 }, { surfaceSlug: "emails", at: same, newKeys: 2 }];
    expect(order(rows)).toEqual(["emails", "web"]);
    expect(order([...rows].reverse())).toEqual(["emails", "web"]);
  });
});
