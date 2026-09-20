import { CircleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CopyButton } from "@/components/onboarding/copy-button";
import { EventGlyph } from "@/components/logs/glyph";
import { Badge } from "@/components/ui/badge";
import { Dialog as DialogTitleSlot } from "radix-ui";
import { eventGlyph, eventSentence, eventView, eventFailureMessage, importReasonMessage, refusalMessage, valueState } from "@/lib/events/view";
import type { EventRow } from "@/lib/events/query";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { utcMinute } from "@/lib/utc-time";

/**
 * 이벤트 상세의 **본문** (캔버스 `1d`–`1f`).
 *
 * ⚠️ **공통 필드는 참조 하나**이고 나머지는 종류가 정한다 — 모든 상세에 같은 격자를 깔면 빈 칸이
 * "값을 못 읽었다"로 읽힌다. 실행에만 시작·종료 두 시각이 붙고 일회성 사건은 발생 시각 하나다.
 *
 * ⚠️ **목적지 링크는 대상이 살아 있고 권한이 있을 때만** 그린다 — 죽은 링크를 남겨 404로 보내는
 * 쪽이 더 나쁘다 (`entry-points.test.ts`의 축).
 */
export function EventDetail({
  row,
  slug,
  now,
  archived,
  canOpenSettings,
  repoUrl,
}: {
  row: EventRow;
  slug: string;
  now: Date;
  archived: boolean;
  /** OWNER만 — EDITOR는 그 화면에 못 들어간다. */
  canOpenSettings: boolean;
  repoUrl: string | null;
}) {
  const view = eventView({ kind: row.kind, result: row.result, warnings: row.run?.warnings ?? 0, errorCode: row.run?.errorCode ?? null });
  const glyph = eventGlyph({ kind: row.kind, result: row.result, subtype: row.subtype });
  const run = row.kind === "IMPORT" || row.kind === "PUBLISH";

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 px-6 pt-6 pb-4">
        <EventGlyph icon={glyph.icon} tone={glyph.tone} className="mt-0.5" />
        <span className="flex min-w-0 flex-1 flex-col gap-1 pr-9">
          <span className="text-muted-foreground flex items-center gap-2 text-xs">
            {m.logs.detail.kindLabel[KIND_KEY[row.kind]]}
            {view.label !== null &&
              (view.tone === "danger" ? (
                <span className="text-destructive text-xs font-medium">{view.label}</span>
              ) : view.tone === "warning" ? (
                <Badge variant="warning">{view.label}</Badge>
              ) : (
                <span className="text-muted-foreground text-xs">{view.label}</span>
              ))}
            {view.warningsLabel !== null && <Badge variant="warning">{view.warningsLabel}</Badge>}
          </span>
          <DialogTitleSlot.Title className="text-lg font-medium text-pretty">
            {eventSentence(row, {
              actor: actorLabel(row),
              key: <span className="font-mono text-[17px]">{row.payload?.kind === "TRANSLATION" ? row.payload.key : ""}</span>,
            })}
          </DialogTitleSlot.Title>
          {/* ⚠️ **절대 시각은 `<time dateTime>`이 든다** (L7.1) — 상대 시각은 보조다. */}
          <span className="text-muted-foreground text-xs">
            <time dateTime={row.occurredAt.toISOString()}>
              {run
                ? row.finishedAt === null
                  ? m.logs.detail.startedOnly(utcMinute(row.occurredAt))
                  : m.logs.detail.startedFinished(utcMinute(row.occurredAt), utcMinute(row.finishedAt))
                : `${utcMinute(row.occurredAt)} · ${relativeTime(row.occurredAt, now)}`}
            </time>
          </span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5">
        <dl className="grid grid-cols-[104px_1fr] items-baseline gap-x-3 gap-y-2.5">
          <Field label={m.logs.detail.labels.reference}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-sm [overflow-wrap:anywhere]">{row.ref}</span>
              {/* 동료에게 붙여넣는 것이 링크보다 짧고 **권한과 무관**하다 — 받은 사람은 검색창에 넣는다. */}
              <CopyButton value={row.ref} label={m.logs.detail.actions.copy} size="sm" />
            </span>
          </Field>
          {fields(row).map(([label, value]) => (
            <Field key={label} label={label}>
              {value}
            </Field>
          ))}
        </dl>

        {row.payload?.kind === "TRANSLATION" && (
          <div className="border-border flex flex-col gap-2 border-t pt-4">
            {/* ⚠️ **색이 아니라 라벨과 자리로 가른다** — 붉은·초록 diff는 색각·흑백에서 두 블록이 같아진다. */}
            <ValueBlock label={m.logs.detail.labels.before} value={row.payload.before} muted />
            <ValueBlock label={m.logs.detail.labels.after} value={row.payload.after} muted={false} />
          </div>
        )}

        {row.payload?.kind === "IMPORT" && row.payload.surfaces.length > 0 && (
          <div className="border-border flex flex-col gap-2 border-t pt-4">
            <span className="text-muted-foreground text-xs">{m.logs.detail.labels.resultPerSource}</span>
            <div className="border-border overflow-hidden rounded-xl border">
              {row.payload.surfaces.map((surface, index) => (
                <div key={surface.surfaceSlug} className={`flex items-start gap-3 px-3.5 py-3 ${index === 0 ? "" : "border-border border-t"}`}>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[15px] font-medium">{surface.surfaceSlug}</span>
                    <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                      {surface.count === null ? m.logs.value.notRecorded : m.logs.meta.keys(surface.count)}
                      {surface.reason === null ? "" : ` · ${importReasonMessage(surface.reason)}`}
                    </span>
                  </span>
                  <span className={surface.status === "failed" ? "text-destructive shrink-0 text-xs font-medium" : "text-muted-foreground shrink-0 text-xs"}>
                    {surfaceWord(surface.status)}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-muted-foreground text-xs text-pretty">{m.logs.detail.notes.import}</span>
          </div>
        )}

        {/* ⚠️ **보관 중에는 야간 절이 빠진다** — 다음 야간 실행이 없으므로 그 문장이 거짓이 된다. */}
        {row.result === "failed" && (
          <Note tone="danger" body={eventFailureMessage(row, archived)} note={row.kind === "PUBLISH" ? m.logs.detail.notes.publish : null} />
        )}
        {row.result === "running" && <Note tone="muted" body={m.logs.detail.noResult} note={null} />}
        {row.subtype === "settings.pushTokenRotated" && <Note tone="muted" body={m.logs.meta.tokenEffect} note={m.logs.detail.notes.token} />}
      </div>

      <div className="border-border flex shrink-0 items-center gap-2 border-t px-6 py-4">
        {destination(row, slug, canOpenSettings, repoUrl)}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="m-0 text-[15px]">{children}</dd>
    </>
  );
}

/** ⚠️ **값이 아닌 상태는 점선 테두리 + 회색 글자**로 한 번 더 갈린다 (캔버스 `1d`). */
function ValueBlock({ label, value, muted }: { label: string; value: string | null; muted: boolean }) {
  const state = valueState(value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {state.kind === "text" ? (
        <div className={`border-border rounded-[10px] border px-3 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap ${muted ? "bg-muted" : ""}`}>
          {state.text}
        </div>
      ) : (
        <div className="border-border bg-muted text-muted-foreground rounded-[10px] border border-dashed px-3 py-2.5 text-[15px]">
          {state.label}
        </div>
      )}
    </div>
  );
}

function Note({ tone, body, note }: { tone: "danger" | "muted"; body: string; note: string | null }) {
  return (
    <div className="border-border flex items-start gap-2.5 rounded-[10px] border p-3.5">
      <CircleAlert className={`mt-px size-4 shrink-0 ${tone === "danger" ? "text-destructive" : "text-muted-foreground"}`} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm leading-relaxed">{body}</span>
        {note !== null && <span className="text-muted-foreground text-xs text-pretty">{note}</span>}
      </span>
    </div>
  );
}

const KIND_KEY = {
  TRANSLATION: "translation",
  IMPORT: "import",
  PUBLISH: "publish",
  SURFACE: "surface",
  MEMBER: "member",
  SETTINGS: "settings",
} as const satisfies Record<EventRow["kind"], keyof typeof m.logs.detail.kindLabel>;

function actorLabel(row: EventRow): string {
  if (row.actor.kind === "AUTOMATION") return row.kind === "IMPORT" ? m.logs.trigger.ci : m.logs.trigger.cron;
  if (row.actor.kind === "UNKNOWN") return m.common.unreadable;
  if (row.actor.removed) return m.logs.trigger.removed;
  return row.actor.name ?? row.actor.emailLabel ?? m.logs.trigger.removed;
}

function surfaceWord(status: "imported" | "partial" | "failed" | "superseded"): string {
  if (status === "imported") return m.logs.status.imported;
  if (status === "partial") return m.logs.status.partial;
  if (status === "superseded") return m.logs.status.superseded;
  return m.logs.status.failed;
}

/**
 * 종류가 정하는 필드들. **빈 칸을 만들지 않는다** — 값이 없으면 줄 자체를 안 그린다.
 *
 * ⚠️ **보관 여부를 받지 않는다** — 그 분기는 실패 **사유 문장** 하나에만 걸리고(`planArchivedReason`),
 * 여기까지 끌고 오면 안 쓰는 인자가 "빠뜨린 갈래"처럼 읽힌다.
 */
function fields(row: EventRow): [string, ReactNode][] {
  const out: [string, ReactNode][] = [];
  const payload = row.payload;
  if (row.kind === "PUBLISH") {
    out.push([m.logs.detail.labels.trigger, row.actor.kind === "AUTOMATION" ? m.logs.trigger.cron : actorLabel(row)]);
    out.push([
      m.logs.detail.labels.files,
      row.run?.changed == null ? (
        <>
          {m.logs.none} <span className="text-muted-foreground text-xs">{m.logs.detail.notRecordedForRun}</span>
        </>
      ) : (
        m.logs.meta.files(row.run.changed)
      ),
    ]);
    out.push([
      m.logs.detail.labels.pullRequest,
      row.run?.prUrl == null ? (
        <span className="text-muted-foreground">{m.logs.detail.noPullRequest}</span>
      ) : (
        <a href={row.run.prUrl} target="_blank" rel="noreferrer" className="text-blue-600">
          {m.translations.publish.viewLink}
        </a>
      ),
    ]);
    if (row.run?.errorCode != null) out.push([m.logs.detail.labels.errorCode, <span className="font-mono text-sm">{row.run.errorCode}</span>]);
    if (payload?.kind === "PUBLISH" && payload.refusal !== null) out.push([m.logs.detail.labels.effect, refusalMessage(payload.refusal)]);
  }
  if (payload?.kind === "TRANSLATION") {
    out.push([m.logs.detail.labels.source, payload.surfaceSlug]);
    out.push([m.logs.detail.labels.key, <span className="font-mono text-sm [overflow-wrap:anywhere]">{payload.key}</span>]);
    out.push([m.logs.detail.labels.locale, payload.locale]);
  }
  if (payload?.kind === "IMPORT") {
    out.push([m.logs.detail.labels.trigger, `${payload.source === "ci" ? m.logs.trigger.ci : actorLabel(row)}`]);
    if (row.result === "deferred" && payload.pendingEdits !== null) out.push([m.logs.detail.labels.unsentEdits, m.logs.deferredReason(payload.pendingEdits)]);
    else if ((payload.pendingEdits ?? 0) > 0) out.push([m.logs.detail.labels.unsentEdits, m.repositorySync.kept(payload.pendingEdits!)]);
    if (payload.errorCode !== null) out.push([m.logs.detail.labels.errorCode, <span className="font-mono text-sm">{payload.errorCode}</span>]);
    if (payload.refusal !== null) out.push([m.logs.detail.labels.effect, refusalMessage(payload.refusal)]);
    if (payload.keys !== null) out.push([m.logs.detail.labels.resultPerSource, m.logs.meta.keys(payload.keys)]);
  }
  if (payload?.kind === "MEMBER") {
    out.push([m.logs.detail.labels.member, payload.targetLabel]);
    if (payload.role !== null) out.push([m.logs.detail.labels.role, `${payload.role.before ?? m.logs.none} → ${payload.role.after ?? m.logs.none}`]);
  }
  if (payload?.kind === "SURFACE") {
    out.push([m.logs.detail.labels.source, payload.surfaceSlug]);
    if (payload.baseLocale !== null) out.push([m.logs.detail.labels.effect, `${payload.baseLocale.before ?? m.logs.none} → ${payload.baseLocale.after ?? m.logs.none}`]);
  }
  if (payload?.kind === "SETTINGS" && payload.value !== null) {
    out.push([m.logs.detail.labels.effect, `${payload.value.before ?? m.logs.none} → ${payload.value.after ?? m.logs.none}`]);
  }
  return out;
}

/** 목적지 링크 하나 — 권한이 없거나 대상이 없으면 **그리지 않는다.** */
function destination(row: EventRow, slug: string, canOpenSettings: boolean, repoUrl: string | null): ReactNode {
  const className =
    "border-border hover:bg-accent focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";
  if (row.kind === "MEMBER") return <Link href={routes.members(slug)} className={className}>{m.logs.detail.actions.openMembers}</Link>;
  if (row.kind === "SETTINGS" && canOpenSettings) return <Link href={routes.settings(slug)} className={className}>{m.logs.detail.actions.openSettings}</Link>;
  if (row.kind === "PUBLISH" && repoUrl !== null) return <a href={repoUrl} target="_blank" rel="noreferrer" className={className}>{m.logs.detail.actions.openRepository}</a>;
  return null;
}
