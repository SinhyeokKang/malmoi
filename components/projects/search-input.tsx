"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { SearchInput } from "@/components/search-input";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 목록 툴바의 이름 검색 — `?q=` (2026-09-11 사용자).
 *
 * ⚠️ **2026-09-13부터 이것이 목록을 좁히는 유일한 컨트롤이다** (DESIGN §6.63). 필터 탭이 사라지면서
 * "URL을 바꾸는 컨트롤이 둘"이던 상태가 끝났고, 그 부수 효과로 POSTMORTEM 2026-09-12(툴바만 잠가
 * 칩이 이전 쿼리를 다시 제출할 수 있었다)의 부류가 구조적으로 사라진다.
 *
 * ⚠️ **경로를 여기서 조립하지 않는다** — `lib/routes.ts` 한 곳이다 (POSTMORTEM 2026-09-05:
 * 페이지 안의 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다).
 */
export function ProjectSearch({ q, onSearch }: { q: string; onSearch: (query: string) => void }) {
  return (
    <SearchInput
      value={q}
      onSearch={onSearch}
      label={m.projects.search.label}
      placeholder={m.projects.search.placeholder}
    />
  );
}

/**
 * 목록을 거르는 검색어 — **로컬 상태가 먼저고 URL은 `history.replaceState`로 뒤따른다** (audit-ux #17).
 *
 * ⚠️ **서버로 이동하지 않는다.** 거르기는 이미 받은 목록 위의 순수 함수(`listBody`)인데 전엔
 * `router.push`가 페이지 전체를 다시 불렀고, 그 렌더가 원격 신호(최대 8초 — `loadRemoteSignals`)를
 * 기다리는 동안 목록이 굳어 있었다. `replaceState`라 검색마다 히스토리가 쌓이지도 않는다.
 *
 * ⚠️ **초깃값과 동기화의 원천이 `useSearchParams`다, 서버가 준 prop이 아니다.** Next가 `replaceState`를
 * 라우터에 반영하므로 이 값은 늘 주소창과 같다. 서버 prop은 그 페이지를 **처음 그린 때**의 값이라
 * `replaceState`가 바꾸지 못하고, 그것을 원천으로 두면 뒤로가기로 돌아온 화면이 캐시된 렌더의 옛 `q`로
 * 다시 서서 주소(`?q=foo`)와 목록이 갈린다.
 * 주소가 밖에서 바뀌면(뒤로·앞으로·링크) 로컬 값을 그쪽으로 되돌린다 — 렌더 중 조정이라 한 번 더
 * 그리기 전에 화면에 옛 값이 서지 않는다.
 */
export function useProjectQuery(): [string, (query: string) => void] {
  const fromUrl = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(fromUrl);
  const [seen, setSeen] = useState(fromUrl);
  if (seen !== fromUrl) {
    setSeen(fromUrl);
    setQ(fromUrl);
  }
  const search = (query: string) => {
    const next = query.trim();
    setQ(next);
    window.history.replaceState(null, "", routes.projects({ q: next === "" ? undefined : next }));
  };
  return [q, search];
}
