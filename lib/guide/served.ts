import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseMd } from "./parse";
import { flattenNav, parseSummary } from "./summary";

/**
 * 화면에 닿는 원고 — `SUMMARY.md`(내비 제목) + 거기 오른 페이지. `guideDir` 기준 상대 경로.
 * 문자열 게이트(`no-korean-ui`·`brand-spelling`·`terminology`)가 이 목록만 훑는다 —
 * AUTHORING·SHOOTING은 한국어 매뉴얼이고 서빙되지 않는다.
 *
 * `guide/`나 SUMMARY가 없으면 빈 목록이다(원고가 서기 전). 서빙 쪽 로더는 반대로 던진다(`load.ts`).
 */
export function servedGuideFiles(guideDir: string): string[] {
  const summary = join(guideDir, "SUMMARY.md");
  if (!existsSync(summary)) return [];
  return ["SUMMARY.md", ...flattenNav(parseSummary(parseMd(readFileSync(summary, "utf8")))).map((item) => item.file)];
}
