import { routes } from "@/lib/routes";

/**
 * slug → 문서 경로. 내비·이전/다음·장 개요 행처럼 **SUMMARY에서 온 slug**를 잇는 자리다.
 *
 * ⚠️ **`routes.docs(page)`를 부르지 않는다** — 그 생성기의 호출은 인자가 리터럴이어야 한다(호출 스캔 게이트: 대상 페이지를
 * 소스에서 확인할 수 있어야 한다). 여기 slug는 SUMMARY가 이미 해소를 보장한 값이다. 접두는 `routes.docs()`가 정본이다.
 */
export function docHref(slug: readonly string[]): string {
  return `${routes.docs()}${slug.map((part) => `/${part}`).join("")}`;
}
