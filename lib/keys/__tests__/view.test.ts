import { describe, expect, it } from "vitest";

import { relativeTime } from "@/lib/relative-time";
import {
  buildPermalink,
  defaultNamespace,
  filterRows,
  isUnpublished,
  localeProgress,
  namespaceCounts,
  resolveNamespace,
  translationState,
  type KeyRow,
  type NamespaceCount,
} from "../view";

/** 셀 픽스처의 시각 — `isUnpublished` 테스트 말고는 이 값을 보지 않는다. */
const EPOCH = new Date("2026-09-01T00:00:00Z");

const row = (over: Partial<KeyRow> & Pick<KeyRow, "key">): KeyRow => ({
  id: `id-${over.key}`,
  namespace: over.key.split(/[._]/)[0] ?? "_root",
  orphaned: false,
  /** 로케일 코드 → 값. 테이블이 로케일을 열로 펼치므로 행이 전부 들고 있어야 한다. */
  cells: {},
  refs: [],
  ...over,
});

/** 단일 로케일 관점 헬퍼 — 배지 판정 테스트는 셀 하나만 본다. */
const cell = (over: Partial<KeyRow["cells"][string]> = {}) => ({
  value: null, needsReview: false, updatedBy: null, updatedAt: EPOCH, ...over,
});

describe("namespaceCounts — 사이드바", () => {
  // 테이블이 로케일을 열로 펼치므로 "일이 얼마나 남았나"는 로케일마다 다르다.
  // 어느 로케일 기준으로 셀지를 인자로 받는다.
  it("네임스페이스별 개수를 센다", () => {
    const counts = namespaceCounts([
      row({ key: "common.ok" }),
      row({ key: "common.cancel" }),
      row({ key: "auth.login" }),
    ], "ko");
    expect(counts).toEqual([
      { namespace: "auth", total: 1, untranslated: 1, needsReview: 0, orphaned: 0 },
      { namespace: "common", total: 2, untranslated: 2, needsReview: 0, orphaned: 0 },
    ]);
  });

  it("네임스페이스가 정렬되어 나온다", () => {
    const counts = namespaceCounts([row({ key: "z.a" }), row({ key: "a.b" }), row({ key: "m.c" })], "ko");
    expect(counts.map((c) => c.namespace)).toEqual(["a", "m", "z"]);
  });

  it("상태별 개수를 함께 센다", () => {
    const counts = namespaceCounts([
      row({ key: "a.done", cells: { ko: cell({ value: "값" }) } }),
      row({ key: "a.stale", cells: { ko: cell({ value: "값", needsReview: true }) } }),
      row({ key: "a.gone", cells: { ko: cell({ value: "값" }) }, orphaned: true }),
      row({ key: "a.empty" }),
    ], "ko");
    expect(counts[0]).toEqual({
      namespace: "a",
      total: 4,
      untranslated: 1,
      needsReview: 1,
      orphaned: 1,
    });
  });

  it("키가 0개면 빈 목록", () => {
    expect(namespaceCounts([], "ko")).toEqual([]);
  });
});

describe("translationState — 배지 판정", () => {
  it("값이 없으면 untranslated", () => {
    expect(translationState({ orphaned: false, value: null, needsReview: false })).toBe("untranslated");
  });

  it("빈 문자열도 untranslated다 (편집 UI에서 지운 값이 그렇게 온다)", () => {
    expect(translationState({ orphaned: false, value: "", needsReview: false })).toBe("untranslated");
  });

  it("값이 있으면 translated", () => {
    expect(translationState({ orphaned: false, value: "값", needsReview: false })).toBe("translated");
  });

  it("needsReview가 translated를 이긴다", () => {
    expect(translationState({ orphaned: false, value: "값", needsReview: true })).toBe("needsReview");
  });

  it("orphaned가 전부를 이긴다 — 키 자체가 코드에서 사라졌다", () => {
    expect(translationState({ orphaned: true, value: "값", needsReview: true })).toBe("orphaned");
    expect(translationState({ orphaned: true, value: null, needsReview: false })).toBe("orphaned");
  });

  it("needsReview인데 값이 없으면 untranslated다 — 검토할 값이 없다", () => {
    expect(translationState({ orphaned: false, value: null, needsReview: true })).toBe("untranslated");
  });
});

describe("namespaceCounts — 로케일마다 남은 일이 다르다", () => {
  const rows = [
    row({ key: "a.x", cells: { ko: cell({ value: "번역됨" }), fr: cell() } }),
    row({ key: "a.y", cells: { ko: cell(), fr: cell({ value: "traduit" }) } }),
  ];

  it("ko 기준", () => {
    expect(namespaceCounts(rows, "ko")[0]).toMatchObject({ total: 2, untranslated: 1 });
  });

  it("fr 기준 — 다른 결과가 나온다", () => {
    expect(namespaceCounts(rows, "fr")[0]).toMatchObject({ total: 2, untranslated: 1 });
  });

  it("셀이 없는 로케일은 전부 미번역이다", () => {
    expect(namespaceCounts(rows, "ja")[0]).toMatchObject({ total: 2, untranslated: 2 });
  });
});

describe("buildPermalink — GitHub 코드 참조", () => {
  const project = { repoOwner: "acme", repoName: "app", lastCommitSha: "a".repeat(40) };

  it("owner/repo/blob/sha/path#Lline 형태다", () => {
    expect(buildPermalink(project, { path: "src/a.ts", line: 42 })).toBe(
      `https://github.com/acme/app/blob/${"a".repeat(40)}/src/a.ts#L42`,
    );
  });

  it("커밋 SHA가 없으면 null — 브랜치명으로 대체하지 않는다", () => {
    // 브랜치로 링크하면 코드가 움직여 줄 번호가 어긋난다. permalink의 요지가 사라진다.
    expect(buildPermalink({ ...project, lastCommitSha: null }, { path: "a.ts", line: 1 })).toBeNull();
  });

  it("경로의 슬래시는 인코딩하지 않는다 (디렉터리 구분자다)", () => {
    const url = buildPermalink(project, { path: "src/deep/nested/file.ts", line: 7 });
    expect(url).toContain("/src/deep/nested/file.ts#L7");
  });

  it("경로의 특수문자는 인코딩한다", () => {
    const url = buildPermalink(project, { path: "src/[locale]/page.tsx", line: 3 });
    expect(url).toContain("%5Blocale%5D");
    expect(url).not.toContain("[locale]");
  });
});

/**
 * **기본 착지는 "남은 일이 있는" 첫 네임스페이스다** (design §3.3). `compareKeys` 첫 항목은
 * 알파벳순이라 이미 다 번역된 사소한 네임스페이스일 수 있고, 그러면 편집자가 매번 직접 찾아야 한다.
 *
 * ⚠️ **`focus` 인자를 받지 않는다** — 집계(`namespaceCounts(rows, locale)`)가 이미 그 로케일 기준으로
 * 만들어진다. 여기서 로케일을 또 받으면 두 값이 갈릴 수 있는 자리만 생긴다.
 */
describe("defaultNamespace — 착지할 네임스페이스", () => {
  const counts = (...items: [string, Partial<NamespaceCount>][]): NamespaceCount[] =>
    items.map(([namespace, over]) => ({
      namespace,
      total: 1,
      untranslated: 0,
      needsReview: 0,
      orphaned: 0,
      ...over,
    }));

  it("빈 프로젝트는 null이다 — 화면이 '키 없음' 빈 상태로 간다", () => {
    expect(defaultNamespace([])).toBeNull();
  });

  it("미번역이 있는 첫 네임스페이스로 간다 — 알파벳 첫 항목이 아니다", () => {
    expect(defaultNamespace(counts(["auth", {}], ["common", { untranslated: 1 }]))).toBe("common");
  });

  it("검토 필요도 '남은 일'이다", () => {
    expect(defaultNamespace(counts(["auth", {}], ["common", { needsReview: 1 }]))).toBe("common");
  });

  it("남은 일이 하나도 없으면 첫 네임스페이스다", () => {
    expect(defaultNamespace(counts(["auth", {}], ["common", {}]))).toBe("auth");
  });

  it("orphaned만 있는 네임스페이스는 건너뛴다 — 편집할 수 없는 화면에 착지시키지 않는다", () => {
    expect(defaultNamespace(counts(["auth", { total: 2, orphaned: 2 }], ["common", {}]))).toBe("common");
  });

  it("전부 orphaned면 null이다", () => {
    expect(defaultNamespace(counts(["auth", { total: 2, orphaned: 2 }]))).toBeNull();
  });

  it("집계 순서를 따른다 — 정렬은 namespaceCounts가 이미 했다", () => {
    expect(defaultNamespace(counts(["z", { untranslated: 1 }], ["a", { untranslated: 1 }]))).toBe("z");
  });
});

/**
 * ⚠️ **없는 이름을 404로 만들지 않는다.** 필터는 URL에 있고 링크는 오래 산다 — 네임스페이스가
 * 사라진 뒤 옛 링크를 열면 화면이 죽는 대신 기본 착지로 간다.
 */
describe("resolveNamespace — `?ns=`의 해석", () => {
  const counts: NamespaceCount[] = [
    { namespace: "auth", total: 1, untranslated: 0, needsReview: 0, orphaned: 0 },
    { namespace: "common", total: 1, untranslated: 1, needsReview: 0, orphaned: 0 },
  ];

  it("없으면 기본 착지다", () => {
    expect(resolveNamespace(undefined, counts)).toEqual({ kind: "one", namespace: "common" });
  });

  it("`*`는 전체다 — 어댑터가 만들 수 없는 이름이라 실제 접두와 충돌하지 않는다", () => {
    expect(resolveNamespace("*", counts)).toEqual({ kind: "all" });
  });

  it("아는 이름은 그대로다", () => {
    expect(resolveNamespace("auth", counts)).toEqual({ kind: "one", namespace: "auth" });
  });

  it("없는 이름은 기본 착지로 떨어진다 — 낡은 링크가 404가 되지 않는다", () => {
    expect(resolveNamespace("gone", counts)).toEqual({ kind: "one", namespace: "common" });
  });

  it("대소문자를 구별한다 — 네임스페이스는 키 접두라 파일이 정한다", () => {
    expect(resolveNamespace("Auth", counts)).toEqual({ kind: "one", namespace: "common" });
  });

  it("키가 하나도 없으면 아무 데도 착지하지 않는다", () => {
    expect(resolveNamespace("auth", [])).toEqual({ kind: "none" });
    expect(resolveNamespace("*", [])).toEqual({ kind: "all" });
  });
});

describe("filterRows — 툴바의 두 필터", () => {
  const rows = [
    row({ key: "common.save", cells: { ko: { value: "저장", needsReview: false, updatedBy: null, updatedAt: EPOCH } } }),
    row({ key: "common.cancel", cells: { ko: { value: null, needsReview: false, updatedBy: null, updatedAt: EPOCH } } }),
    row({ key: "auth.login", cells: { ko: { value: "로그인", needsReview: true, updatedBy: null, updatedAt: EPOCH } } }),
  ];

  it("필터가 없으면 그대로다", () => {
    expect(filterRows(rows, { locale: "ko" })).toHaveLength(3);
  });

  it("공백만인 `q`는 무필터다 — 지운 필터가 0행을 내면 안 된다", () => {
    expect(filterRows(rows, { locale: "ko", q: "   " })).toHaveLength(3);
  });

  it("키를 부분 일치로 찾는다", () => {
    expect(filterRows(rows, { locale: "ko", q: "common." }).map((r) => r.key)).toEqual([
      "common.save",
      "common.cancel",
    ]);
  });

  it("대소문자를 무시한다", () => {
    expect(filterRows(rows, { locale: "ko", q: "COMMON" })).toHaveLength(2);
  });

  it("값도 본다 — 어느 로케일이든 (편집자는 자기 언어로 찾는다)", () => {
    expect(filterRows(rows, { locale: "ko", q: "로그인" }).map((r) => r.key)).toEqual(["auth.login"]);
  });

  it("미번역 필터", () => {
    expect(filterRows(rows, { locale: "ko", state: "untranslated" }).map((r) => r.key)).toEqual([
      "common.cancel",
    ]);
  });

  it("검토 필요 필터", () => {
    expect(filterRows(rows, { locale: "ko", state: "needs-review" }).map((r) => r.key)).toEqual([
      "auth.login",
    ]);
  });

  it("상태는 focus 로케일 기준이다 — 다른 로케일에선 결과가 다르다", () => {
    expect(filterRows(rows, { locale: "fr", state: "untranslated" })).toHaveLength(3);
  });

  it("둘을 겹치면 교집합이다 — 0행이 정상 결과다", () => {
    expect(filterRows(rows, { locale: "ko", q: "common", state: "needs-review" })).toEqual([]);
  });
});

/**
 * **미배포 판정** (design §3.5). `updatedAt > lastPulledAt`만으로는 안 된다 — push가 전 행의
 * `updatedAt`을 올리므로 push 직후 903키 전부가 "안 보낸 편집"이 된다. 사람이 저장한 행만
 * `updatedBy`를 든다(push는 그것을 비운다 — design §3.6).
 */
describe("isUnpublished — 아직 안 보낸 편집인가", () => {
  const pulled = new Date("2026-09-08T00:00:00Z");

  it("사람이 만졌고 마지막 판정 뒤에 바뀌었다", () => {
    expect(isUnpublished({ updatedBy: "u1", updatedAt: new Date("2026-09-08T01:00:00Z") }, pulled)).toBe(true);
  });

  it("push가 쓴 행은 세지 않는다 — updatedBy가 없다", () => {
    expect(isUnpublished({ updatedBy: null, updatedAt: new Date("2026-09-08T01:00:00Z") }, pulled)).toBe(false);
  });

  it("이미 보낸 편집은 세지 않는다", () => {
    expect(isUnpublished({ updatedBy: "u1", updatedAt: new Date("2026-09-07T23:00:00Z") }, pulled)).toBe(false);
  });

  it("경계는 배타적이다 — 판정 시각과 같은 행은 그 판정에 이미 들어갔다", () => {
    expect(isUnpublished({ updatedBy: "u1", updatedAt: pulled }, pulled)).toBe(false);
  });

  it("한 번도 안 보냈으면 사람이 만진 행이 전부 미배포다", () => {
    expect(isUnpublished({ updatedBy: "u1", updatedAt: new Date("2020-01-01") }, null)).toBe(true);
    expect(isUnpublished({ updatedBy: null, updatedAt: new Date("2020-01-01") }, null)).toBe(false);
  });
});

/**
 * 툴바의 "Last sent 2 days ago". **문자열을 사전이 아니라 `Intl`이 만든다** — 상대 시각은 UI 문구가
 * 아니라 서식이고, 사전에 넣으면 단위마다 갈래를 손으로 늘리게 된다 (design §3.4).
 *
 * ⚠️ **서버에서 만들어 문자열로 내려보낸다.** 클라이언트가 자기 시계로 다시 계산하면 하이드레이션이
 * 갈리고, 그 차이는 조용하다.
 */
describe("relativeTime — 마지막으로 보낸 시각", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("방금 보낸 것은 '초'로 말하지 않는다", () => {
    expect(relativeTime(new Date("2026-09-08T11:59:50Z"), now)).toBe("now");
  });

  it("분·시간·일 단위로 올라간다", () => {
    expect(relativeTime(new Date("2026-09-08T11:55:00Z"), now)).toBe("5 minutes ago");
    expect(relativeTime(new Date("2026-09-08T09:00:00Z"), now)).toBe("3 hours ago");
    expect(relativeTime(new Date("2026-09-06T12:00:00Z"), now)).toBe("2 days ago");
  });

  it("어제는 '어제'다 — numeric auto가 숫자보다 읽기 쉽다", () => {
    expect(relativeTime(new Date("2026-09-07T12:00:00Z"), now)).toBe("yesterday");
  });

  it("⚠️ 미래 시각도 던지지 않는다 — 서버·DB 시계가 어긋날 수 있다", () => {
    expect(relativeTime(new Date("2026-09-08T12:00:30Z"), now)).toBe("now");
  });

  it("같은 입력 → 같은 결과 (결정성)", () => {
    const then = new Date("2026-09-01T00:00:00Z");
    expect(relativeTime(then, now)).toBe(relativeTime(then, now));
  });
});


/**
 * **로케일별 진행률** (6b-5 — `/projects/:slug/locales`).
 *
 * ⚠️ **분모는 살아 있는 키 수 하나다** — orphaned 키는 export에서 빠지므로(ARCHITECTURE §5.5.16)
 * 번역해야 할 일이 아니다. 조회가 그것을 걸러 주고 이 함수는 셈만 한다.
 *
 * ⚠️ **base 로케일도 100%가 아닐 수 있다.** 그 파일이 키 집합의 진실이지만 값이 빈 키가 있을 수
 * 있고(2026-09-09 POSTMORTEM이 그 상태를 다뤘다), 그때 base 행이 100%로 보이면 화면이 거짓말을 한다.
 */
describe("localeProgress — 로케일별 진행률 (6b-5)", () => {
  const locales = [
    { code: "en", isBase: true, orphaned: false },
    { code: "ko", isBase: false, orphaned: false },
  ];

  it("값이 있는 셀을 로케일별로 센다 — 검토 필요는 따로 센다", () => {
    expect(
      localeProgress({
        locales,
        total: 4,
        cells: [
          { localeCode: "en", needsReview: false },
          { localeCode: "en", needsReview: false },
          { localeCode: "ko", needsReview: false },
          { localeCode: "ko", needsReview: true },
        ],
      }),
    ).toEqual([
      { code: "en", isBase: true, orphaned: false, total: 4, translated: 2, needsReview: 0, untranslated: 2, percent: 50 },
      { code: "ko", isBase: false, orphaned: false, total: 4, translated: 1, needsReview: 1, untranslated: 2, percent: 25 },
    ]);
  });

  /** 검토 필요는 **번역된 것이 아니다** — 원문이 바뀌어 사람이 다시 봐야 하는 값이다. */
  it("untranslated는 total에서 나머지 둘을 뺀 값이다", () => {
    const [ko] = localeProgress({
      locales: [{ code: "ko", isBase: false, orphaned: false }],
      total: 10,
      cells: [
        ...Array.from({ length: 3 }, () => ({ localeCode: "ko", needsReview: false })),
        ...Array.from({ length: 2 }, () => ({ localeCode: "ko", needsReview: true })),
      ],
    });
    expect(ko).toMatchObject({ translated: 3, needsReview: 2, untranslated: 5 });
  });

  it("셀이 없는 로케일은 0이다 — 행을 빼지 않는다", () => {
    expect(localeProgress({ locales, total: 3, cells: [] }).map((l) => [l.code, l.translated])).toEqual([
      ["en", 0],
      ["ko", 0],
    ]);
  });

  it("빈 프로젝트는 percent가 0이다 — 0으로 나누지 않는다", () => {
    const rows = localeProgress({ locales, total: 0, cells: [] });
    for (const r of rows) expect(r.percent, r.code).toBe(0);
    expect(rows.map((r) => r.untranslated)).toEqual([0, 0]);
  });

  /**
   * ⚠️ **내림이다.** 902/903을 100%로 보이면 "다 됐다"로 읽히고, 그 하나가 영영 안 채워진다.
   * 100%는 실제로 전부일 때만 나온다.
   */
  it("percent는 내림이다 — 하나 남았는데 100%가 되지 않는다", () => {
    const [only] = localeProgress({
      locales: [{ code: "ko", isBase: false, orphaned: false }],
      total: 903,
      cells: Array.from({ length: 902 }, () => ({ localeCode: "ko", needsReview: false })),
    });
    expect(only?.percent).toBe(99);
  });

  it("전부 번역되면 100이다", () => {
    const [only] = localeProgress({
      locales: [{ code: "ko", isBase: false, orphaned: false }],
      total: 2,
      cells: Array.from({ length: 2 }, () => ({ localeCode: "ko", needsReview: false })),
    });
    expect(only?.percent).toBe(100);
  });

  /** base 파일에도 빈 값이 있을 수 있다 (POSTMORTEM 2026-09-09) — 100%로 보이면 화면이 거짓말이다. */
  it("base 로케일도 100%가 아닐 수 있다", () => {
    const [base] = localeProgress({
      locales: [{ code: "en", isBase: true, orphaned: false }],
      total: 4,
      cells: [{ localeCode: "en", needsReview: false }],
    });
    expect(base).toMatchObject({ isBase: true, translated: 1, untranslated: 3, percent: 25 });
  });

  /**
   * ⚠️ **순서가 화면의 정보구조다**: base가 먼저(나머지가 그것의 번역이다), 그다음 살아 있는 로케일,
   * orphaned는 **맨 뒤**다 — 그 행마다 사유 설명이 붙어서 사이에 끼면 건강한 목록이 쪼개진다.
   */
  it("base 먼저, 그다음 코드순, orphaned는 맨 뒤다", () => {
    expect(
      localeProgress({
        locales: [
          { code: "ko", isBase: false, orphaned: false },
          { code: "de", isBase: false, orphaned: true },
          { code: "en", isBase: true, orphaned: false },
          { code: "fr", isBase: false, orphaned: false },
          { code: "ja", isBase: false, orphaned: true },
        ],
        total: 1,
        cells: [],
      }).map((l) => l.code),
    ).toEqual(["en", "fr", "ko", "de", "ja"]);
  });

  it("base가 orphaned여도 맨 앞이다 — 선언된 base라는 사실이 먼저다", () => {
    expect(
      localeProgress({
        locales: [
          { code: "ko", isBase: false, orphaned: false },
          { code: "en", isBase: true, orphaned: true },
        ],
        total: 1,
        cells: [],
      }).map((l) => [l.code, l.orphaned]),
    ).toEqual([
      ["en", true],
      ["ko", false],
    ]);
  });

  /** orphaned 로케일의 번역은 DB에 남아 있다 — 진행률을 내는 것이 "되살리면 돌아온다"의 근거다. */
  it("orphaned 로케일도 진행률을 낸다 — 행을 감추지 않는다", () => {
    const [row] = localeProgress({
      locales: [{ code: "fr", isBase: false, orphaned: true }],
      total: 2,
      cells: [{ localeCode: "fr", needsReview: false }],
    });
    expect(row).toMatchObject({ code: "fr", orphaned: true, translated: 1, percent: 50 });
  });

  /** 목록에 없는 코드의 셀은 행을 지어내지 않는다 — 로케일 목록의 정본은 `Locale` 행이다. */
  it("모르는 로케일 코드의 셀은 버린다", () => {
    expect(
      localeProgress({
        locales: [{ code: "ko", isBase: false, orphaned: false }],
        total: 1,
        cells: [{ localeCode: "zz", needsReview: false }],
      }).map((l) => [l.code, l.translated]),
    ).toEqual([["ko", 0]]);
  });

  it("로케일이 없으면 빈 배열이다", () => {
    expect(localeProgress({ locales: [], total: 5, cells: [] })).toEqual([]);
  });
});
