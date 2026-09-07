import { isRefSafeSlug } from "@/lib/pull/trigger";

/**
 * 프로젝트 slug 판정 (design §5). `Project.slug`에는 DB 제약이 없어 **`syncBranchFor`가 유일한 방어선**이었고
 * 위반은 pull 시점에 `fail()`로 터졌다 — 온보딩이 그것을 통과하는 slug만 만들게 해서 실패를 생성 시점으로
 * 당긴다. 형식 판정은 그쪽의 `isRefSafeSlug`를 **그대로 부른다**: 복사하면 갈리고, 갈리면 온보딩이 만든 slug가
 * pull에서 죽는다 (`__tests__/slug.test.ts`가 두 함수를 교차 검증한다).
 *
 * `checkProjectSlug`는 `lib/push/guard.ts`에 이미 있는 이름이라 여기서는 `planSlug`다.
 */

/** URL 경로·브랜치 이름에 들어간다 — 사람이 읽고 치는 길이여야 한다. */
export const PROJECT_SLUG_MAX = 40;

/** `/projects/new`가 라우트다 — 그 이름의 프로젝트는 설정 화면에 도달할 수 없다 (design §3.11). */
const RESERVED = new Set(["new"]);

export type SlugCheck = "ok" | "empty" | "format" | "too-long" | "reserved";

export function planSlug(slug: string): SlugCheck {
  if (slug === "") return "empty";
  if (slug.length > PROJECT_SLUG_MAX) return "too-long";
  // `syncBranchFor`와 **같은 함수**다 — 조건을 복사하면 하나가 빠진다 (`.lock`이 그랬다).
  if (!isRefSafeSlug(slug)) return "format";
  // git은 대문자를 받지만 URL 경로라 대소문자만 다른 두 프로젝트를 만들지 않는다. `normalizeProjectSlug`가
  // 소문자로 접으므로 여기에 걸리는 것은 사용자가 손으로 친 값이다.
  if (slug !== slug.toLowerCase()) return "format";
  if (RESERVED.has(slug)) return "reserved";
  return "ok";
}

/**
 * 리포명 → slug 후보. 결과는 `planSlug`가 `ok`·`empty`·`reserved` 중 하나를 내는 모양이다 — 형식 오류를
 * 내는 후보를 미리 채우면 사용자가 무엇을 고쳐야 하는지 화면이 설명해야 한다.
 */
export function normalizeProjectSlug(repoName: string): string {
  return (
    repoName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/\.{2,}/g, ".")
      // 선행은 영숫자여야 하고(REF_SAFE_SLUG), 후행 `.`·`-`는 브랜치 이름으로 못 쓰거나 보기 나쁘다.
      .replace(/^[^a-z0-9]+/, "")
      .slice(0, PROJECT_SLUG_MAX)
      .replace(/[.-]+$/, "")
  );
}
