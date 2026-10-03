import { matchesAllTokens, searchTokens } from "@/lib/search/match";

/**
 * LNB 프로젝트 스위처의 목록 (2026-09-27 사용자) — 사이드바가 이미 받는 멤버십에서 뽑는다(새 조회 없음).
 *
 * ⚠️ **보관도 싣는다** (2026-09-27 사용자) — 행 오른쪽의 `Archived` 배지가 그것을 말한다. 숨기면 OWNER가 되돌릴 화면에 가는
 * 길이 목록 하나로 줄어든다(PRODUCT "목록에서 숨김을 뒤집었다"와 같은 논거).
 * ⚠️ **순서는 `/projects` 기본 순서를 따른다** — 목록은 그룹 `Needs attention · All set · Archived` 순이라 보관이 맨 뒤다.
 * 앞의 두 그룹을 가르는 판정(`projectGroup`)은 원격·적재 신호가 필요해 셸이 모른다 — 그래서 보관 아닌 것은 멤버십 순서
 * (slug 오름차순) 그대로 두고 보관만 뒤로 보낸다. 안정 정렬이라 각 무리 안의 순서가 유지된다.
 * ⚠️ **이름 대조는 검색·`/projects`와 같은 `matchesAllTokens`다**(search-ux-unify D1) — `lib/projects/list.ts`를 import하지
 * 않는 이유는 그 파일이 온보딩 판정까지 물어 클라이언트 그래프를 넓히기 때문이다. `lib/search/match.ts`는 import 0인 잎이다.
 */
export function switcherProjects<T extends { slug: string; name: string; archived: boolean }>(rows: readonly T[], q: string): T[] {
  const tokens = searchTokens(q);
  const matched = rows.filter((row) => matchesAllTokens(row.name, tokens));
  return [...matched.filter((row) => !row.archived), ...matched.filter((row) => row.archived)];
}
