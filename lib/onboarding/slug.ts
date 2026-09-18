import { isRefSafeSlug } from "@/lib/pull/ref-slug";

/**
 * 프로젝트 slug 판정 (ARCHITECTURE §3.1). `Project.slug`에는 DB 제약이 없어 **`syncBranchFor`가 유일한 방어선**이었고
 * 위반은 pull 시점에 `fail()`로 터졌다 — 온보딩이 그것을 통과하는 slug만 만들게 해서 실패를 생성 시점으로
 * 당긴다. 형식 판정은 `lib/pull/ref-slug.ts`의 `isRefSafeSlug`를 **그대로 부른다**: 복사하면 갈리고, 갈리면 온보딩이 만든 slug가
 * pull에서 죽는다 (`__tests__/slug.test.ts`가 두 함수를 교차 검증한다).
 *
 * `checkProjectSlug`는 `lib/push/guard.ts`에 이미 있는 이름이라 여기서는 `planSlug`다.
 */

/** URL 경로·브랜치 이름에 들어간다 — 사람이 읽고 치는 길이여야 한다. */
export const PROJECT_SLUG_MAX = 40;

/** `/projects/new`가 라우트다 — 그 이름의 프로젝트는 설정 화면에 도달할 수 없다 (PRODUCT §7.7). */
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

/**
 * 주소가 이미 쓰였을 때의 대안 하나.
 *
 * ⚠️ **존재 확인이 없다.** 그래서 문구가 `Try another, such as <alt>.`이고 `<alt> is free`가 아니다 —
 * 확인한 적 없는 것을 단언하면 POSTMORTEM 2026-09-09(문서가 단언한 통제를 코드가 안 했다)의 모양이 된다.
 *
 * 형식이 이미 깨진 값에는 제안하지 않는다 — 고쳐야 할 곳이 번호가 아니라 형식이라, 번호를 붙이면
 * 사용자가 같은 오류를 한 번 더 만난다. `undefined`면 화면이 대안 문장을 통째로 뺀다.
 */
export function suggestAlternateSlug(slug: string): string | undefined {
  if (planSlug(slug) === "format") return undefined;
  const match = /^(.*?)-(\d+)$/.exec(slug);
  const stem = match?.[1] ?? slug;
  const next = String(Number(match?.[2] ?? 1) + 1);
  const suffix = `-${next}`;
  // 상한을 넘으면 **앞을** 자른다 — 번호가 잘리면 대안이 아니라 다른 이름이 된다. 자른 끝이 `.`·`-`면
  // `REF_SAFE_SLUG`가 거부하므로 함께 턴다.
  const head = stem.slice(0, PROJECT_SLUG_MAX - suffix.length).replace(/[.-]+$/, "");
  const alt = `${head}${suffix}`;
  return planSlug(alt) === "ok" ? alt : undefined;
}
