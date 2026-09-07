/**
 * 프로젝트 slug가 git 브랜치 이름으로 쓸 수 있는가 — **판정의 단일 출처**다.
 *
 * ⚠️ **`trigger.ts`에서 여기로 옮겼다** (2026-09-07). 그 파일은 `lib/github`(octokit)과
 * `lib/adapters`(→ `ts-dict` → **ts-morph = TypeScript 컴파일러 전체**)를 물고, `lib/onboarding/slug.ts`가
 * 그것을 import하면서 그 그래프가 **클라이언트 번들에 7.2MB 청크로** 들어갔다 — `lib/onboarding/message.ts`를
 * 클라이언트 컴포넌트가 읽기 때문이다. 판정을 잎 모듈로 내리면 규칙은 여전히 한 벌이고 무게는 따라오지
 * 않는다. `components/__tests__/client-graph.test.ts`가 그 경계를 상시로 센다.
 *
 * **import이 없어야 한다.** 여기에 무엇이든 더하는 순간 그것이 클라이언트 번들의 일부가 된다.
 */

/** `git check-ref-format`이 받아주는 문자만. 슬래시를 빼는 것은 `l10n/sync-<slug>`의 세그먼트를 하나로 두려는 것이다. */
export const REF_SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * ⚠️ **`.lock` 접미는 `git check-ref-format`이 컴포넌트 끝에서 거부한다** — 통과시키면 야간 pull의
 * `createRef`가 422이고 원인이 "GitHub이 거절함"으로만 보인다. 정규식만 공유하고 나머지 조건을
 * 복사했을 때 양쪽에서 빠져 있던 구멍이다 (code-review 2026-09-07).
 */
export function isRefSafeSlug(slug: string): boolean {
  return REF_SAFE_SLUG.test(slug) && !slug.includes("..") && !slug.endsWith(".") && !slug.endsWith(".lock");
}
