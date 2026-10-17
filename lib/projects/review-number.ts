/**
 * `Project.lastPrUrl`에서 PR 번호를 뽑는다.
 *
 * ⚠️ **URL을 믿되 형태만 믿는다** — 이 값은 우리가 `createPr`에서 받아 저장한 것이지만, 옛 행에는
 * 다른 모양이 있을 수 있고 번호가 없으면 **PR 조회를 건너뛴다**(요청 0). 추측한 번호로 남의 PR을
 * 조회하지 않는다.
 *
 * ⚠️ **잎이다** (locale-add E1) — Sources 상세 모달(클라이언트)이 언어 행의 PR 링크를 세운다. 옛 자리 `remote-plan.ts`는 `lib/adapters`를
 * 물어 클라이언트가 못 문다. 그 파일은 같은 이름을 재수출한다. import를 더하지 않는다.
 */
export function pullNumberFrom(url: string | null): number | null {
  if (url === null) return null;
  const matched = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  if (matched === null) return null;
  const parsed = Number(matched[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 저장된 Publish 링크 → 리뷰 번호를 **프로젝트 호스트로** 고른다(gitlab-repositories). GitLab은 `/-/merge_requests/<iid>`다 — `/pull/`을 GitLab에 쓰면
 * `pull`이라는 그룹 이름을 PR로 읽는다. 모르는 호스트는 `null`(요청 0)이다.
 */
export function reviewNumberFrom(url: string | null, repoHost: string): number | null {
  if (repoHost === "github") return pullNumberFrom(url);
  if (repoHost !== "gitlab" || url === null) return null;
  const matched = /\/-\/merge_requests\/(\d+)(?:[/?#]|$)/.exec(url);
  if (matched === null) return null;
  const parsed = Number(matched[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
