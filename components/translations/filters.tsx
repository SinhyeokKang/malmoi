"use client";

import { ListFilter, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { m } from "@/lib/i18n";
import { routes, type TranslationsQuery } from "@/lib/routes";

/**
 * 툴바의 필터 셋 — 검색 `?q=` · 상태 `?state=` · 기준 로케일 `?focus=` (design §3.3).
 *
 * **URL이 상태다.** 서버 렌더 필터라 링크를 공유할 수 있고 새로고침에 살아남는다 — 클라이언트
 * 상태로 두면 903키 화면에서 "내가 보던 것"을 다시 만들 방법이 없다.
 *
 * ⚠️ **경로를 여기서 조립하지 않는다** — `lib/routes.ts` 한 곳이다 (POSTMORTEM 2026-09-05:
 * 페이지 안의 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다).
 */
export function TranslationFilters({
  slug,
  query,
  locales,
}: {
  slug: string;
  /** 지금 URL의 값 — 하나를 바꿔도 나머지가 보존돼야 한다. */
  query: TranslationsQuery;
  /** 기준 로케일 후보. base가 맨 앞이다. */
  locales: readonly string[];
}) {
  const router = useRouter();
  const [text, setText] = useState(query.q ?? "");

  // 뒤로 가기·다른 네임스페이스 이동으로 URL의 `q`가 바뀌면 입력도 따라간다.
  useEffect(() => setText(query.q ?? ""), [query.q]);

  function go(next: Partial<TranslationsQuery>) {
    router.push(routes.translations(slug, { ...query, ...next }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        ⚠️ **`<form>` + 암시적 submit을 쓰지 않는다** (2026-09-08 실물 검증). 제출 버튼이 없는 폼은
        입력에서 Enter를 눌러도 submit이 일어나지 않아 검색이 조용히 무효였다 — CDP 원시 키까지
        먹여 봐도 같았다. 필터에 [Search] 버튼을 두지 않는 것이 이 툴바의 형이므로(GitLab 필터 바와
        같다) Enter를 직접 받는다.
      */}
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-2 left-2 size-4" aria-hidden />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go({ q: text.trim() });
            }
          }}
          placeholder={m.translations.filters.search}
          aria-label={m.translations.filters.search}
          className="w-56 pl-8"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <ListFilter className="text-muted-foreground size-4" aria-hidden />
        <Select
          value={query.state ?? ""}
          aria-label={m.translations.filters.state}
          onChange={(e) => {
            const value = e.target.value;
            go({ state: value === "" ? undefined : (value as TranslationsQuery["state"]) });
          }}
        >
          <option value="">{m.translations.filters.stateAny}</option>
          <option value="needs-review">{m.translations.needsReview}</option>
          <option value="untranslated">{m.translations.untranslated}</option>
        </Select>
      </div>

      {/* 집계와 상태 필터가 보는 로케일. 표는 전 로케일을 열로 펼치므로 이건 "기준"이지 필터가 아니다. */}
      <Select
        value={query.focus ?? ""}
        aria-label={m.translations.filters.focus}
        onChange={(e) => go({ focus: e.target.value })}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </Select>
    </div>
  );
}
