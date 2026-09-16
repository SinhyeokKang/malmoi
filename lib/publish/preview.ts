import type { OpenImportPr } from "@/lib/import/confirm";
import type { PublishDiff } from "./diff";
/** `keys`는 **미발송 전체**의 키 수다 — 표에 실린 행이 아니라 바닥 요약이 드는 값이다. */
export type PublishPreview = PublishDiff & { openPr: OpenImportPr; keys: number };
export type PublishModalState =
  | { kind: "preview-loading" }
  | { kind: "preview-ready"; preview: PublishPreview }
  | { kind: "preview-error" }
  | { kind: "running" }
  | { kind: "result"; outcome: import("@/lib/pull/message").PullOutcome };
