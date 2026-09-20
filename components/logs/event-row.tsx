import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { EventGlyph } from "@/components/logs/glyph";
import { Badge } from "@/components/ui/badge";
import { eventGlyph, eventSentence, eventView, eventMeta } from "@/lib/events/view";
import type { EventRow as Row } from "@/lib/events/query";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { utcMinute } from "@/lib/utc-time";

/**
 * 이벤트 행 (캔버스 §7): `[시각 48] [글리프 28] [문장 + 보조] [결과 172] [chevron]`.
 *
 * ⚠️ **세로로 맞추는 값이 셋뿐이다** — 시각 · 글리프 · 결과. 나머지는 문장 안에서 산다. 표 다섯 열을
 * 걷은 이유가 그것이고, 종류가 여섯이면 빈 칸이 "없음"과 "해당 없음"을 구별하지 못한다.
 *
 * ⚠️ **결과 열은 비어 있어도 폭을 유지한다** — 스무 행을 훑을 때 결과가 **같은 세로선**에 서야
 * 실행만 골라 읽을 수 있다.
 *
 * ⚠️ **행 전체가 링크다** — 상세는 `?event=`이고 목록의 필터·커서는 그대로 남는다(결정 15).
 *   `button`이 아니라 `Link`인 이유는 상세를 **RSC가 그리기** 때문이다(결정 2): 공유·뒤로가기·
 *   새 탭이 전부 그냥 되고, 클라이언트 상태가 하나도 안 는다.
 *
 * ⚠️ **긴 값을 자르지 않는다** (`overflow-wrap:anywhere`). 말줄임 + tooltip을 쓰면 hover가 유일한
 * 확인 수단이 되어 키보드·터치에서 값이 사라진다 — 행 높이가 들쭉날쭉해지는 비용은 받아들인다.
 */
export function EventRow({
  row,
  href,
  now,
  archived,
  showTime = true,
}: {
  row: Row;
  href: string;
  now: Date;
  /** 보관 중이면 실패 사유에서 야간 절을 뺀다 — 다음 야간 실행이 없다. */
  archived: boolean;
  /** Home에는 시각 열이 없다 — 날짜 카드가 없으므로 오른쪽에 상대 시각이 선다 (캔버스 `1h`). */
  showTime?: boolean;
}) {
  const view = eventView({ kind: row.kind, result: row.result, warnings: row.run?.warnings ?? 0, errorCode: row.run?.errorCode ?? null });
  const glyph = eventGlyph({ kind: row.kind, result: row.result, subtype: row.subtype });
  const sentence = eventSentence(row, {
    actor: <span className="font-medium">{actorLabel(row)}</span>,
    key: <span className="font-mono text-sm">{translationKey(row)}</span>,
  });

  return (
    <Link
      href={href}
      className="focus-visible:ring-ring flex items-center gap-3 px-4 py-[13px] hover:bg-foreground/[0.02] focus-visible:ring-2 focus-visible:outline-none"
    >
      {showTime && (
        /*
          ⚠️ **정확한 값이 `dateTime`과 접근 이름에 있다** — 행은 `09:42`만 들지만 "어느 밤인지"를
          스크린리더·브라우저가 잃으면 안 된다 (캔버스 근거 카드).
        */
        <time
          dateTime={row.occurredAt.toISOString()}
          aria-label={utcMinute(row.occurredAt)}
          className="text-muted-foreground w-12 shrink-0 text-sm tabular-nums"
        >
          {row.occurredAt.toISOString().slice(11, 16)}
        </time>
      )}
      <EventGlyph icon={glyph.icon} tone={glyph.tone} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[15px] [overflow-wrap:anywhere]">{sentence}</span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs [overflow-wrap:anywhere]">
          {!showTime && view.label !== null && <ResultLabel view={view} />}
          {!showTime && view.warningsLabel !== null && <Badge variant="warning">{view.warningsLabel}</Badge>}
          {eventMeta(row, archived).map((part, index) => (
            <span key={index} className={typeof part === "string" ? undefined : part.kind === "code" ? "font-mono text-xs" : "text-blue-600"}>{typeof part === "string" ? part : part.text}</span>
          ))}
        </span>
      </span>
      {showTime ? (
        <span className="flex w-[172px] shrink-0 flex-wrap items-center gap-1.5">
          {view.label !== null && <ResultLabel view={view} />}
          {view.warningsLabel !== null && <Badge variant="warning">{view.warningsLabel}</Badge>}
        </span>
      ) : (
        <span className="text-muted-foreground shrink-0 text-xs">{relativeTime(row.occurredAt, now)}</span>
      )}
      <span className="text-muted-foreground flex shrink-0">
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </span>
    </Link>
  );
}

/**
 * 결과 라벨. **muted는 배경 없는 평문**이고 warning·danger만 배지·색을 든다 (캔버스 근거 카드) —
 * 가장 흔한 상태가 가장 조용하다.
 */
function ResultLabel({ view }: { view: ReturnType<typeof eventView> }) {
  if (view.tone === "muted") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        {view.label}
      </span>
    );
  }
  if (view.tone === "danger") return <span className="text-destructive text-xs font-medium">{view.label}</span>;
  return <Badge variant="warning">{view.label}</Badge>;
}

/** 행위자 폴백 순서 — 이름 → 마스킹 라벨 → `Removed user`, 자동화는 그 자리를 그대로 쓴다. */
function actorLabel(row: Row): string {
  if (row.actor.kind === "AUTOMATION") return row.kind === "IMPORT" ? m.logs.trigger.ci : m.logs.trigger.cron;
  if (row.actor.kind === "UNKNOWN") return m.common.unreadable;
  if (row.actor.removed) return m.logs.trigger.removed;
  return row.actor.name ?? row.actor.emailLabel ?? m.logs.trigger.removed;
}

function translationKey(row: Row): string {
  return row.payload?.kind === "TRANSLATION" ? row.payload.key : "";
}
