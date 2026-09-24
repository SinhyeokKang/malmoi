import { fail } from "@/lib/failure";

import { isRefSafeSlug, SYNC_BRANCH_PREFIX } from "./ref-slug";

/**
 * ⚠️ **`./trigger`에서 여기로 옮겼다** (2026-09-24, audit #90). 이름 하나를 얻으려고 페이지·`open-pr`·스모크가
 * `trigger.ts`를 물면 `lib/github`(octokit)과 `lib/pull/run`(→ 어댑터 → ts-morph) 그래프가 함께 따라온다 —
 * 서버라 번들 사고는 아니지만 테스트가 그 모듈을 통째로 mock해야 했다. 이 파일은 `lib/failure` 하나만 문다
 * (`fail`의 `AppError`라야 이 문구가 500 본문에 그대로 실린다). 잎은 아니다 — 클라이언트는 `./ref-slug`를 읽는다.
 */

/**
 * 프로젝트의 sync 브랜치 이름. **누적 히스토리가 아니라 "현재 DB 상태의 스냅샷"이라**
 * 매 pull마다 force update된다 (ARCHITECTURE §3).
 *
 * ⚠️ **slug가 이름에 들어가는 것이 요지다.** 예전에는 상수 `malmoi-i18n/sync` 하나였는데, 한 리포에
 * 번역 표면이 둘이면 Project가 둘이 되고(PRODUCT §7.1) **그 둘이 같은 브랜치를 force update로
 * 서로 덮는다.** 그때는 순차 실행으로 피해 갔고, bugshot-2가 정확히
 * 그 모양이다 (`_locales` 4키 + `ts-dict` 903키).
 *
 * `Project.slug`에는 형식 제약이 없으므로(`slug String @unique`) **여기가 유일한 방어선이다.**
 * 안 막으면 `createRef`가 422로 죽고 원인이 "GitHub이 거절함"으로만 보인다.
 */
export function syncBranchFor(slug: string): string {
  if (!isRefSafeSlug(slug)) {
    fail(`project slug is not usable as a git branch name: ${JSON.stringify(slug)}`);
  }
  return `${SYNC_BRANCH_PREFIX}${slug}`;
}
