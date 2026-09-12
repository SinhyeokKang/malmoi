"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LocaleFlag } from "@/components/translations/locale-badge";
import { FilterChips } from "@/components/translations/filter-chips";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/search-input";
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
  chipQuery,
  namespaces,
  locales,
  selected,
  fallback,
}: {
  slug: string;
  /** 지금 URL의 값 — 하나를 바꿔도 나머지가 보존돼야 한다. */
  query: TranslationsQuery;
  chipQuery: TranslationsQuery;
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
  const [pending, startTransition] = useTransition();

  // 툴바와 칩이 같은 잠금을 쓴다. 한쪽만 막으면 다른 쪽이 이전 URL을 다시 제출한다.
  function navigate(next: TranslationsQuery) {
    if (pending) return;
    startTransition(() => router.push(routes.translations(slug, next)));
  }

  function go(next: Partial<TranslationsQuery>) {
    navigate({ ...query, ...next });
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
    <>
      <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
        <Select
          disabled={pending}
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
            <Button className="w-32 justify-between" disabled={pending}>
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
                  disabled={pending || (checked && selected.length === 1)}
                  onCheckedChange={() => toggleLocale(locale.code)}
                >
                  {/*
                    ⚠️ **국기가 표의 배지와 같아야 한다** (2026-09-11 실물). 고르는 자리와 확인하는
                    자리가 다르게 보이면 그 둘이 같은 로케일이라는 것을 사용자가 매번 대조하게 된다.
                    조각은 `LocaleFlag`가 들고, 배지의 pill·`(base)`·orphaned는 **표 문맥**이라 안 온다.
                  */}
                  <span className="flex items-center gap-1.5">
                    <LocaleFlag code={locale.code} />
                    {locale.code}
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <SearchInput
          value={query.q}
          onSearch={(q) => go({ q })}
          disabled={pending}
          label={m.translations.filters.search}
          className="ml-auto"
        />
      </div>
      <FilterChips query={chipQuery} selected={selected} fallback={fallback} pending={pending} onNavigate={navigate} />
    </>
  );
}
