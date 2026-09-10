"use client";

import { ChevronDown, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { m } from "@/lib/i18n";
import { ALL_NAMESPACES, routes, type TranslationsQuery } from "@/lib/routes";

/**
 * 툴바 셋 — 네임스페이스 `Select` · 로케일 다중 선택 · 검색 (8-4 design §1).
 *
 * **URL이 상태다.** 서버 렌더 필터라 링크를 공유할 수 있고 새로고침에 살아남는다 — 클라이언트
 * 상태로 두면 903키 화면에서 "내가 보던 것"을 다시 만들 방법이 없다.
 *
 * ⚠️ **왼쪽 `NamespacePanel`이 사라졌다** (8-4) — 네임스페이스 드롭다운이 그 역할을 통째로
 * 가져간다. 둘을 함께 두면 같은 필터가 두 곳이고 하나가 낡는다(`invite-form.tsx`와 같은 판정).
 *
 * ⚠️ **경로를 여기서 조립하지 않는다** — `lib/routes.ts` 한 곳이다 (POSTMORTEM 2026-09-05:
 * 페이지 안의 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다).
 *
 * ⚠️ **칩이 아닌 컨트롤은 `{...query}`를 보존한다** — ns를 바꾸는 순간 로케일 선택과 검색어가
 * URL에서 날아가면 안 된다 (design §2).
 *
 * ⚠️ **네임스페이스가 52개인 프로젝트에서 검색 없는 native 목록이다** — 감수 항목이고 이 배송에서
 * 고치지 않는다.
 */
export function TranslationFilters({
  slug,
  query,
  namespaces,
  locales,
  selected,
  fallback,
}: {
  slug: string;
  /** 지금 URL의 값 — 하나를 바꿔도 나머지가 보존돼야 한다. */
  query: TranslationsQuery;
  /** 드롭다운 옵션. 순서·집계는 `namespaceCountsFor`가 정한 그대로다. */
  namespaces: readonly { namespace: string; pending: number; total: number }[];
  /** 프로젝트의 로케일 — base가 맨 앞이다. */
  locales: readonly { code: string; orphaned: boolean }[];
  /** 지금 보이는 로케일 (`parseLocaleSelection`). */
  selected: readonly string[];
  /** 선택이 없을 때의 기본. 같으면 `?locales=`를 URL에 싣지 않는다. */
  fallback: readonly string[];
}) {
  const router = useRouter();
  const [text, setText] = useState(query.q ?? "");

  // 뒤로 가기·다른 네임스페이스 이동으로 URL의 `q`가 바뀌면 입력도 따라간다.
  useEffect(() => setText(query.q ?? ""), [query.q]);

  function go(next: Partial<TranslationsQuery>) {
    router.push(routes.translations(slug, { ...query, ...next }));
  }

  function toggleLocale(code: string) {
    const on = selected.includes(code);
    // 순서는 URL이 아니라 로케일 목록이 정한다 — 같은 선택이 두 링크에서 다르게 보이지 않는다.
    const next = locales
      .map((l) => l.code)
      .filter((c) => (c === code ? !on : selected.includes(c)));
    const param = next.join(",");
    // 기본과 같으면 파라미터를 싣지 않는다 — URL에 안 보이는 상태를 남기지 않는다.
    go({ locales: param === fallback.join(",") ? undefined : param });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={query.ns ?? ALL_NAMESPACES}
        aria-label={m.translations.filters.namespace}
        onChange={(e) => go({ ns: e.target.value })}
        className="w-40"
      >
        <option value={ALL_NAMESPACES}>{m.translations.allNamespaces}</option>
        {namespaces.map((ns) => (
          <option key={ns.namespace} value={ns.namespace}>
            {m.translations.filters.namespaceOption(ns.namespace, ns.pending, ns.total)}
          </option>
        ))}
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-32 justify-between">
            {m.translations.filters.locales}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {locales.map((locale) => {
            const checked = selected.includes(locale.code);
            return (
              <DropdownMenuCheckboxItem
                key={locale.code}
                checked={checked}
                /**
                 * ⚠️ **마지막 하나는 뗄 수 없다.** 선택이 비면 `parseLocaleSelection`이 폴백으로
                 * 되돌아가 **전체로 넓어지는데**, 그러면 "지우기"가 넓힘이 되어 사용자가 기대한
                 * 것과 반대다. 전체로 돌아가는 길은 칩의 제거다.
                 */
                disabled={checked && selected.length === 1}
                onCheckedChange={() => toggleLocale(locale.code)}
              >
                <span className="text-mono">{locale.code}</span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
        ⚠️ **`<form>` + 암시적 submit을 쓰지 않는다** (2026-09-08 실물 검증). 제출 버튼이 없는 폼은
        입력에서 Enter를 눌러도 submit이 일어나지 않아 검색이 조용히 무효였다 — CDP 원시 키까지
        먹여 봐도 같았다. 필터에 [Search] 버튼을 두지 않는 것이 이 툴바의 형이므로 Enter를 직접 받는다.
      */}
      <div className="relative ml-auto">
        <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2 size-4" aria-hidden />
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
          className="w-64 pl-8"
        />
      </div>
    </div>
  );
}
