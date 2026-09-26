import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Root } from "mdast";
import { cache } from "react";

import { parseMd } from "./parse";
import { flattenNav, parseSummary, slugToFile, type NavNode } from "./summary";

/**
 * `guide/**.md`를 읽는 유일한 자리. ⚠️ **모듈 최상위에서 읽지 않는다** — md가 함수 번들에서 빠지면
 * import 순간 500이 되어 원인이 가려진다(prisma.config와 같은 부류). 읽기는 함수 안 + 요청 단위 `cache`다.
 *
 * ⚠️ SUMMARY가 없으면 **던진다** — 빈 내비로 삼키면 트레이스 누락이 "모든 페이지 404"로 둔갑한다.
 */
const guideDir = () => join(process.cwd(), "guide");

export const loadSummary = cache((): NavNode[] => parseSummary(parseMd(readFileSync(join(guideDir(), "SUMMARY.md"), "utf8"))));

/** 인자는 SUMMARY에 오른 파일이어야 한다 — slug에서 오는 길은 `loadPageBySlug`다. */
export const loadPage = cache((file: string): Root => parseMd(readFileSync(join(guideDir(), file), "utf8")));

/** 없는 slug·AUTHORING·SHOOTING은 null → 호출자가 `notFound()`. */
export function loadPageBySlug(slug: readonly string[]): { file: string; tree: Root } | null {
  const file = slugToFile(
    slug,
    flattenNav(loadSummary()).map((item) => item.file),
  );
  return file === null ? null : { file, tree: loadPage(file) };
}
