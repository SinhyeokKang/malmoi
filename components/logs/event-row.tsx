import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EventGlyph } from "@/components/logs/glyph";
import { Badge } from "@/components/ui/badge";
import { eventGlyph, eventSentence, eventView, planArchivedReason, refusalMessage, valueState } from "@/lib/events/view";
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
      className="focus-visible:ring-ring flex items-center gap-3 px-4 py-[13px] hover:bg-[rgba(10,10,10,0.02)] focus-visible:ring-2 focus-visible:outline-none"
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
          {meta(row, archived).map((part, index) => (
            <span key={index}>{part}</span>
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

/**
 * 보조줄 — **그 종류가 실제로 가진 맥락만** 적는다. 없는 값을 자리 채우려고 적지 않는다.
 *
 * ⚠️ **파일 수 `null`은 `—`이고 `0`이 아니다** — 0으로 적으면 "아무것도 안 바뀐 성공"과 같아진다.
 */
function meta(row: Row, archived: boolean): ReactNode[] {
  const payload = row.payload;
  const parts: ReactNode[] = [];
  switch (row.kind) {
    case "TRANSLATION": {
      if (payload?.kind !== "TRANSLATION") break;
      parts.push(payload.surfaceSlug, payload.locale);
      const before = valueState(payload.before);
      const after = valueState(payload.after);
      parts.push(`${before.kind === "text" ? before.text : before.label} → ${after.kind === "text" ? after.text : after.label}`);
      break;
    }
    case "PUBLISH": {
      parts.push(m.logs.kinds.publish, row.actor.kind === "AUTOMATION" ? m.logs.meta.automatic : m.logs.meta.manual);
      parts.push(row.run?.changed === null || row.run === null ? `${m.logs.detail.labels.files}: ${m.logs.none}` : m.logs.meta.files(row.run.changed));
      if (row.run?.prUrl != null) parts.push(<span className="text-blue-600">{m.translations.publish.viewLink}</span>);
      else if (row.result !== "running") parts.push(m.logs.meta.noPullRequest);
      if (payload?.kind === "PUBLISH" && payload.refusal !== null) parts.push(refusalMessage(payload.refusal));
      break;
    }
    case "IMPORT": {
      parts.push(m.logs.kinds.imports);
      if (payload?.kind !== "IMPORT") break;
      parts.push(payload.source === "ci" ? m.logs.meta.automatic : m.logs.meta.manual);
      if (payload.refusal !== null) parts.push(refusalMessage(payload.refusal), m.logs.meta.nothingImported);
      else if (payload.pendingEdits !== null) parts.push(m.logs.deferredReason(payload.pendingEdits));
      else if (payload.surfaces.length > 0) {
        parts.push(payload.surfaces.map((surface) => `${surface.surfaceSlug}: ${resultWord(surface.status)}${surface.count === null ? "" : `, ${m.logs.meta.keys(surface.count)}`}`).join(" · "));
      } else if (payload.keys !== null) parts.push(m.logs.meta.keys(payload.keys));
      break;
    }
    case "MEMBER": {
      parts.push(m.logs.kinds.members);
      if (payload?.kind !== "MEMBER") break;
      if (payload.role !== null) parts.push(`${roleWord(payload.role.before)} → ${roleWord(payload.role.after)}`);
      else parts.push(payload.targetLabel);
      break;
    }
    case "SURFACE": {
      parts.push(m.logs.kinds.sources);
      if (payload?.kind !== "SURFACE") break;
      if (payload.adapter !== null) parts.push(<span className="font-mono text-xs">{payload.adapter}</span>);
      if (payload.baseLocale !== null) {
        parts.push(`${payload.baseLocale.before ?? m.logs.none} → ${payload.baseLocale.after ?? m.logs.none}`, m.logs.meta.declarationOnly);
      }
      break;
    }
    default: {
      parts.push(m.logs.kinds.settings);
      if (payload?.kind !== "SETTINGS") break;
      if (row.subtype === "settings.pushTokenRotated") parts.push(m.logs.meta.tokenEffect);
      else if (row.subtype === "settings.archived") parts.push(m.logs.meta.archivedEffect);
      else if (row.subtype === "settings.restored") parts.push(m.logs.meta.restoredEffect);
      else if (payload.value !== null) parts.push(`${payload.value.before ?? m.logs.none} → ${payload.value.after ?? m.logs.none}`);
      break;
    }
  }
  // 실패 사유는 마지막이다 — 보관 중이면 야간 절이 빠진다 (`planArchivedReason`).
  if (row.result === "failed" && row.run?.errorCode !== undefined) {
    parts.push(planArchivedReason(row.run?.errorCode ?? "", archived));
  }
  return parts;
}

function resultWord(status: "imported" | "partial" | "failed" | "superseded"): string {
  if (status === "imported") return m.logs.status.imported;
  if (status === "partial") return m.logs.status.partial;
  if (status === "superseded") return m.logs.status.superseded;
  return m.logs.status.failed;
}

function roleWord(role: string | null): string {
  return role === null ? m.logs.none : role.charAt(0) + role.slice(1).toLowerCase();
}
