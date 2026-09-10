"use client";

import { FilterX, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { activeFilters, clearedQuery, type FilterChip } from "@/lib/keys/filters";
import { routes, type TranslationsQuery } from "@/lib/routes";

/**
 * 적용된 필터의 칩 행 (8-4 design §1·§3.5).
 *
 * ⚠️ **칩 전체를 링크로 만들지 않는다.** 안에 제거 버튼이 들어가면 상호작용 요소가 중첩되고
 * (접근성으로도 금지다), 그 모양이 정확히 Radix Slot이 던진 자리와 같다 (POSTMORTEM 2026-09-09).
 * 라벨은 평문이고 **제거만 버튼**이다.
 *
 * ⚠️ **판정을 여기서 하지 않는다** — 어떤 칩이 서는지, 떼면 어느 쿼리가 되는지는
 * `lib/keys/filters.ts`(잎)가 든다. 화면이 쿼리를 다시 조립하면 규칙이 두 벌이 된다.
 */
export function FilterChips({
  slug,
  query,
  selected,
  fallback,
}: {
  slug: string;
  query: TranslationsQuery;
  /** 지금 보이는 로케일과 기본 — 둘을 견줘야 "사용자가 고른 것"인지 알 수 있다. */
  selected: readonly string[];
  fallback: readonly string[];
}) {
  const router = useRouter();
  const chips = activeFilters(query, { selected, fallback });

  // 칩이 없으면 초기화도 누를 것이 없다 — 죽은 컨트롤을 두지 않는다.
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((chip) => {
        const label = chipLabel(chip);
        return (
          <span
            key={chip.key}
            className="bg-muted text-foreground flex items-center gap-0.5 rounded-full py-0.5 pr-0.5 pl-2.5 text-xs"
          >
            {label}
            <Button
              variant="ghost"
              size="sm"
              aria-label={m.translations.chips.remove(label)}
              onClick={() => router.push(routes.translations(slug, chip.next))}
              className="size-5 rounded-full p-0"
            >
              <X className="size-3" aria-hidden />
            </Button>
          </span>
        );
      })}

      {/* ⚠️ `size="icon"`은 존재하지 않는다 — 관용구는 `ghost` + 정사각 유틸이다 (DESIGN §6.4). */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={m.translations.filters.clear}
        onClick={() => router.push(routes.translations(slug, clearedQuery(query)))}
        className="ml-1 size-7 p-0"
      >
        <FilterX aria-hidden />
      </Button>
    </div>
  );
}

/** 라벨은 사전이 든다 — 판정 모듈은 잎이라 `m`을 물지 않는다. */
function chipLabel(chip: FilterChip): string {
  if (chip.key === "namespace") return m.translations.chips.namespace(chip.value);
  if (chip.key === "locales") return m.translations.chips.locales(chip.value);
  return m.translations.chips.search(chip.value);
}
