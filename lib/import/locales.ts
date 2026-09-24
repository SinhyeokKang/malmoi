import type { Adapter, DetectedFormat } from "@/lib/adapters";
import { compareKeys } from "@/lib/adapters/shared";
import { localeOfTemplatePath } from "@/lib/onboarding/confirm";

/**
 * **재탐지 로케일에 다운로드 실패 로케일을 되살린다** (delivery-invariants D6 · 감사 #59).
 *
 * 수동 Sync의 재탐지(`planConfirmedFormat`)는 **첫 다운로드에 성공한 파일로만** 로케일을 만들고, 재시도는 blob만 채운다. 그 로케일
 * 목록이 `payload.locales`가 되어 적재가 빠진 로케일을 orphan시켰다 — fr blob 한 번의 일시 실패가 재시도 성공과 무관하게 fr을 지웠다.
 * 경로는 **트리**에서 온 `attempted`다: 읽힌 로케일은 적재되고, 끝내 못 읽은 로케일은 번역 없이 목록에만 남아 orphan되지 않는다
 * (`partial-import`가 그 사실을 말한다).
 *
 * multi-locale은 경로가 로케일을 말하지 않는다 — 재탐지 결과 그대로다.
 */
export function localesToKeep(input: { format: DetectedFormat; layout: Adapter["layout"]; attempted: readonly string[] }): string[] {
  if (input.layout !== "per-locale") return [...input.format.locales];
  const fromPaths = input.attempted.flatMap(path => {
    const locale = localeOfTemplatePath(input.format.pathTemplate, path);
    return locale === undefined ? [] : [locale];
  });
  return [...new Set([...input.format.locales, ...fromPaths])].sort(compareKeys);
}
