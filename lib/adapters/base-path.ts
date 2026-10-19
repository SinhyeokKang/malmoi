/**
 * **기준 언어 파일 경로** (mobile-strings design §2). Android의 `values/strings.xml`처럼 `{locale}` 치환으로 표현되지 않는 기준 경로만
 * `basePath`가 들고, 그 밖의 표면(null·없음)은 지금처럼 템플릿 치환이다.
 *
 * ⚠️ **치환 자리를 이 함수 하나로 모으지 않았다** (사용자 결정 2026-10-19 — 이관 범위가 넓다). 기준 언어가 지나는 자리만 이 함수로
 * 분기하고, 그 자리 전수는 `__tests__/base-path-sites.test.ts`가 센다.
 *
 * ⚠️ import가 없는 잎이다 — `lib/locales/`처럼 어댑터 그래프를 끌지 않는 모듈도 쓴다.
 */
export function baseFilePath(format: { pathTemplate: string; basePath?: string | null }, baseLocale: string): string {
  return format.basePath ?? format.pathTemplate.replaceAll("{locale}", baseLocale);
}
