"use client";

import { useRouter } from "next/navigation";

import { SearchInput } from "@/components/search-input";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 목록 툴바의 이름 검색 — `?q=` (2026-09-11 사용자).
 *
 * **URL이 상태다.** 뒤로가기·공유·새로고침이 그냥 되고, 서버가 이미 걸러 그리므로 목록 페이지는
 * 서버 컴포넌트로 남는다.
 *
 * ⚠️ **2026-09-13부터 이것이 목록을 좁히는 유일한 컨트롤이다** (DESIGN §6.63). 필터 탭이 사라지면서
 * "URL을 바꾸는 컨트롤이 둘"이던 상태가 끝났고, 그 부수 효과로 POSTMORTEM 2026-09-12(툴바만 잠가
 * 칩이 이전 쿼리를 다시 제출할 수 있었다)의 부류가 구조적으로 사라진다.
 *
 * ⚠️ **경로를 여기서 조립하지 않는다** — `lib/routes.ts` 한 곳이다 (POSTMORTEM 2026-09-05:
 * 페이지 안의 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다).
 */
export function ProjectSearch({ q }: { q: string | undefined }) {
  const router = useRouter();
  return (
    <SearchInput
      value={q}
      onSearch={(query) => router.push(routes.projects({ q: query === "" ? undefined : query }))}
      label={m.projects.search.label}
      placeholder={m.projects.search.placeholder}
    />
  );
}
