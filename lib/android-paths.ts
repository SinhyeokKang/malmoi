/**
 * **Android 기준 경로 규칙의 유일한 집** — `values[-<qualifier>]/strings.xml`이 `res`·`composeResources` 아래에 있어야 한다.
 * 탐지(`android-strings.ts`)·survey 선택·수동 지정(`lib/onboarding/base-input.ts`)·표면 라벨(`lib/surfaces/plan.ts`)이 전부 이 둘을 쓴다.
 *
 * ⚠️ 사용자 입력 단계(수동 지정)도 느슨하지 않다 — 디렉터리 제한을 풀면 어댑터가 읽지 않는 경로가 기준 파일로 통과해
 * 서버 재탐지(`template-mismatch`)에서야 막힌다.
 * ⚠️ import가 없는 잎이다 — 클라이언트 번들로 가는 모듈(`base-input.ts`)이 `@xml-tools/parser`를 끌어오지 않게 한다.
 */

/** `<prefix>(res|composeResources)/values[-<qualifier>]/strings.xml`. 1은 리소스 디렉터리까지(끝 `/` 포함), 2는 한정자. */
export const ANDROID_STRINGS_FILE = /^((?:[^/]+\/)*(?:res|composeResources)\/)values(?:-([^/]+))?\/strings\.xml$/;

/** `ANDROID_STRINGS_FILE`의 템플릿 형 — 한정자 자리가 `{locale}`이다. 1은 리소스 디렉터리까지(끝 `/` 포함). */
export const ANDROID_STRINGS_TEMPLATE = /^((?:[^/]+\/)*(?:res|composeResources)\/)values-\{locale\}\/strings\.xml$/;

/** 템플릿의 리소스 디렉터리(끝 `/` 포함). Android 템플릿이 아니면 undefined. */
export function androidResourceDir(pathTemplate: string): string | undefined {
  return ANDROID_STRINGS_TEMPLATE.exec(pathTemplate)?.[1];
}

/** 템플릿의 기준 언어 파일(`<dir>values/strings.xml`). Android 템플릿이 아니면 undefined. */
export function androidBasePath(pathTemplate: string): string | undefined {
  const dir = androidResourceDir(pathTemplate);
  return dir === undefined ? undefined : `${dir}values/strings.xml`;
}
