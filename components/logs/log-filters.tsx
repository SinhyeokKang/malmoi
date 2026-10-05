"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";

import { SearchInput } from "@/components/ui/search-input";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { FieldTrigger } from "@/components/ui/field-trigger";
import { EVENT_RESULTS, LOG_KINDS, type EventResult, type LogKind } from "@/lib/events/payload";
import { LOG_PRESETS, PROJECT_WIDE, clearedLogsQuery, hasNarrowing, logsQuery, presetRange, type LogFilter, type LogPreset } from "@/lib/events/filter";
import { useDateStyle, useMessages } from "@/components/i18n/messages-provider";
import { routes } from "@/lib/routes";
import { formatDayKey } from "@/lib/date-format";
import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import type { TimeZone } from "@/lib/time-zone/zones";

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
  now,
}: {
  slug: string;
  filter: LogFilter;
  /** 활성 → 제거된 순(`logSourceOptions`). 제거된 소스도 이력이 남아 거를 수 있다(시안 L1). */
  sources: readonly { slug: string; removed?: boolean }[];
  actors: readonly { id: string; label: string }[];
  refreshable: boolean;
  /**
   * 프리셋의 "오늘"을 잡는 기준 시각(ISO) — **Logs 페이지가 렌더한 순간이다.** 렌더 중 `Date.now()`를 쓰면 보는 사람 시간대의 자정이
   * 서버 렌더와 하이드레이션 사이에 낄 때 두 쪽의 프리셋 판정이 갈린다(user-timezone design §0 하이드레이션 ①).
   */
  now: string;
}) {
  const m = useMessages();
  const style = useDateStyle();
  const range = (preset: LogPreset) => presetRange(preset, new Date(now), style.timeZone);
  const router = useRouter();

  /**
   * ⚠️ **좁히는 축이 바뀌면 커서를 뺀다** — `logsQuery`가 새 필터로 다시 조립한다.
   * ⚠️ **`event`도 뺀다** (malmoi#102) — 상세 닫기가 `history.replaceState`라 이 `filter` prop의 `event`는 닫은 뒤에도
   * 남는다. 그것을 실으면 필터를 바꾸는 순간 방금 닫은 상세가 되살아났다. 이 컨트롤들은 모달 뒤라 상세가 열린
   * 동안에는 누를 수 없으므로, 여기서 나가는 주소에 `event`가 있을 자리가 없다.
   */
  const go = (next: Partial<LogFilter>) => {
    router.push(routes.logs(slug, logsQuery({ ...filter, ...next, cursor: null, event: null })));
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
  /**
   * ⚠️ **Dialog는 메뉴가 다 닫힌 뒤에 연다** (malmoi#161). 항목의 `onSelect`에서 바로 열면 메뉴의 포커스 트랩(모달 메뉴)이 아직
   * 살아 있는 커밋에서 From의 `autoFocus`가 돌고 — 트랩 해제는 passive effect 정리라 그보다 늦다 — 트랩이 포커스를 메뉴로 되끌어,
   * 그것을 본 Dialog 트랩이 첫 tabbable(헤더 X)로 갔다. 그래서 `onSelect`는 표시만 하고, 메뉴 FocusScope의 언마운트 복귀
   * (`onCloseAutoFocus` — 트랩이 풀린 뒤다)를 막으며 그 자리에서 연다. 닫힐 때의 복귀는 `CustomRangeDialog`가 Date 트리거로 든다.
   */
  const customHandoff = useRef(false);
  function handOffToCustom(event: Event) {
    if (!customHandoff.current) return;
    customHandoff.current = false;
    event.preventDefault();
    setCustomRun(run => run + 1);
    setCustomOpen(true);
  }
  /**
   * ⚠️ **[Refresh]·[Clear filters]가 transition을 하나씩 든다** (audit-ux #28). 전엔 둘 다 맨 `router` 호출이라
   * 바뀐 게 없으면 눌렸는지조차 알 수 없었다 — pending이 새 서버 렌더의 커밋까지 이어진다. 둘을 나누는 것은
   * 스피너가 **누른 버튼에만** 서야 해서다. 필터 메뉴의 `go`는 이 항목 밖이다.
   * ⚠️ **`disabled`가 아니라 `aria-busy` + `aria-disabled` + 클릭 무시다** — 진짜 `disabled`는 누른 버튼의 포커스를
   * `body`로 떨군다. 꺼진 겉모습은 `buttonClass`의 `aria-disabled:` 짝이 든다 (DESIGN §6, `new-project-button`과 같은 형).
   */
  const [refreshing, startRefresh] = useTransition();
  const [clearing, startClear] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {/* ⚠️ `tabIndex={-1}` — 딥링크(`?event=`)로 연 상세의 폴백 복귀 대상이다(`event-dialog.tsx`). 없으면 `focus()`가
            조용히 무시되어 Esc로 닫은 포커스가 `body`로 빠졌다 (audit #33). */}
        <h1 tabIndex={-1} className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.logs}</h1>
        {!refreshable && <StatusBadge state="archived" />}
        <div className="ml-auto flex items-center gap-2">
          {refreshable && (
            /*
              ⚠️ **자동 갱신이 없다** — `Running…`이 조회 시점 스냅샷이라는 사실을 이 버튼 하나가 든다.
              폴링·스트리밍은 넣지 않는다(리포에 폴링 0건).
            */
            <Button
              type="button"
              variant="default"
              // `busy`가 포커스를 지키며 클릭을 막고, 앞 글리프를 스피너로 교체한다 (DESIGN §6.4 `Button loading`).
              busy={refreshing}
              onClick={() => { if (!refreshing) startRefresh(() => router.refresh()); }}
              className="gap-1.5"
            >
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

        <Filter triggerRef={dateTrigger} onCloseAutoFocus={handOffToCustom} axis={m.logs.filters.axis.date} label={dateLabel(m, style.uiLocale, filter)} on={filter.from !== null || filter.to !== null}>
          <DropdownMenuItem selected={filter.from === null && filter.to === null} onSelect={() => go({ from: null, to: null })}>
            {m.logs.filters.anyDate}
          </DropdownMenuItem>
          {/* ⚠️ 프리셋도 선택 상태를 든다 (B5 리뷰 r1) — 다른 필터 넷과 같은 단일 선택이고, 없으면 프리셋을 적용한 뒤 스크린리더가
              "아무것도 선택 안 됨"을 읽는다. 판정은 지금 범위가 그 프리셋의 범위와 같은가다. `Custom…`은 값이 아니라 동작이다. */}
          {LOG_PRESETS.map((preset) => (
            <DropdownMenuItem key={preset} selected={sameRange(filter, range(preset))} onSelect={() => go(range(preset))}>
              {m.logs.range[preset]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/*
            ⚠️ **입력 칸을 메뉴 안에 두지 않는다** (audit #8 — WCAG 2.1.1). 메뉴의 roving focus는 `menuitem`만 들르고
            Tab은 메뉴를 닫으므로, 안에 둔 `<input>`에는 키보드로 도달할 수 없었다. 항목 하나가 Dialog를 연다.
          */}
          <DropdownMenuItem onSelect={() => { customHandoff.current = true; }}>{m.logs.range.customOpen}</DropdownMenuItem>
        </Filter>

        <Filter axis={m.logs.filters.axis.actor} label={actorLabel(m, filter, actors)} on={filter.actor !== null}>
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
          {/* ⚠️ 옛 `automation` 한 항목은 `Nightly`로 적힌 채 CI까지 걸렀다 — 둘로 가른다. 옛 링크(`?actor=automation`)는 읽기만 한다(메뉴 항목 없음). */}
          <DropdownMenuLabel>{m.logs.filters.automation}</DropdownMenuLabel>
          <DropdownMenuItem selected={filter.actor === "ci"} onSelect={() => go({ actor: "ci" })}>
            {m.logs.trigger.ci}
          </DropdownMenuItem>
          <DropdownMenuItem selected={filter.actor === "nightly"} onSelect={() => go({ actor: "nightly" })}>
            {m.logs.trigger.cron}
          </DropdownMenuItem>
        </Filter>

        <Filter axis={m.logs.filters.axis.source} label={filter.sources.length === 0 ? m.logs.filters.anySource : filter.sources.map(source => source === PROJECT_WIDE ? m.logs.filters.projectWide : sources.some(row => row.slug === source && row.removed) ? `${source} ${m.logs.filters.removed}` : source).join(", ")} on={filter.sources.length > 0}>
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
              {/* 꼬리만 muted다 — 이름은 활성 항목과 같은 글자다. */}
              {source.slug}{source.removed && <span className="text-muted-foreground"> {m.logs.filters.removed}</span>}
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
            <div key={group.key}>
              <DropdownMenuLabel>{m.logs.filters[GROUP_LABEL[group.key]]}</DropdownMenuLabel>
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
          <Button
            type="button"
            variant="ghost"
            busy={clearing}
            onClick={() => { if (!clearing) startClear(() => router.push(routes.logs(slug, clearedLogsQuery({ ...filter, event: null })))); }}
          >
            <RotateCcw aria-hidden />
            {m.logs.filters.clear}
          </Button>
        )}
        <CustomRangeDialog key={customRun} open={customOpen} onOpenChange={setCustomOpen} filter={filter} returnFocusRef={dateTrigger}
          onApply={range => go(range)} />
        <SearchInput
          className="ml-auto"
          width={320}
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
function Filter({ triggerRef, onCloseAutoFocus, axis, label, on, children }: { triggerRef?: RefObject<HTMLButtonElement | null>; onCloseAutoFocus?: (event: Event) => void; axis: string; label: string; on: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <FieldTrigger ref={triggerRef} aria-label={`${axis}: ${label}`} active={on} className="shrink-0">
          {label}
        </FieldTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-53" onCloseAutoFocus={onCloseAutoFocus}>{children}</DropdownMenuContent>
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
  const m = useMessages();
  const { timeZone } = useDateStyle();
  const [from, setFrom] = useState(filter.from ?? "");
  const [to, setTo] = useState(filter.to ?? "");
  const fromId = useId();
  const toId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={m.logs.range.custom}
        description={description(m, timeZone)}
        onCloseAutoFocus={event => { event.preventDefault(); returnFocusRef.current?.focus(); }}
        actions={<>
          <DialogClose asChild><Button>{m.common.cancel}</Button></DialogClose>
          <Button variant="primary" onClick={() => { onApply({ from: from === "" ? null : from, to: to === "" ? null : to }); onOpenChange(false); }}>
            {m.logs.range.apply}
          </Button>
        </>}
      >
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label={m.logs.range.from} htmlFor={fromId}>
            {(describe) => (
              <>
                {/* 첫 포커스는 첫 날짜다 — 이 Dialog는 입력이 할 일이라 Cancel 표식(`DialogContent`)에서 빠진다. */}
                <Input aria-describedby={describe()} width="full" id={fromId} type="date" value={from} onChange={event => setFrom(event.target.value)}  autoFocus />
              </>
            )}
          </FormGroup>
          <FormGroup label={m.logs.range.to} htmlFor={toId}>
            {(describe) => (
              <Input aria-describedby={describe()} width="full" id={toId} type="date" value={to} onChange={event => setTo(event.target.value)}  />
            )}
          </FormGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dialog 설명 — 칸의 날짜가 **보는 사람이 고른 시간대의 자정**으로 끊긴다는 것을 끝줄이 말한다(라벨의 `(UTC)` 괄호를 대신한다).
 * 런타임 TZ가 아니다 — 프리셋(`presetRange`)·서버 구간(`parseDateRange`)이 같은 시간대를 받는다.
 */
function description(m: Messages, timeZone: TimeZone): string {
  return `${m.logs.range.description} ${m.logs.range.zoneNote(timeZone)}`;
}

function sameRange(filter: LogFilter, range: { from: string; to: string }): boolean {
  return filter.from === range.from && filter.to === range.to;
}

/**
 * 칩 글자만 `lib/date-format.ts`의 형이다(`Sep 27, 2026`) — URL·입력 값·프리셋 판정은 ISO 그대로다.
 * ⚠️ 키를 순간으로 바꾸지 않는다(`formatDayKey`) — `new Date(key)`를 시간대로 그리면 음수 오프셋에서 하루 밀린다.
 */
function dateLabel(m: Messages, uiLocale: UiLocale, filter: LogFilter): string {
  if (filter.from === null && filter.to === null) return m.logs.filters.anyDate;
  const day = (iso: string | null) => (iso === null ? "…" : formatDayKey(iso, uiLocale));
  if (filter.from !== null && filter.from === filter.to) return day(filter.from);
  return `${day(filter.from)} – ${day(filter.to)}`;
}

function actorLabel(m: Messages, filter: LogFilter, actors: readonly { id: string; label: string }[]): string {
  if (filter.actor === null) return m.logs.filters.anyone;
  if (filter.actor === "ci") return m.logs.trigger.ci;
  if (filter.actor === "nightly") return m.logs.trigger.cron;
  // 옛 링크 — CI와 야간 둘 다를 뜻하므로 머리 낱말로 읽는다.
  if (filter.actor === "automation") return m.logs.filters.automation;
  if (filter.actor === "removed") return m.logs.trigger.removed;
  return actors.find((actor) => actor.id === filter.actor)?.label ?? m.common.unreadable;
}

/** 결과 어휘 → 사전 키. **`Record`라 어휘가 늘면 여기서 컴파일이 걸린다.** */
const RESULT_KEY: Readonly<Record<EventResult, keyof Messages["logs"]["status"]>> = {
  running: "inProgress",
  sent: "succeeded",
  nothingToSend: "skipped",
  notSent: "notSent",
  imported: "imported",
  deferred: "deferred",
  partial: "partial",
  superseded: "superseded",
  notStarted: "notStarted",
  failed: "failed",
  upToDate: "upToDate",
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
  upToDate: "both",
};

/** 어느 종류의 결과인지 그룹으로 보인다 (캔버스 `1m`). 순서는 `EVENT_RESULTS`가 든다. 낱말은 화면이 사전에서 읽는다(`GROUP_LABEL`). */
const RESULT_GROUPS: readonly { key: "imports" | "publish" | "both"; results: readonly EventResult[] }[] = (
  ["imports", "publish", "both"] as const
).map((key) => ({
  key,
  results: EVENT_RESULTS.filter((result) => RESULT_GROUP_OF[result] === key),
}));

const GROUP_LABEL = { imports: "groupImports", publish: "groupPublish", both: "groupBoth" } as const;

