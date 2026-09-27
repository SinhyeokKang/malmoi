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

/**
 * sync 브랜치 이름의 접두. `syncBranchFor`와 온보딩 ③의 힌트가 같이 쓴다 — 힌트가 사본을 들면 규칙과 갈려 사용자가 PR을
 * 못 찾는다(launch-readiness L7.5). 잎에 두는 이유는 위와 같다.
 */
export const SYNC_BRANCH_PREFIX = "malmoi-i18n/sync-";

/**
 * **base 브랜치가 될 수 없는 이름** (malmoi#126) — Malmoi가 force update하는 산출물이다. base가 되면 Sync는 미머지 산출물을 읽고
 * Publish는 그 브랜치에서 자기 자신으로 PR을 낸다. ⚠️ **이 프로젝트 것만이 아니라 접두 전체다** — 같은 리포의 다른 프로젝트 sync
 * 브랜치도 같은 산출물이다. 목록 필터(`planBranchChoice`)와 저장 거부(설정·온보딩 Action)가 이 하나를 쓴다.
 */
export function isSyncBranchName(name: string): boolean {
  return name.startsWith(SYNC_BRANCH_PREFIX);
}

/** `git check-ref-format`이 받아주는 문자만. 슬래시를 빼는 것은 `malmoi-i18n/sync-<slug>`의 세그먼트를 하나로 두려는 것이다. */
export const REF_SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * ⚠️ **`.lock` 접미는 `git check-ref-format`이 컴포넌트 끝에서 거부한다** — 통과시키면 야간 pull의
 * `createRef`가 422이고 원인이 "GitHub이 거절함"으로만 보인다. 정규식만 공유하고 나머지 조건을
 * 복사했을 때 양쪽에서 빠져 있던 구멍이다 (code-review 2026-09-07).
 */
export function isRefSafeSlug(slug: string): boolean {
  return REF_SAFE_SLUG.test(slug) && !slug.includes("..") && !slug.endsWith(".") && !slug.endsWith(".lock");
}
