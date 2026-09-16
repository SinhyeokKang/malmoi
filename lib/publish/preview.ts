import type { OpenImportPr } from "@/lib/import/confirm";
import type { PublishDiff } from "./diff";
export type PublishPreview = PublishDiff & { openPr: OpenImportPr };
export type PublishModalState =
  | { kind: "preview-loading" }
  | { kind: "preview-ready"; preview: PublishPreview }
  | { kind: "preview-error" }
  | { kind: "running" }
  | { kind: "result"; outcome: import("@/lib/pull/message").PullOutcome };
