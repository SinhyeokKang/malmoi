import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CopyButton } from "@/components/onboarding/copy-button";
import { EventGlyph } from "@/components/logs/glyph";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Dialog as DialogTitleSlot } from "radix-ui";
import { eventGlyph, eventSentence, eventView, eventFailureMessage, importReasonMessage, refusalMessage, valueState } from "@/lib/events/view";
import type { EventRow } from "@/lib/events/query";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { utcMinute } from "@/lib/utc-time";
import { cn } from "@/lib/utils";

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
  translationHref = null,
}: {
  row: EventRow;
  slug: string;
  now: Date;
  archived: boolean;
  /** OWNER만 — EDITOR는 그 화면에 못 들어간다. */
  canOpenSettings: boolean;
  repoUrl: string | null;
  /** 번역 사건의 키에 착지하는 주소 — 페이지가 서버에서 키 이름을 현재 id로 해석한다. 사라진 키면 `null`이고 링크가 없다. */
  translationHref?: string | null;
}) {
  const view = eventView({ kind: row.kind, result: row.result, warnings: row.run?.warnings ?? 0, errorCode: row.run?.errorCode ?? null });
  const glyph = eventGlyph({ kind: row.kind, result: row.result, subtype: row.subtype });
  const run = row.kind === "IMPORT" || row.kind === "PUBLISH";

  return (
    <>
      <div data-event-detail-header className="flex shrink-0 items-start gap-3 px-6 pt-6 pb-4">
        <EventGlyph icon={glyph.icon} tone={glyph.tone} size="lg" />
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
              key: row.payload?.kind === "TRANSLATION" ? row.payload.key : "",
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

      {/* ⚠️ **본문은 칩이 아니라 제목 열에서 시작한다** — 좌측 24 + 칩 40 + 간격 12 = 76. 칩 크기나
          헤더 간격을 바꾸면 이 값도 같이 움직인다 (`logs-events.test.tsx`가 셋을 함께 본다). */}
      <div data-event-detail-body className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-6 pb-5 pl-[76px]">
        <div className="border-border overflow-hidden rounded-lg border">
          <Table scrollable={false}>
            <TableBody>
              <Field label={m.logs.detail.labels.reference}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="[overflow-wrap:anywhere]">{row.ref}</span>
                  {/* 동료에게 붙여넣는 것이 링크보다 짧고 **권한과 무관**하다 — 받은 사람은 검색창에 넣는다. */}
                  <CopyButton value={row.ref} label={m.logs.detail.actions.copy} size="sm" />
                </span>
              </Field>
              {fields(row).map(([label, value]) => (
                <Field key={label} label={label}>
                  {value}
                </Field>
              ))}
            </TableBody>
          </Table>
        </div>

        {row.payload?.kind === "TRANSLATION" && (
          <div className="border-divider flex flex-col gap-2 border-t pt-4">
            {/* ⚠️ **색이 아니라 라벨과 자리로 가른다** — 붉은·초록 diff는 색각·흑백에서 두 블록이 같아진다. */}
            <ValueBlock label={m.logs.detail.labels.before} value={row.payload.before} muted />
            <ValueBlock label={m.logs.detail.labels.after} value={row.payload.after} muted={false} />
          </div>
        )}

        {row.payload?.kind === "IMPORT" && row.payload.surfaces.length > 0 && (
          <div className="border-divider flex flex-col gap-2 border-t pt-4">
            <span className="text-neutral-400 text-xs">{m.logs.detail.labels.resultPerSource}</span>
            <div className="border-border overflow-hidden rounded-lg border">
              {row.payload.surfaces.map((surface, index) => (
                <div key={surface.surfaceSlug} className={`flex items-start gap-3 px-3.5 py-3 ${index === 0 ? "" : "border-border border-t"}`}>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-base font-medium">{surface.surfaceSlug}</span>
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

      {/*
        ⚠️ **[Close]가 항상 선다.** 목적지 링크는 종류·권한·대상 생존이 정하므로 없을 수 있고
        (SURFACE·EDITOR가 보는 SETTINGS·대상이 사라진 번역), 그때 이 푸터가 **버튼 0개**로 서서
        구분선과 빈 56px만 남는 판이 됐다 (2026-09-22 `/design-sync` 실측). 닫기는 종류와 무관하다.
        ⚠️ **`data-*`로 잡는다** — 우상단 X와 접근 이름이 같아(둘 다 "Close") role 질의가 둘을 함께 집는다.
      */}
      <div data-event-detail-footer className="border-divider flex shrink-0 items-center gap-2 border-t px-6 py-4">
        {destination(row, slug, canOpenSettings, repoUrl, translationHref)}
        <DialogClose asChild>
          <Button className="ml-auto">{m.logs.detail.actions.close}</Button>
        </DialogClose>
      </div>
    </>
  );
}

/**
 * 키-값 한 줄. ⚠️ **라벨은 `th scope="row"`다** — 표로 감싼 뒤에도 스크린리더가 값마다 라벨을
 * 읽어야 `dl`이던 때의 짝이 유지된다. 읽기 전용 사실이라 행 hover를 끈다.
 *
 * ⚠️ **행 높이 48(`h-12`)의 기준은 [Copy reference]가 든 참조 행이다** — 버튼 28 + 위아래 10×2.
 * 표 행의 `height`는 최소값으로 동작해 여러 줄 값은 그대로 늘어난다. 높이가 고정되면 baseline이
 * 위로 몰리므로 세로 정렬은 가운데다.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TableRow className="h-12 hover:bg-transparent">
      <TableHead scope="row" className="text-neutral-400 h-auto w-[104px] px-3.5 py-2.5 align-middle text-xs font-normal">
        {label}
      </TableHead>
      <TableCell className="px-3.5 py-2.5 align-middle text-base whitespace-normal">{children}</TableCell>
    </TableRow>
  );
}

/** ⚠️ **값이 아닌 상태는 점선 테두리 + 회색 글자**로 한 번 더 갈린다 (캔버스 `1d`). */
function ValueBlock({ label, value, muted }: { label: string; value: string | null; muted: boolean }) {
  const state = valueState(value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-neutral-400 text-xs">{label}</span>
      {state.kind === "text" ? (
        /* ⚠️ **`bg-muted`(#f5f5f5)가 아니라 #fafafa다** — 시안의 Before 면이고, 흰 After와의 대비가
           한 단계 더 연해야 두 블록이 "같은 값의 두 시점"으로 읽힌다. */
        <div className={`border-border rounded-md border px-3 py-2.5 text-base [overflow-wrap:anywhere] whitespace-pre-wrap ${muted ? "bg-neutral-50" : ""}`}>
          {state.text}
        </div>
      ) : (
        <div className="border-border bg-neutral-50 text-muted-foreground rounded-md border border-dashed px-3 py-2.5 text-base">
          {state.label}
        </div>
      )}
    </div>
  );
}

/**
 * 상세의 안내 한 줄 — `Alert`다 (audit #49). 손으로 그린 상자가 Alert의 형(테두리·아이콘·padding)을 따로 들고 있었다.
 * 실패는 `danger`(따라서 `role="alert"`), 나머지는 상시 안내라 `info`다.
 */
function Note({ tone, body, note }: { tone: "danger" | "muted"; body: string; note: string | null }) {
  return (
    <Alert variant={tone === "danger" ? "danger" : "info"}>
      <span className="flex flex-col gap-1">
        <span>{body}</span>
        {note !== null && <span className="text-muted-foreground text-xs text-pretty">{note}</span>}
      </span>
    </Alert>
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
    // 모달의 보류 줄과 같은 수다 — 같은 `SyncRun.withheld`에서 온다(delivery-invariants D7).
    if (row.run !== null && row.run.withheld > 0) out.push([m.logs.detail.labels.withheld, m.logs.detail.withheld(row.run.withheld)]);
    if (row.run?.errorCode != null) out.push([m.logs.detail.labels.errorCode, row.run.errorCode]);
    if (payload?.kind === "PUBLISH" && payload.refusal !== null) out.push([m.logs.detail.labels.effect, refusalMessage(payload.refusal)]);
  }
  if (payload?.kind === "TRANSLATION") {
    out.push([m.logs.detail.labels.source, payload.surfaceSlug]);
    out.push([m.logs.detail.labels.key, <span className="[overflow-wrap:anywhere]">{payload.key}</span>]);
    out.push([m.logs.detail.labels.locale, payload.locale]);
  }
  if (payload?.kind === "IMPORT") {
    out.push([m.logs.detail.labels.trigger, `${payload.source === "ci" ? m.logs.trigger.ci : actorLabel(row)}`]);
    if (row.result === "deferred" && payload.pendingEdits !== null) out.push([m.logs.detail.labels.unsentEdits, m.logs.deferredReason(payload.pendingEdits)]);
    else if ((payload.pendingEdits ?? 0) > 0) out.push([m.logs.detail.labels.unsentEdits, m.repositorySync.kept(payload.pendingEdits!)]);
    if (payload.errorCode !== null) out.push([m.logs.detail.labels.errorCode, payload.errorCode]);
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

/**
 * 시안의 푸터 버튼은 폼이 하나다 — [Close]와 목적지 링크가 `Button` `default`/`md`로 정확히 겹친다
 * (h36 · radius 10 · px 12 · 14 · hover `#fafafa`). ⚠️ **`ButtonLink`가 아니라 `buttonClass()`다** —
 * 셋 중 하나가 외부 리포로 나가는 `target="_blank"`라 `<a>`여야 하고, 그 차용은 `button.tsx`가 정한
 * 경로다(손으로 쓴 클래스 문자열은 `Button`이 받은 hover 교체 같은 갱신을 못 받는다).
 */
const FOOTER_LINK = cn(buttonClass(), "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", "gap-1.5");

/** ⚠️ **화살표는 "여기를 떠난다"는 신호다** — 캔버스가 목적지 셋에 모두 달았고 15/보조색이다. */
const LEAVE = <ArrowUpRight className="text-muted-foreground size-4" aria-hidden />;

/** 목적지 링크 하나 — 권한이 없거나 대상이 없으면 **그리지 않는다.** */
function destination(row: EventRow, slug: string, canOpenSettings: boolean, repoUrl: string | null, translationHref: string | null): ReactNode {
  if (row.kind === "TRANSLATION" && translationHref !== null) return <Link href={translationHref} className={FOOTER_LINK}>{m.logs.detail.actions.openTranslation}{LEAVE}</Link>;
  if (row.kind === "MEMBER") return <Link href={routes.members(slug)} className={FOOTER_LINK}>{m.logs.detail.actions.openMembers}{LEAVE}</Link>;
  if (row.kind === "SETTINGS" && canOpenSettings) return <Link href={routes.settings(slug)} className={FOOTER_LINK}>{m.logs.detail.actions.openSettings}{LEAVE}</Link>;
  if (row.kind === "PUBLISH" && repoUrl !== null) return <a href={repoUrl} target="_blank" rel="noreferrer" className={FOOTER_LINK}>{m.logs.detail.actions.openRepository}{LEAVE}</a>;
  return null;
}
