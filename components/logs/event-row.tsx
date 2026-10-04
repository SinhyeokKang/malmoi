import { ListRow } from "@/components/ui/list-row";

import { EventMetaLine } from "@/components/logs/event-meta";
import { EventGlyph } from "@/components/logs/glyph";
import { RowChevron } from "@/components/logs/row-chevron";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { eventGlyph, eventSentence, eventView, triggerOf } from "@/lib/events/view";
import type { EventRow as Row } from "@/lib/events/query";
import { relativeTime } from "@/lib/relative-time";
import { utcMinute } from "@/lib/utc-time";
import type { UiLocale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n";

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
      showTime = true, uiLocale, m }: {
  row: Row;
  href: string;
  now: Date;
  /** 보관 중이면 실패 사유에서 야간 절을 뺀다 — 다음 야간 실행이 없다. */
  archived: boolean;
  /** Home에는 시각 열이 없다 — 날짜 카드가 없으므로 오른쪽에 상대 시각이 선다 (캔버스 `1h`). */
  showTime?: boolean;
  uiLocale: UiLocale;
  m: Messages;
}) {
  const view = eventView(m, { kind: row.kind, result: row.result, warnings: row.run?.warnings ?? 0, errorCode: row.run?.errorCode ?? null });
  const glyph = eventGlyph({ kind: row.kind, result: row.result, subtype: row.subtype });
  const sentence = eventSentence(m, row, {
    actor: <span className="font-medium">{actorLabel(m, row)}</span>,
    key: translationKey(row),
  });

  return (
    <ListRow
      href={href}
      aside={<span className="text-muted-foreground flex shrink-0">
        <RowChevron />
      </span>}
    >
      {showTime && (
        /*
          ⚠️ **정확한 값이 `dateTime`과 접근 이름에 있다** — 행은 `09:42`만 들지만 "어느 밤인지"를
          스크린리더·브라우저가 잃으면 안 된다 (캔버스 근거 카드).
        */
        <time
          dateTime={row.occurredAt.toISOString()}
          aria-label={utcMinute(row.occurredAt, uiLocale)}
          className="text-muted-foreground w-12 shrink-0 text-sm tabular-nums"
        >
          {row.occurredAt.toISOString().slice(11, 16)}
        </time>
      )}
      <EventGlyph icon={glyph.icon} tone={glyph.tone} />
      <span className="flex min-w-0 flex-1 flex-col gap-copy-gap">
        <span className="text-base wrap-anywhere">{sentence}</span>
        <EventMetaLine row={row} archived={archived} m={m} />
      </span>
      {/* 결과 배지는 보조줄 밖, 행 오른쪽이다 — Logs는 172 칸의 오른쪽 끝(chevron 옆), Home 최근 로그는 시각 앞(2026-09-30 사용자). */}
      {showTime ? (
        <span className="flex w-[172px] shrink-0 flex-wrap items-center justify-end gap-1.5">
          {view.state !== null && <StatusBadge state={view.state} />}
          {view.warningsLabel !== null && <Badge variant="soft-amber">{view.warningsLabel}</Badge>}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          {view.state !== null && <StatusBadge state={view.state} />}
          {view.warningsLabel !== null && <Badge variant="soft-amber">{view.warningsLabel}</Badge>}
          <span className="text-muted-foreground text-xs">{relativeTime(row.occurredAt, now, uiLocale)}</span>
        </span>
      )}
    </ListRow>
  );
}

/**
 * 행위자 폴백 순서 — 이름 → 마스킹 라벨 → `Removed user`, 자동화는 그 자리를 그대로 쓴다.
 * ⚠️ 자동화 낱말은 `triggerOf`(subtype)가 정한다 — 종류로 가르면 야간 적재·스킵이 `CI`로 선다(nightly-sync).
 */
function actorLabel(m: Messages, row: Row): string {
  if (row.actor.kind === "AUTOMATION") return triggerOf({ actorKind: row.actor.kind, kind: row.kind, subtype: row.subtype }) === "nightly" ? m.logs.trigger.cron : m.logs.trigger.ci;
  if (row.actor.removed) return m.logs.trigger.removed;
  return row.actor.name ?? row.actor.emailLabel ?? m.logs.trigger.removed;
}

function translationKey(row: Row): string {
  return row.payload?.kind === "TRANSLATION" ? row.payload.key : "";
}
