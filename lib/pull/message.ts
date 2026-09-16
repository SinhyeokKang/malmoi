import type { SyncErrorCode } from "@/lib/sync/plan";
import type { PullResult } from "./run";

export type PullOutcome =
  | PullResult
  | { status: "failed"; error: string; delivery: "not-started" | "unknown"; code?: SyncErrorCode; retryable?: boolean; retryAfterSeconds?: number };
