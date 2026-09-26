import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Root } from "mdast";
import { cache } from "react";

import { parseMd } from "./parse";
import { parseMdTable } from "./sections";
import { shotSizes, type ShotSize } from "./shots";
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

/**
 * 에셋 → 치수(렌더러의 `<img width height>`). SHOOTING이 없으면 빈 표다 — 이미지 없는 가이드는 촬영 매뉴얼 없이 선다
 * (있는 이미지에 매뉴얼이 없는 것은 이미지 게이트가 막는다).
 *
 * ⚠️ **열을 이름이 아니라 순서로 읽는다**(에셋 · 소스 · blob · 치수) — 열 이름이 한국어이고 `lib/`는 `no-korean-ui`가 훑는다.
 * 순서가 이름과 어긋나지 않는지는 `load.test.ts`가 실물 SHOOTING으로 잰다.
 */
export const loadShotSizes = cache((): Record<string, ShotSize> => {
  const path = join(guideDir(), "SHOOTING.md");
  if (!existsSync(path)) return shotSizes([]);
  const rows = parseMdTable(parseMd(readFileSync(path, "utf8")), "shots") ?? [];
  return shotSizes(
    rows.map((row) => {
      const cells = Object.values(row);
      return { asset: cells[0] ?? "", size: cells[3] ?? "" };
    }),
  );
});

/** 없는 slug·AUTHORING·SHOOTING은 null → 호출자가 `notFound()`. */
export function loadPageBySlug(slug: readonly string[]): { file: string; tree: Root } | null {
  const file = slugToFile(
    slug,
    flattenNav(loadSummary()).map((item) => item.file),
  );
  return file === null ? null : { file, tree: loadPage(file) };
}
