import type { AdapterError } from "@/lib/adapters/types";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import type { AccessError } from "@/lib/auth/message";
import type { ConnectError } from "@/lib/github-connect/message";
import type { OnboardError } from "@/lib/onboarding/message";

export type SurfaceImportReason = ImportFailureCode | "resource-limit" | "invalid-format" | "superseded" | "lease-lost";
export type SurfaceImportResult = {
  surfaceSlug: string; status: "imported" | "partial" | "failed" | "superseded";
  count: number; failed: number; reason: SurfaceImportReason | null;
  /** 코드에 그대로 남아 관리하지 않는 항목 수 — 실패가 아니라 안내다 (`adapterErrorKind`, B2 r3). */
  unmanaged: number;
  errors: readonly { path: string; code: AdapterError["code"] }[];
};
/** `reconfirm` — 폐기 승인 지문이 없거나 잠금 뒤 재계산과 달랐다(Dialog 뒤 편집·적용·설정 변경). sync-edit-protection — ARCHITECTURE §5.5.2의 폐기 승인. */
export type RepositoryImportError = AccessError | OnboardError | ConnectError | "invalid input" | "not-ready" | "not-connected" | "repo-replaced" | "already-running" | "no-surfaces" | "reconfirm";
/**
 * @param remainingEdits 실행이 끝난 뒤 남은 미전달 편집 — 승인 뒤 저장됐거나 리포에 값이 없어 안 덮인 셀. 0이 아니면 리포 갱신은 계속 멈춘다.
 */
export type RepositoryImportOutcome = { ok: true; surfaces: SurfaceImportResult[]; remainingEdits: number } | { ok: false; error: RepositoryImportError };

/**
 * `runRepositoryImport`의 `try` **앞**에서만 나오는 거부 — 이 넷과 입력·세션 거부는 `finally`의 `revalidatePath`를 지나지 않는다.
 * ⚠️ `unavailable`·`not-found`·`archived`는 `try` 안에서도 나온다(저장소 접근·경합). 거기서는 데이터를 건드리기 전의 거부라
 * 트리가 와도 수치가 같다 — 기다리지 않아도 옛 수치가 틀리지 않는다. `unavailable`은 클라이언트가 접은 throw이기도 하다.
 */
const BEFORE_TRY: ReadonlySet<RepositoryImportError> = new Set<RepositoryImportError>(["invalid input", "unauthorized", "forbidden", "unavailable", "not-found", "archived"]);

/**
 * 이 결과가 **재검증 트리를 싣고 오나** (malmoi#103 r1) — 교차 잠금이 그 트리를 기다릴지를 가른다. `try` 안의 거부(`reconfirm`·
 * `already-running`·`not-ready`…)도 `finally`를 지나 트리가 온다 — 특히 `reconfirm`은 미전달 수가 바뀐 뒤다.
 */
export function importRevalidates(outcome: RepositoryImportOutcome): boolean {
  return outcome.ok || !BEFORE_TRY.has(outcome.error);
}
export type ImportSummary = {
  tone: "success" | "warning" | "danger";
  keys: number; imported: number; partial: number;
  unreadable: readonly string[]; superseded: readonly string[]; invalidFormat: readonly string[];
};

export function summarizeImport(results: readonly SurfaceImportResult[]): ImportSummary {
  const imported = results.filter(result => result.status === "imported").length;
  const partial = results.filter(result => result.status === "partial").length;
  const sorted = [...results].sort((a, b) => a.surfaceSlug < b.surfaceSlug ? -1 : a.surfaceSlug > b.surfaceSlug ? 1 : 0);
  return {
    tone: results.length > 0 && imported === results.length ? "success" : imported + partial > 0 ? "warning" :
      results.length === 0 || results.some(result => result.status === "failed") ? "danger" : "warning",
    keys: results.reduce((sum, result) => sum + result.count, 0), imported, partial,
    unreadable: sorted.filter(result => result.status === "failed" && result.reason !== "invalid-format").map(result => result.surfaceSlug),
    superseded: sorted.filter(result => result.status === "superseded").map(result => result.surfaceSlug),
    invalidFormat: sorted.filter(result => result.reason === "invalid-format").map(result => result.surfaceSlug),
  };
}
