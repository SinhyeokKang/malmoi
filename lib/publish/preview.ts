import type { OpenImportPr } from "@/lib/import/confirm";
import type { PublishDiff } from "./diff";
/** `keys`는 **미발송 전체**의 키 수다 — 표에 실린 행이 아니라 바닥 요약이 드는 값이다. */
export type PublishPreview = PublishDiff & { openPr: OpenImportPr; keys: number };
/**
 * 미리보기 조회의 결과. **거부(`rejected`)와 읽기 실패(`failed`)가 갈린다** (launch-readiness L3.3) — 거부는 실행 전
 * 거부(`1h`)로, 실패만 `1k`의 Retry로 그린다. `error`는 `triggerPullAction`의 실행 전 거부와 같은 낱말이다.
 */
export type PublishPreviewResult =
  | { status: "ok"; preview: PublishPreview }
  | { status: "rejected"; error: "unauthorized" | "forbidden" | "not-found" | "archived" | "invalid input" }
  | { status: "failed" };
export type PublishModalState =
  | { kind: "preview-loading" }
  | { kind: "preview-ready"; preview: PublishPreview }
  | { kind: "preview-error" }
  | { kind: "running" }
  | { kind: "result"; outcome: import("@/lib/pull/message").PullOutcome };
