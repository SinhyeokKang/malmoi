import type { PullOutcome } from "@/lib/pull/message";
import { m } from "@/lib/i18n";
export type PublishView = "created" | "updated" | "partial" | "no-changes" | "config-error" | "transient-error" | "already-running" | "too-soon";
export function planPublishView(outcome: PullOutcome): PublishView {
  switch (outcome.status) {
    case "committed": return outcome.pr;
    // writer 경고는 **보내지 않은** 결과다(sync-edit-protection T10) — `partial` 갈래가 "보내지 않았다"로 선다. 새 갈래를 늘리지 않는다.
    // 보류만 있고 실린 편집이 0이면 "No changes"(파일이 같았다)가 거짓이다 — 같은 Not sent 틀을 쓴다(delivery-invariants D7).
    case "skipped": return outcome.reason === "writer-warnings" || outcome.reason === "withheld" ? "partial" : "no-changes";
    case "failed":
      if (outcome.error === "already-running" || outcome.error === "too-soon") return outcome.error;
      return outcome.retryable ? "transient-error" : "config-error";
    default: { const exhaustive: never = outcome; return exhaustive; }
  }
}
export function planPublishButton({ count, paused, otherPending, publishPending }: { count: number; paused: boolean; otherPending: boolean; publishPending: boolean }) {
  return { mode: publishPending ? "progress" as const : "preview" as const,
    disabled: !publishPending && (count === 0 || paused || otherPending),
    badge: !publishPending && count > 0 ? count : null,
    hint: count === 0 ? m.translations.publish.nothing : paused || otherPending ? m.translations.publish.paused : "" };
}

/**
 * 이번 PR에 못 실은 편집의 줄 (delivery-invariants D7). 사유별 한 줄 — 파일이 없다 / 키 자리가 없다 — 에 역할별 다음 행동을 붙인다.
 * ⚠️ 화면에 있는 컨트롤만 가리킨다(POSTMORTEM 2026-09-14) — `Revert to last sent`는 OWNER에게만 선다.
 */
export function planWithheldLines(outcome: PullOutcome, role: "OWNER" | "EDITOR"): string[] {
  const withheld = outcome.status === "committed" || (outcome.status === "skipped" && (outcome.reason === "no-changes" || outcome.reason === "withheld"))
    ? outcome.withheld : undefined;
  if (withheld === undefined) return [];
  const w = m.translations.publish.withheld;
  const lines: string[] = [];
  if (withheld.file > 0) lines.push(`${w.file(withheld.file)} ${role === "OWNER" ? w.owner.file : w.editor}`);
  if (withheld.key > 0) lines.push(`${w.key(withheld.key)} ${role === "OWNER" ? w.owner.key : w.editor}`);
  return lines;
}
