import { chromeLocales } from "./chrome-locales";
import { jsonCatalog } from "./json-catalog";
import { tsDict } from "./ts-dict";
import type { Adapter, DetectedFormat, FileProbe } from "./types";

export { chromeLocales } from "./chrome-locales";
export { jsonCatalog } from "./json-catalog";
export { tsDict } from "./ts-dict";
export { localeFromPath } from "./chrome-locales";
export { namespaceOf } from "./shared";
export * from "./types";

/**
 * 등록된 어댑터. **순서가 우선순위다** — 크롬 `_locales`가 있으면 그쪽을 택한다.
 * 크롬 확장 리포는 `_locales`가 실제 배포 산출물이고, 옆에 다른 카탈로그가 있어도
 * 크롬이 읽는 건 `_locales`뿐이다.
 */
export const ADAPTERS: readonly Adapter[] = [chromeLocales, jsonCatalog, tsDict];

/** 리포 파일 경로 목록에서 로케일 포맷을 찾는다. 못 찾으면 undefined — 연동 불가다. */
export function detectFormat(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  for (const adapter of ADAPTERS) {
    const found = adapter.detect(paths, probe);
    if (found) return found;
  }
  return undefined;
}

export function adapterFor(format: DetectedFormat): Adapter {
  const found = ADAPTERS.find((a) => a.name === format.adapter);
  if (!found) throw new Error(`등록되지 않은 어댑터: ${format.adapter}`);
  return found;
}
