/**
 * LNB 프로젝트 스위처의 목록 (2026-09-27 사용자) — 사이드바가 이미 받는 멤버십에서 뽑는다(새 조회 없음).
 *
 * ⚠️ **보관은 뺀다** — 옮겨 갈 곳이 아니다. **지금 프로젝트만 예외**다: 빼면 "지금 어디인가"의 체크가 사라진다.
 * ⚠️ **이름 대조는 `/projects` 검색(`lib/projects/list.ts`의 `searchProjects`)과 같은 규칙이다** — trim + 소문자 부분 일치.
 * 그 함수를 import하지 않는 이유는 그 파일이 온보딩 판정까지 물어 클라이언트 그래프를 넓히기 때문이다. 규칙이 갈리면
 * 두 검색창이 같은 질의에 다른 답을 한다 — 고칠 때 둘을 함께 고친다.
 */
export function switcherProjects<T extends { slug: string; name: string; archived: boolean }>(
  rows: readonly T[],
  currentSlug: string | null,
  q: string,
): T[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((row) => (!row.archived || row.slug === currentSlug) && (needle === "" || row.name.toLowerCase().includes(needle)));
}
