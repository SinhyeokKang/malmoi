"use client";

import { useRouter } from "next/navigation";

import { SearchInput } from "@/components/search-input";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 목록 툴바의 이름 검색 — `?q=` (2026-09-11 사용자).
 *
 * **URL이 상태다.** 필터 탭(`?filter=`)과 같은 축이라 뒤로가기·공유·새로고침이 그냥 되고, 서버가
 * 이미 걸러 그리므로 목록 페이지는 서버 컴포넌트로 남는다.
 *
 * ⚠️ **경로를 여기서 조립하지 않는다** — `lib/routes.ts` 한 곳이다 (POSTMORTEM 2026-09-05:
 * 페이지 안의 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다).
 */
export function ProjectSearch({ filter, q }: { filter: string | undefined; q: string | undefined }) {
  const router = useRouter();
  return (
    <SearchInput
      value={q}
      onSearch={(query) => router.push(routes.projects({ filter, q: query === "" ? undefined : query }))}
      label={m.projects.search.label}
      placeholder={m.projects.search.placeholder}
    />
  );
}
