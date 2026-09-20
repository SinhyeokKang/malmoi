import { describe, expect, it } from "vitest";

import { activeLocaleProgress } from "../overview";

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
