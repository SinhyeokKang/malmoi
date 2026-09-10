"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
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
  const [text, setText] = useState(q ?? "");

  // 뒤로 가기·탭 이동으로 URL의 `q`가 바뀌면 입력도 따라간다.
  useEffect(() => setText(q ?? ""), [q]);

  function go(next: string) {
    const trimmed = next.trim();
    router.push(routes.projects({ filter, q: trimmed === "" ? undefined : trimmed }));
  }

  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2 size-4" aria-hidden />
      {/*
        ⚠️ **`<form>` + 암시적 submit을 쓰지 않는다** (POSTMORTEM 2026-09-08). 제출 버튼이 없는 폼은
        입력에서 Enter를 눌러도 submit이 일어나지 않아 검색이 조용히 무효였다 — 번역 화면 툴바가
        같은 이유로 Enter를 직접 받는다.

        ⚠️ **`type="search"`의 네이티브 ✕는 `onChange`만 쏜다** — 그것만으로 URL이 안 바뀌므로
        비었을 때도 Enter로 확정된다(빈 질의는 `q`를 URL에서 뺀다).
      */}
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go(text);
          }
        }}
        placeholder={m.projects.search.placeholder}
        aria-label={m.projects.search.label}
        className="w-64 pl-8"
      />
    </div>
  );
}
