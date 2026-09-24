import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { relativeTime } from "@/lib/relative-time";
import { buildPermalink, isUnpublished, localeProgress } from "../view";

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

describe("isUnpublished — 아직 전달 확인되지 않은 편집인가 (sync-edit-protection T8)", () => {
  it("[C9] 토큰이 있는 활성 셀 → true (pending 투영)", () => {
    expect(isUnpublished({ pending: true, surfaceArchivedAt: null })).toBe(true);
  });

  it("토큰이 없으면 → false — 시각·저자가 아니라 토큰이 판정한다 (위 true 대조)", () => {
    expect(isUnpublished({ pending: false, surfaceArchivedAt: null })).toBe(false);
  });

  it("[C9] 보관 표면의 셀은 pending이어도 세지 않는다", () => {
    expect(isUnpublished({ pending: true, surfaceArchivedAt: new Date("2026-09-08T00:00:00Z") })).toBe(false);
  });
});

/**
 * 툴바의 "Last sent 2 days ago". **문자열을 사전이 아니라 `Intl`이 만든다** — 상대 시각은 UI 문구가
 * 아니라 서식이고, 사전에 넣으면 단위마다 갈래를 손으로 늘리게 된다 (DESIGN §6.1).
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

/**
 * **재발 방지는 grep이 아니라 이 스캔이다.**
 *
 * ⚠️ 증상이 없는 결함이라 리뷰로도 테스트로도 안 걸린다 — 2026-09-18에 네 자리가 같은 모양으로
 * 살아 있었고 `pnpm test` 4,369개가 green이었다. **새로 쓰는 사람이 `row.cells[code]`라고 적는 것이
 * 자연스럽다는 것이 이 결함의 성질**이므로, 그 모양 자체를 0으로 고정한다.
 */
describe("소스 스캔 — cells를 직접 인덱싱하지 않는다", () => {
  const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
  /** 셀 맵을 로케일 코드로 인덱싱하는 자리 전부. `Object.hasOwn` 가드만 예외다. */
  const FILES = [
    "lib/keys/query.ts",
    "lib/pull/render.ts",
  ] as const;

  it("`.cells[`는 hasOwn 가드 안에만 있다", () => {
    for (const file of FILES) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const offenders = src
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => /\.cells\[/.test(line) && !/Object\.hasOwn/.test(line));
      expect(offenders, `${file}: Object.hasOwn을 지나야 한다`).toEqual([]);
    }
  });

  /** ⚠️ **대입 쪽이 빠지면 읽기만 고친 반쪽이 된다** — `__proto__` 대입은 키를 조용히 삼킨다. */
  it("셀 맵은 `Object.create(null)`로 만든다", () => {
    const src = readFileSync(join(ROOT, "lib/keys/query.ts"), "utf8");
    expect(src).toContain('const cells: KeyRow["cells"] = Object.create(null)');
  });
});
