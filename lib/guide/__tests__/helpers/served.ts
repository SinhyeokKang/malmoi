import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseMd } from "@/lib/guide/parse";
import { flattenNav, parseSummary } from "@/lib/guide/summary";
import { UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";

/**
 * 화면에 닿는 원고 — `SUMMARY.md`(내비 제목) + 거기 오른 페이지. `guideDir` 기준 상대 경로.
 * 문자열 게이트(`no-korean-ui`·`brand-spelling`·`terminology`)가 이 목록만 훑는다 —
 * AUTHORING·SHOOTING은 한국어 매뉴얼이고 서빙되지 않는다.
 *
 * `guide/`나 SUMMARY가 없으면 빈 목록이다(원고가 서기 전). 서빙 쪽 로더는 반대로 던진다(`load.ts`).
 *
 * 테스트 전용 헬퍼다 — `describe`가 없어 여러 게이트가 import해도 검사가 두 번 등록되지 않는다.
 */
export function servedGuideFiles(guideDir: string): string[] {
  const summary = join(guideDir, "SUMMARY.md");
  if (!existsSync(summary)) return [];
  return ["SUMMARY.md", ...flattenNav(parseSummary(parseMd(readFileSync(summary, "utf8")))).map((item) => item.file)];
}

/**
 * **존재하는 언어 트리** — `guide/<uiLocale>/SUMMARY.md`가 있는 언어만, `UI_LOCALES` 순서로. en이 원문이라 맨 앞이다.
 * ⚠️ 없는 언어는 빠진다 — 번역 원고가 다른 커밋에서 들어오므로 커밋마다 green이어야 한다(ui-locales tasks I1).
 * 들어온 트리는 그때부터 구조 동형·문자열 게이트가 자동으로 붙잡는다.
 */
export function guideTrees(guideRoot: string): { uiLocale: UiLocale; dir: string }[] {
  return UI_LOCALES.flatMap((uiLocale) => {
    const dir = join(guideRoot, uiLocale);
    return existsSync(join(dir, "SUMMARY.md")) ? [{ uiLocale, dir }] : [];
  });
}
