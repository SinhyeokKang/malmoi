"use client";

import { ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EVENT_RESULTS, LOG_KINDS, type EventResult, type LogKind } from "@/lib/events/payload";
import { PROJECT_WIDE, clearedLogsQuery, logsQuery, type LogFilter } from "@/lib/events/filter";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * 필터 다섯 + 검색 + [Refresh] (캔버스 `1a`·`1m`).
 *
 * ⚠️ **[Apply]가 없다** — 고를 때마다 URL이 바뀌고 서버가 목록을 다시 그린다. 클라이언트 상태는
 * **드롭다운 열림 하나**이고, 좁히는 축은 전부 URL에 산다(새로고침·뒤로가기·공유가 그냥 된다).
 *
 * ⚠️ **필터가 바뀌면 커서를 버린다** — 이전 조합의 커서를 재사용하면 첫 페이지가 통째로 비거나
 * 중간부터 시작한다. `logsQuery`가 커서를 싣지 않는 것이 그 판정이고, 그래서 여기서 손으로 지우지 않는다.
 *
 * ⚠️ **단일 선택 셋과 다중 선택 둘의 프리미티브가 다르다** — `DropdownMenuItem`은 고르면 닫히고
 * `DropdownMenuCheckboxItem`은 `role="menuitemcheckbox"`로 열린 채 여러 개를 켠다. 시각 표시만
 * 다른 것이 아니라 **접근성 트리의 상태**가 다르다.
 */
export function LogFilters({
  slug,
  filter,
  sources,
  actors,
  /** 보관된 프로젝트에는 [Refresh]가 없다 — 진행 중 실행이 생길 수 없다 (캔버스 `1j`). */
  refreshable,
}: {
  slug: string;
  filter: LogFilter;
  sources: readonly { slug: string }[];
  actors: readonly { id: string; label: string }[];
  refreshable: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(filter.q ?? "");
  const [previousQuery, setPreviousQuery] = useState(filter.q);
  // 뒤로 가기·필터 초기화가 URL을 바꾸면 작성 중이던 옛 검색어를 다시 제출하지 않는다.
  if (previousQuery !== filter.q) {
    setPreviousQuery(filter.q);
    setQuery(filter.q ?? "");
  }

  /** ⚠️ **좁히는 축이 바뀌면 커서를 뺀다** — `logsQuery`가 새 필터로 다시 조립한다. */
  const go = (next: Partial<LogFilter>) => {
    router.push(routes.logs(slug, logsQuery({ ...filter, ...next, cursor: null })));
  };

  const toggle = (list: readonly string[], value: string): string[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const narrowed =
    filter.kind !== "all" ||
    filter.from !== null ||
    filter.to !== null ||
    filter.actor !== null ||
    filter.sources.length > 0 ||
    filter.results.length > 0 ||
    filter.q !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.logs}</h1>
        {!refreshable && <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">{m.logs.archived.badge}</span>}
        <div className="ml-auto flex items-center gap-2">
          <form
            className="border-border flex h-9 w-50 items-center gap-2 rounded-[10px] border px-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              go({ q: query.trim() === "" ? null : query.trim() });
            }}
          >
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            {/* ⚠️ **프리미티브를 지난다** — 화면이 raw 태그를 쓰면 포커스 링이 그 한 곳만 빠진다 (DESIGN §7). */}
            <Input
              type="search"
              aria-label={m.logs.search.label}
              placeholder={m.logs.search.placeholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </form>
          {refreshable && (
            /*
              ⚠️ **자동 갱신이 없다** — `Running…`이 조회 시점 스냅샷이라는 사실을 이 버튼 하나가 든다.
              폴링·스트리밍은 넣지 않는다(리포에 폴링 0건).
            */
            <Button type="button" variant="default" onClick={() => router.refresh()} className="gap-1.5">
              <RefreshCw className="size-4 shrink-0" aria-hidden />
              {m.logs.refresh}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter axis={m.logs.filters.axis.kind} label={filter.kind === "all" ? m.logs.kinds.all : m.logs.kinds[filter.kind]} on={filter.kind !== "all"}>
          {LOG_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} selected={filter.kind === kind} onSelect={() => go({ kind })}>
              {m.logs.kinds[kind]}
            </DropdownMenuItem>
          ))}
        </Filter>

        <Filter axis={m.logs.filters.axis.date} label={dateLabel(filter)} on={filter.from !== null || filter.to !== null}>
          <DropdownMenuItem selected={filter.from === null && filter.to === null} onSelect={() => go({ from: null, to: null })}>
            {m.logs.filters.anyDate}
          </DropdownMenuItem>
          {PRESETS.map((preset) => (
            <DropdownMenuItem key={preset.key} onSelect={() => go(preset.range())}>
              {m.logs.range[preset.key]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{m.logs.range.custom}</DropdownMenuLabel>
          {/*
            ⚠️ **네이티브 `<input type="date">` 둘이다** (결정 9) — 라이브러리도 새 프리미티브도 넣지
            않는다. 피커 모양을 브라우저가 정하므로 시안과 픽셀이 갈리는 것이 **의도된 이탈**이다.
            ⚠️ `onSelect`를 막는다 — 안 막으면 입력을 누르는 순간 메뉴가 닫힌다.
          */}
          <div className="flex items-center gap-1.5 px-2 py-1.5" onKeyDown={(event) => event.stopPropagation()}>
            <Input
              type="date"
              aria-label={m.logs.range.from}
              defaultValue={filter.from ?? ""}
              onChange={(event) => go({ from: event.target.value === "" ? null : event.target.value })}
              className="h-8 min-w-0 flex-1 font-mono text-xs"
            />
            <span className="text-muted-foreground shrink-0 text-xs">–</span>
            <Input
              type="date"
              aria-label={m.logs.range.to}
              defaultValue={filter.to ?? ""}
              onChange={(event) => go({ to: event.target.value === "" ? null : event.target.value })}
              className="h-8 min-w-0 flex-1 font-mono text-xs"
            />
          </div>
        </Filter>

        <Filter axis={m.logs.filters.axis.actor} label={actorLabel(filter, actors)} on={filter.actor !== null}>
          <DropdownMenuItem selected={filter.actor === null} onSelect={() => go({ actor: null })}>
            {m.logs.filters.anyone}
          </DropdownMenuItem>
          {actors.length > 0 && <DropdownMenuLabel>{m.logs.filters.people}</DropdownMenuLabel>}
          {actors.map((actor) => (
            <DropdownMenuItem key={actor.id} selected={filter.actor === actor.id} onSelect={() => go({ actor: actor.id })}>
              {actor.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem selected={filter.actor === "removed"} onSelect={() => go({ actor: "removed" })}>
            {m.logs.trigger.removed}
          </DropdownMenuItem>
          <DropdownMenuLabel>{m.logs.filters.automation}</DropdownMenuLabel>
          <DropdownMenuItem selected={filter.actor === "automation"} onSelect={() => go({ actor: "automation" })}>
            {m.logs.trigger.cron}
          </DropdownMenuItem>
        </Filter>

        <Filter axis={m.logs.filters.axis.source} label={filter.sources.length === 0 ? m.logs.filters.anySource : filter.sources.map(source => source === PROJECT_WIDE ? m.logs.filters.projectWide : source).join(", ")} on={filter.sources.length > 0}>
          {/* 소스가 없는 사건(멤버 · 설정)을 고른다 — 그 사건에 가짜 소스 값을 넣지 않기 때문이다. */}
          <DropdownMenuCheckboxItem
            checked={filter.sources.includes(PROJECT_WIDE)}
            onCheckedChange={() => go({ sources: toggle(filter.sources, PROJECT_WIDE) })}
          >
            {m.logs.filters.projectWide}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {sources.map((source) => (
            <DropdownMenuCheckboxItem
              key={source.slug}
              checked={filter.sources.includes(source.slug)}
              onCheckedChange={() => go({ sources: toggle(filter.sources, source.slug) })}
            >
              {source.slug}
            </DropdownMenuCheckboxItem>
          ))}
          {filter.sources.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => go({ sources: [] })}>{m.logs.filters.clearSources}</DropdownMenuItem>
            </>
          )}
        </Filter>

        <Filter axis={m.logs.filters.axis.result} label={filter.results.length === 0 ? m.logs.filters.anyResult : filter.results.map((result) => m.logs.status[RESULT_KEY[result]]).join(", ")} on={filter.results.length > 0}>
          {/* 이 축이 **실행에만** 적용된다는 사실을 고르기 전에 말한다. */}
          <p className="text-muted-foreground max-w-54 px-2 py-1.5 text-xs">{m.logs.filters.resultScope}</p>
          {RESULT_GROUPS.map((group) => (
            <div key={group.label}>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.results.map((result) => (
                <DropdownMenuCheckboxItem
                  key={result}
                  checked={filter.results.includes(result)}
                  onCheckedChange={() => go({ results: toggle(filter.results, result) as EventResult[] })}
                >
                  {m.logs.status[RESULT_KEY[result]]}
                </DropdownMenuCheckboxItem>
              ))}
            </div>
          ))}
        </Filter>

        {narrowed && (
          <Button type="button" variant="ghost" onClick={() => router.push(routes.logs(slug, clearedLogsQuery(filter)))}>
            {m.logs.filters.clear}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * 트리거 — **접근 가능한 이름이 축을 포함한다** ("Source: web, emails"). 라벨만으로는 스크린리더가
 * 무엇을 고른 것인지 모른다. 켜짐은 색이 아니라 **테두리·굵기**로도 구별된다.
 */
function Filter({ axis, label, on, children }: { axis: string; label: string; on: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`${axis}: ${label}`}
        className={cn(
          "hover:bg-accent focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none",
          on ? "border-foreground font-medium" : "border-border text-muted-foreground",
        )}
      >
        {label}
        <Chevron className="size-4 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-53">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 프리셋 넷 — **UTC 기준으로 오늘을 잡는다**(로컬 자정으로 끊으면 밤 사이 실행이 하루 어긋난다). */
const PRESETS = [
  { key: "today" as const, range: () => ({ from: utcDay(0), to: utcDay(0) }) },
  { key: "yesterday" as const, range: () => ({ from: utcDay(-1), to: utcDay(-1) }) },
  { key: "last7" as const, range: () => ({ from: utcDay(-6), to: utcDay(0) }) },
  { key: "last30" as const, range: () => ({ from: utcDay(-29), to: utcDay(0) }) },
];

function utcDay(offset: number): string {
  const at = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  return at.toISOString().slice(0, 10);
}

function dateLabel(filter: LogFilter): string {
  if (filter.from === null && filter.to === null) return m.logs.filters.anyDate;
  if (filter.from !== null && filter.from === filter.to) return filter.from;
  return `${filter.from ?? "…"} – ${filter.to ?? "…"}`;
}

function actorLabel(filter: LogFilter, actors: readonly { id: string; label: string }[]): string {
  if (filter.actor === null) return m.logs.filters.anyone;
  if (filter.actor === "automation") return m.logs.trigger.cron;
  if (filter.actor === "removed") return m.logs.trigger.removed;
  return actors.find((actor) => actor.id === filter.actor)?.label ?? m.common.unreadable;
}

/** 결과 어휘 → 사전 키. **`Record`라 어휘가 늘면 여기서 컴파일이 걸린다.** */
const RESULT_KEY: Readonly<Record<EventResult, keyof typeof m.logs.status>> = {
  running: "running",
  sent: "succeeded",
  nothingToSend: "skipped",
  imported: "imported",
  deferred: "deferred",
  partial: "partial",
  superseded: "superseded",
  notStarted: "notStarted",
  failed: "failed",
};

/** 어느 종류의 결과인지 그룹으로 보인다 (캔버스 `1m`). */
const RESULT_GROUPS: readonly { label: string; results: readonly EventResult[] }[] = [
  { label: m.logs.filters.groupImports, results: ["imported", "deferred", "partial", "superseded", "notStarted"] },
  { label: m.logs.filters.groupPublish, results: ["sent", "nothingToSend"] },
  { label: m.logs.filters.groupBoth, results: ["running", "failed"] },
];

// 아홉이 그룹 셋에 빠짐없이 들어갔는지 — 하나가 빠지면 그 결과로 좁힐 길이 화면에 없다.
void (EVENT_RESULTS satisfies readonly EventResult[]);
