"use client";

import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormGroup } from "@/components/ui/form-group";
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
import { PROJECT_WIDE, clearedLogsQuery, hasNarrowing, logsQuery, type LogFilter } from "@/lib/events/filter";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * 필터 다섯 + 검색 + [Refresh] (캔버스 `1a`·`1m`).
 *
 * ⚠️ **검색은 필터 줄 끝이고 공용 `SearchInput`이다** (2026-09-24 사용자) — 번역 화면 툴바와 같은 형:
 * 제목 줄은 제목·행동([Refresh])뿐이고 좁히는 도구는 한 줄에 모인다. 전엔 제목 줄에 손으로 만든
 * 폼이 있었고 IME 조합 확정 Enter를 거르지 않았다.
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

  /** ⚠️ **좁히는 축이 바뀌면 커서를 뺀다** — `logsQuery`가 새 필터로 다시 조립한다. */
  const go = (next: Partial<LogFilter>) => {
    router.push(routes.logs(slug, logsQuery({ ...filter, ...next, cursor: null })));
  };

  const toggle = (list: readonly string[], value: string): string[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  // ⚠️ **축 일곱을 여기서 다시 세지 않는다** — `hasNarrowing`이 그 판정을 소유한다(축이 늘면 한 곳만 고친다).
  const narrowed = hasNarrowing(filter);
  const [customOpen, setCustomOpen] = useState(false);
  /**
   * ⚠️ **여는 때마다 Dialog를 새로 세운다** (r1) — 두 칸의 초깃값이 `useState(filter.from)`이라 한 번만 평가되고, 이
   * Dialog엔 트리거가 없어 Radix `onOpenChange`가 여는 쪽으로 불리지 않는다. 그래서 취소한 입력이 다음 열기에 남았고,
   * 프리셋으로 바꾼 뒤 다시 열어 Apply하면 **옛 범위가 조용히 되돌아왔다.** key가 바뀌면 URL의 현재 값에서 시작한다.
   */
  const [customRun, setCustomRun] = useState(0);
  const dateTrigger = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.logs}</h1>
        {!refreshable && <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">{m.logs.archived.badge}</span>}
        <div className="ml-auto flex items-center gap-2">
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

      <div data-log-filter-row className="flex flex-wrap items-center gap-2">
        <Filter axis={m.logs.filters.axis.kind} label={filter.kind === "all" ? m.logs.kinds.all : m.logs.kinds[filter.kind]} on={filter.kind !== "all"}>
          {LOG_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} selected={filter.kind === kind} onSelect={() => go({ kind })}>
              {m.logs.kinds[kind]}
            </DropdownMenuItem>
          ))}
        </Filter>

        <Filter triggerRef={dateTrigger} axis={m.logs.filters.axis.date} label={dateLabel(filter)} on={filter.from !== null || filter.to !== null}>
          <DropdownMenuItem selected={filter.from === null && filter.to === null} onSelect={() => go({ from: null, to: null })}>
            {m.logs.filters.anyDate}
          </DropdownMenuItem>
          {PRESETS.map((preset) => (
            <DropdownMenuItem key={preset.key} onSelect={() => go(preset.range())}>
              {m.logs.range[preset.key]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/*
            ⚠️ **입력 칸을 메뉴 안에 두지 않는다** (audit #8 — WCAG 2.1.1). 메뉴의 roving focus는 `menuitem`만 들르고
            Tab은 메뉴를 닫으므로, 안에 둔 `<input>`에는 키보드로 도달할 수 없었다. 항목 하나가 Dialog를 연다.
          */}
          <DropdownMenuItem onSelect={() => { setCustomRun(run => run + 1); setCustomOpen(true); }}>{m.logs.range.customOpen}</DropdownMenuItem>
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
        <CustomRangeDialog key={customRun} open={customOpen} onOpenChange={setCustomOpen} filter={filter} returnFocusRef={dateTrigger}
          onApply={range => go(range)} />
        <SearchInput
          className="ml-auto"
          inputClassName="w-80"
          value={filter.q ?? undefined}
          label={m.logs.search.label}
          placeholder={m.logs.search.placeholder}
          onSearch={(q) => go({ q: q === "" ? null : q })}
        />
      </div>
    </div>
  );
}

/**
 * 트리거 — **접근 가능한 이름이 축을 포함한다** ("Source: web, emails"). 라벨만으로는 스크린리더가
 * 무엇을 고른 것인지 모른다. 켜짐은 색이 아니라 **테두리·굵기**로도 구별된다.
 */
/*
  ⚠️ **트리거에 `id`를 넘기지 않는다** (r1) — Radix는 `context.triggerId`를 트리거의 id로 쓰고 메뉴의 `aria-labelledby`가 그것을
  가리키는데, `id` prop이 그 값을 덮는다(값이 `undefined`여도 덮인다). 다섯 메뉴가 전부 없는 id를 가리켰다. 포커스 복귀는 ref가 든다.
*/
function Filter({ triggerRef, axis, label, on, children }: { triggerRef?: RefObject<HTMLButtonElement | null>; axis: string; label: string; on: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        ref={triggerRef}
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

/**
 * 사용자 지정 기간 — **네이티브 `<input type="date">` 둘**(DESIGN §6.68의 의도된 이탈 그대로)이고 [Apply range]가 확정한다.
 *
 * ⚠️ **칸을 바꿀 때마다 이동하지 않는다** — 메뉴 밖으로 나온 대가로 [Apply]가 생겼다. 한 칸씩 고치는 동안 URL이 바뀌면
 * 목록이 매번 다시 그려지고, 두 칸 중 하나만 고친 중간 상태가 결과처럼 선다.
 * ⚠️ **닫히면 Date 트리거로 포커스를 돌려준다** — 연 항목은 메뉴와 함께 사라져 Radix의 기본 복귀가 `body`로 떨어진다.
 * ⚠️ **초깃값은 마운트 때 한 번이다** — 여는 때마다 새로 세우는 것은 호출부의 `key`가 든다.
 * ⚠️ **칸은 Dialog의 필드다** — 보이는 라벨(`FormGroup`)과 기본 `Input` 크기이고, 메뉴 안에서 쓰던 `h-8 text-xs`가 아니다.
 */
function CustomRangeDialog({ open, onOpenChange, filter, returnFocusRef, onApply }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: LogFilter;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onApply: (range: { from: string | null; to: string | null }) => void;
}) {
  const [from, setFrom] = useState(filter.from ?? "");
  const [to, setTo] = useState(filter.to ?? "");
  const fromId = useId();
  const toId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={m.logs.range.custom}
        description={m.logs.range.description}
        onCloseAutoFocus={event => { event.preventDefault(); returnFocusRef.current?.focus(); }}
        footer={<>
          <DialogClose asChild><Button>{m.common.cancel}</Button></DialogClose>
          <Button variant="primary" onClick={() => { onApply({ from: from === "" ? null : from, to: to === "" ? null : to }); onOpenChange(false); }}>
            {m.logs.range.apply}
          </Button>
        </>}
      >
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label={m.logs.range.from} htmlFor={fromId}>
            <Input id={fromId} type="date" value={from} onChange={event => setFrom(event.target.value)} className="w-full" />
          </FormGroup>
          <FormGroup label={m.logs.range.to} htmlFor={toId}>
            <Input id={toId} type="date" value={to} onChange={event => setTo(event.target.value)} className="w-full" />
          </FormGroup>
        </div>
      </DialogContent>
    </Dialog>
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
  notSent: "notSent",
  imported: "imported",
  deferred: "deferred",
  partial: "partial",
  superseded: "superseded",
  notStarted: "notStarted",
  failed: "failed",
};

/**
 * 결과 어휘 → 어느 그룹인가. **`Record`라 어휘가 늘면 여기서 컴파일이 걸린다** (`RESULT_KEY`와 같은 형).
 *
 * ⚠️ **목록을 손으로 적지 않는다** — 전에는 그룹마다 결과를 나열하고 `EVENT_RESULTS satisfies
 * readonly EventResult[]` 한 줄로 "전부 빠짐없이 들어갔다"를 주장했는데, **그 식은 항진명제라
 * 아무것도 재지 않았다**: 열 번째 어휘를 늘려도 컴파일이 통과하고 그 결과로 좁힐 길만 화면에서
 * 사라진다(어느 화면에도 안 나타나는 부류다).
 */
const RESULT_GROUP_OF: Readonly<Record<EventResult, "imports" | "publish" | "both">> = {
  imported: "imports",
  deferred: "imports",
  partial: "imports",
  superseded: "imports",
  notStarted: "imports",
  sent: "publish",
  nothingToSend: "publish",
  notSent: "publish",
  running: "both",
  failed: "both",
};

/** 어느 종류의 결과인지 그룹으로 보인다 (캔버스 `1m`). 순서는 `EVENT_RESULTS`가 든다. */
const RESULT_GROUPS: readonly { label: string; results: readonly EventResult[] }[] = (
  [
    { key: "imports", label: m.logs.filters.groupImports },
    { key: "publish", label: m.logs.filters.groupPublish },
    { key: "both", label: m.logs.filters.groupBoth },
  ] as const
).map((group) => ({
  label: group.label,
  results: EVENT_RESULTS.filter((result) => RESULT_GROUP_OF[result] === group.key),
}));
