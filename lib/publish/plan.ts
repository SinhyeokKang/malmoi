import type { PullOutcome } from "@/lib/pull/message";
import { m } from "@/lib/i18n";
export type PublishView = "created" | "updated" | "partial" | "no-changes" | "config-error" | "transient-error" | "already-running" | "too-soon";
export function planPublishView(outcome: PullOutcome): PublishView {
  switch (outcome.status) {
    case "committed": return outcome.warnings?.length ? "partial" : outcome.pr;
    case "skipped": return "no-changes";
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
