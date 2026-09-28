/**
 * **현재 앱 버전** (`x.y.z`) — LNB Changelog 행의 배지. 정본은 `package.json`의 `version`이고 `next.config.ts`의 `env`가
 * 빌드 때 문자열로 박는다(서버·클라이언트 번들 모두 같은 값).
 *
 * ⚠️ **`package.json`을 여기서 import하지 않는다** — 사이드바(`"use client"`)가 이 모듈을 거쳐 의존성 목록까지 번들에 싣는다.
 * ⚠️ **dev·preview는 마지막 릴리스 번호다** — `version`은 `/merge` 4단계만 올린다. 프로덕션만 그 배포의 번호와 정확히 같다.
 * ⚠️ **함수 안에서 읽는다** — 모듈 최상위 평가 금지(CLAUDE.md). `process.env.APP_VERSION`을 글자 그대로 써야 Next가 인라인한다.
 */
export function appVersion(): string {
  return process.env.APP_VERSION ?? "";
}
