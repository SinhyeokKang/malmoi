"use client";

import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { activeFilters, clearedQuery, type FilterChip } from "@/lib/keys/filters";
import { isKeyState, type TranslationsQuery } from "@/lib/routes";

/**
 * 적용된 필터의 칩 행 (8-4 — DESIGN §6.1).
 *
 * ⚠️ **칩 전체를 링크로 만들지 않는다.** 안에 제거 버튼이 들어가면 상호작용 요소가 중첩되고
 * (접근성으로도 금지다), 그 모양이 정확히 Radix Slot이 던진 자리와 같다 (POSTMORTEM 2026-09-09).
 * 라벨은 평문이고 **제거만 버튼**이다.
 *
 * ⚠️ **판정을 여기서 하지 않는다** — 어떤 칩이 서는지, 떼면 어느 쿼리가 되는지는
 * `lib/keys/filters.ts`(잎)가 든다. 화면이 쿼리를 다시 조립하면 규칙이 두 벌이 된다.
 */
export function FilterChips({
  query,
  selected,
  fallback,
  pending,
  onNavigate,
}: {
  query: TranslationsQuery;
  /** 지금 보이는 로케일과 기본 — 둘을 견줘야 "사용자가 고른 것"인지 알 수 있다. */
  selected: readonly string[];
  fallback: readonly string[];
  pending: boolean;
  onNavigate: (query: TranslationsQuery) => void;
}) {
  const chips = activeFilters(query, { selected, fallback });

  // 칩이 없으면 초기화도 누를 것이 없다 — 죽은 컨트롤을 두지 않는다.
  if (chips.length === 0) return null;

  return (
    /*
      ⚠️ **초기화가 칩 옆이 아니라 줄 오른쪽 끝이다** (2026-09-11 — 시안 `212:4891`: 칩 그룹은
      왼쪽, `IconButton`이 x=1252). 칩 옆에 두면 칩이 늘어날 때마다 그 버튼이 옮겨 다녀 **누를
      자리가 화면마다 달라진다** — 툴바의 검색이 오른쪽에 고정인 것과 같은 축이다.
    */
    <div className="flex items-center justify-between gap-2" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-1">
        {chips.map((chip) => {
          const label = chipLabel(chip);
          return (
            /*
              시안 `Chip` — h32 · `rounded-full` · `bg-muted` · px 8 · gap 4 · 14px.
              ⚠️ **전에는 `text-xs py-0.5`라 높이가 20이었다** — 같은 줄의 컨트롤이 36인데 칩만
              절반이면 필터가 걸려 있다는 사실이 눈에 안 들어온다.
            */
            <span
              key={chip.key}
              className="bg-muted text-foreground flex h-8 items-center gap-1 rounded-full pr-1 pl-2.5 text-sm"
            >
              {label}
              <Button
                variant="ghost"
                size="sm"
                aria-label={m.translations.chips.remove(label)}
                disabled={pending}
                onClick={() => onNavigate(chip.next)}
                className="size-6 rounded-full p-0"
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </span>
          );
        })}
      </div>

      {/*
        ⚠️ `size="icon"`은 존재하지 않는다 — 관용구는 `ghost` + 정사각 유틸이다 (DESIGN §6.4).

        ⚠️ **`RotateCcw`이고 `FilterX`가 아니다** (2026-09-11) — 시안이 `repeat-outlined`(순환
        화살표)이고, **`/projects`의 [Clear filters]와 같은 글리프**다. 이 버튼도 필터만이 아니라
        검색까지 되돌리므로 깔때기 글리프면 지워지는 것이 필터뿐이라고 말하게 된다.
      */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={m.translations.filters.clear}
        disabled={pending}
        onClick={() => onNavigate(clearedQuery(query))}
        className="size-7 shrink-0 rounded-full p-0"
      >
        <RotateCcw className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

/** 라벨은 사전이 든다 — 판정 모듈은 잎이라 `m`을 물지 않는다. */
function chipLabel(chip: FilterChip): string {
  if (chip.key === "namespace") return m.translations.chips.namespace(chip.value);
  if (chip.key === "locales") return m.translations.chips.locales(chip.value);
  if (chip.key === "search") return m.translations.chips.search(chip.value);
  /**
   * ⚠️ **`isKeyState`로 거른 뒤 읽는다** — 값이 `searchParams`에서 온 남의 문자열이라 사전을 직접
   * 인덱싱하면 `Object.prototype`에서 찾아진 것이 라벨 자리에 온다 (POSTMORTEM 2026-09-08).
   * 페이지가 이미 거르지만 그 보증이 이 함수에는 타입으로 안 온다.
   */
  return m.translations.chips.state(isKeyState(chip.value) ? m.translations.states[chip.value] : chip.value);
}
