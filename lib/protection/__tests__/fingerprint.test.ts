import { describe, expect, it } from "vitest";

import { discardFingerprint, removalFingerprint, sameFingerprint, type DiscardFingerprintInput, type LocaleChangeState, type RemovalFingerprintInput } from "../fingerprint";

/**
 * 폐기 승인 지문 (ARCHITECTURE §5.5.2). 서버가 발급하고 잠금 뒤 재계산해 대조한다 — **상태가 바뀌면 지문이 바뀐다**가
 * 계약의 전부다(만료·HMAC이 없다). 그래서 입력 축마다 "바꾸면 달라진다"를 하나씩 센다.
 */

const BASE: DiscardFingerprintInput = {
  userId: "owner",
  projectId: "p1",
  repository: { repositoryId: "123", repoHost: "github", gitlabConnectionId: null, installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" },
  surfaces: [
    { id: "s1", importRevision: 3, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", basePath: null, baseLocale: "en" },
    { id: "s2", importRevision: 0, adapterName: "yaml-catalog", pathTemplate: "config/{locale}.yml", basePath: null, baseLocale: "en" },
  ],
  pending: [
    { id: "t1", token: "a" },
    { id: "t2", token: "b" },
  ],
  localeChanges: [],
};

/** 언어 변경 상태 하나 — 소스의 의도 행(요청 시각까지)과 전달 목록. 수동 Sync·소스 제거가 이것을 폐기하므로 승인에 묶는다(locale-add §4). */
const LOCALE: LocaleChangeState = {
  surfaceId: "s1",
  rows: [{ localeCode: "ko", operation: "REMOVE", requestedAt: "2026-10-14T00:00:00.000Z" }],
  delivered: [],
};

describe("discardFingerprint", () => {
  it("같은 상태 → 같은 지문 (결정적)", () => {
    expect(discardFingerprint(BASE)).toBe(discardFingerprint(structuredClone(BASE)));
  });

  it("sha256 hex 하나다 — pending 수와 무관하게 크기가 상수", () => {
    const many = { ...BASE, pending: Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, token: `k${i}` })) };
    expect(discardFingerprint(BASE)).toMatch(/^[0-9a-f]{64}$/);
    expect(discardFingerprint(many)).toHaveLength(64);
  });

  it("목록 순서에 흔들리지 않는다 — DB 조회 순서가 지문을 바꾸면 매번 reconfirm이다", () => {
    const shuffled = { ...BASE, pending: [...BASE.pending].reverse(), surfaces: [...BASE.surfaces].reverse() };
    expect(discardFingerprint(shuffled)).toBe(discardFingerprint(BASE));
  });

  it("[C4] 같은 건수 다른 편집(토큰만 다름) → 다른 지문", () => {
    expect(discardFingerprint({ ...BASE, pending: [{ id: "t1", token: "a" }, { id: "t2", token: "b2" }] })).not.toBe(discardFingerprint(BASE));
  });

  it("[C4] Dialog 뒤 새 저장(셀 추가) → 다른 지문", () => {
    expect(discardFingerprint({ ...BASE, pending: [...BASE.pending, { id: "t3", token: "c" }] })).not.toBe(discardFingerprint(BASE));
  });

  it("[C4] 설정 변경(경로·어댑터·base) → 다른 지문", () => {
    const [first, second] = BASE.surfaces;
    for (const changed of [
      { ...first!, pathTemplate: "locales/{locale}.json" },
      { ...first!, adapterName: "chrome-locales" },
      { ...first!, baseLocale: "ko" },
    ]) {
      expect(discardFingerprint({ ...BASE, surfaces: [changed, second!] })).not.toBe(discardFingerprint(BASE));
    }
  });

  it("[C4] 적용 뒤(importRevision 증가) → 다른 지문 — 성공한 승인은 재사용되지 않는다", () => {
    const [first, second] = BASE.surfaces;
    expect(discardFingerprint({ ...BASE, surfaces: [{ ...first!, importRevision: 4 }, second!] })).not.toBe(discardFingerprint(BASE));
  });

  /**
   * [audit #3] **승인은 어느 리포·브랜치를 덮는지까지 가리킨다.** `main` 기준으로 받은 승인이 그 뒤 `release`로 바뀐 설정에서 통과하면
   * OWNER가 본 적 없는 브랜치의 값으로 편집을 덮는다 — 표면 설정만 넣었던 지문은 이 변경을 못 봤다.
   */
  it("[audit #3] 리포 연결·기준 브랜치가 바뀌면 다른 지문", () => {
    for (const changed of [
      { baseBranch: "release" },
      { repoOwner: "other" },
      { repoName: "r2" },
      { repositoryId: "999" },
      { repoHost: "github", gitlabConnectionId: null, installationId: "789" },
    ]) {
      expect(discardFingerprint({ ...BASE, repository: { ...BASE.repository, ...changed } })).not.toBe(discardFingerprint(BASE));
    }
    expect(discardFingerprint({ ...BASE, repository: { ...BASE.repository, repositoryId: null, installationId: null } })).not.toBe(discardFingerprint(BASE));
  });

  it("사용자·프로젝트가 다르면 다른 지문", () => {
    expect(discardFingerprint({ ...BASE, userId: "other" })).not.toBe(discardFingerprint(BASE));
    expect(discardFingerprint({ ...BASE, projectId: "p2" })).not.toBe(discardFingerprint(BASE));
  });

  it("구분자 모호성으로 충돌하지 않는다 — id/token 경계가 바뀐 두 입력", () => {
    const a = { ...BASE, pending: [{ id: "t1", token: "a|t2" }] };
    const b = { ...BASE, pending: [{ id: "t1|a", token: "t2" }] };
    expect(discardFingerprint(a)).not.toBe(discardFingerprint(b));
  });
});

describe("discardFingerprint — 언어 변경 (locale-add design §4)", () => {
  const withLocale = { ...BASE, localeChanges: [LOCALE] };

  it("행이 생김(추가·제거 요청) → 다른 지문", () => {
    expect(discardFingerprint(withLocale)).not.toBe(discardFingerprint(BASE));
  });

  it.each<[string, LocaleChangeState[]]>([
    ["행 종류가 바뀜", [{ ...LOCALE, rows: [{ ...LOCALE.rows[0]!, operation: "ADD" }] }]],
    ["취소 뒤 같은 요청을 다시 냄(요청 시각)", [{ ...LOCALE, rows: [{ ...LOCALE.rows[0]!, requestedAt: "2026-10-14T00:00:01.000Z" }] }]],
    ["전달됨", [{ ...LOCALE, delivered: [{ localeCode: "ko", effect: "delete" }] }]],
    ["확인이 무효화됨(null)", [{ ...LOCALE, delivered: null }]],
    ["다른 소스의 같은 요청", [{ ...LOCALE, surfaceId: "s2" }]],
  ])("%s → 다른 지문", (_name, localeChanges) => {
    expect(discardFingerprint({ ...BASE, localeChanges })).not.toBe(discardFingerprint(withLocale));
  });

  it("행이 사라짐(취소) → 다른 지문", () => {
    expect(discardFingerprint(BASE)).not.toBe(discardFingerprint(withLocale));
  });

  it("소스·행 순서에 흔들리지 않는다", () => {
    const two: LocaleChangeState[] = [
      { surfaceId: "s1", rows: [{ localeCode: "ko", operation: "REMOVE", requestedAt: "t" }, { localeCode: "fr", operation: "ADD", requestedAt: "t" }], delivered: [{ localeCode: "ko", effect: "delete" }, { localeCode: "fr", effect: "create" }] },
      { surfaceId: "s2", rows: [{ localeCode: "de", operation: "ADD", requestedAt: "t" }], delivered: [] },
    ];
    const shuffled = [...two].reverse().map(state => ({ ...state, rows: [...state.rows].reverse(), delivered: state.delivered === null ? null : [...state.delivered].reverse() }));
    expect(discardFingerprint({ ...BASE, localeChanges: shuffled })).toBe(discardFingerprint({ ...BASE, localeChanges: two }));
  });
});

describe("sameFingerprint", () => {
  const current = discardFingerprint(BASE);

  it("일치 → true", () => {
    expect(sameFingerprint(current, current)).toBe(true);
  });

  it("승인 없음(null) → false", () => {
    expect(sameFingerprint(null, current)).toBe(false);
  });

  it("다른 지문 → false", () => {
    expect(sameFingerprint(discardFingerprint({ ...BASE, userId: "x" }), current)).toBe(false);
  });

  it("길이가 다른 입력에서 던지지 않고 false — timingSafeEqual은 길이 불일치에 던진다", () => {
    expect(sameFingerprint("abc", current)).toBe(false);
    expect(sameFingerprint("", current)).toBe(false);
  });
});

describe("removalFingerprint", () => {
  const INPUT: RemovalFingerprintInput = { userId: "owner", projectId: "p1", surfaceId: "s1", pending: [{ id: "t1", token: "a" }, { id: "t2", token: "b" }], localeChanges: [] };

  it("결정적이고 sha256 hex 하나다", () => {
    expect(removalFingerprint(INPUT)).toBe(removalFingerprint(structuredClone(INPUT)));
    expect(removalFingerprint(INPUT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("목록 순서에 흔들리지 않는다", () => {
    expect(removalFingerprint({ ...INPUT, pending: [...INPUT.pending].reverse() })).toBe(removalFingerprint(INPUT));
  });

  it.each([
    ["사용자", { userId: "other" }],
    ["프로젝트", { projectId: "p2" }],
    ["대상 소스", { surfaceId: "s2" }],
    ["토큰 하나 바뀜", { pending: [{ id: "t1", token: "a" }, { id: "t2", token: "c" }] }],
    ["편집 하나 늘어남", { pending: [...INPUT.pending, { id: "t3", token: "d" }] }],
    ["편집 0건", { pending: [] }],
    // 제거가 그 소스의 언어 변경 의도를 지운다 — 승인 뒤 추가·취소·전달이 있으면 옛 승인이 통하지 않는다(locale-add §4).
    ["언어 변경 행이 생김", { localeChanges: [LOCALE] }],
  ] as const)("%s → 다른 지문", (_, change) => {
    expect(removalFingerprint({ ...INPUT, ...change })).not.toBe(removalFingerprint(INPUT));
  });

  it("같은 사용자·프로젝트·토큰이어도 수동 Sync 지문과 겹치지 않는다 — 용도 접두가 갈라 놓는다", () => {
    const sync = discardFingerprint({ userId: "owner", projectId: "p1", repository: BASE.repository, surfaces: [], pending: INPUT.pending, localeChanges: [] });
    expect(removalFingerprint(INPUT)).not.toBe(sync);
  });
});
