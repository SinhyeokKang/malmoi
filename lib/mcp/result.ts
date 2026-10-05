import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import type { Credential } from "@/lib/auth/subject";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { en } from "@/messages/en";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "@/lib/settings/message";

import { BATCH_SAVE_LIMIT } from "./batch";

/**
 * 도구 결과 변환 (mcp-connector design §2.3). 모든 도구의 union이 여기를 지나 MCP `CallToolResult`가 된다.
 *
 * - 거부는 `isError: true` + 기존 거부 코드 + **화면과 같은 문장**이다. 화면에 있는 거부는 화면의 키를 가리키고, 도구에만 있는
 *   갈래만 `en.mcp`에 있다 — 같은 거부에 문구가 두 벌이면 안 된다.
 * - **장애는 거부가 아니다**(ARCHITECTURE §6.00 ②) — `unavailable`은 `retryable: true`를 싣는다. 거부 중에는 `sync-running`(적재 lease —
 *   기다리면 풀린다, sync-lock C4)만 같은 표시와 다시 열리는 시각(`detail`)을 싣는다.
 * - **예외 문구를 싣지 않는다**(§6.0) — 결과 모양에 예외 자리가 없고, 입력의 다른 필드는 읽지 않는다.
 *
 * 도구가 새 거부 갈래를 내면 `TOOL_REJECTIONS`와 `MESSAGE`에 함께 늘린다 — `satisfies`가 빠진 갈래를 잡는다.
 * ⚠️ **`token-scope`만 주체를 본다**(#149) — 다음 행동이 개인 토큰은 재발급, OAuth 연결은 앱에서 다시 연결이다. 상태 코드는 같고 문장만 갈린다.
 */

export const TOOL_REJECTIONS = [
  "not-found", "forbidden", "archived", "unavailable", "token-scope",
  "repo-read-only", "sample-expired", "manual-no-match", "not-ready",
  "reconfirm", "invalid-input", "too-many", "duplicate-key", "sync-running",
] as const;
export type ToolRejection = (typeof TOOL_REJECTIONS)[number];

export type NeedsBrowserReason = "not-connected" | "reauthorize" | "no-installations" | "no-candidates";

export type ToolOutcome =
  | { status: "ok"; data: Record<string, unknown>; summary: string }
  | { status: ToolRejection }
  /**
   * 코어가 Action과 같은 union으로 낸 거부 — 화면의 사전을 그대로 지난다(`rejectionMessage`). 화면이 공용 사전 밖(Sync 결과·Publish
   * 모달·Revert 문구)에서 문장을 고르는 거부는 호출부가 **그 화면의 키**를 `message`로 넘긴다 — 새 문장을 쓰지 않는다.
   */
  | { status: "refused"; code: string; message?: string; detail?: Record<string, unknown> }
  /** URL은 `lib/routes.ts`가 만든 앱 경로다 — 서명·nonce를 싣지 않는다(design §2.4). */
  | { status: "needs-browser"; reason: NeedsBrowserReason; url: string };

export type ToolResult = {
  isError: boolean;
  content: [{ type: "text"; text: string }];
  structuredContent: Record<string, unknown>;
};

const MESSAGE = {
  "not-found": en.errors.access["not-found"],
  forbidden: en.errors.access.forbidden,
  archived: en.errors.access.archived,
  unavailable: en.errors.access.unavailable,
  "token-scope": en.mcp.errors["token-scope"],
  "repo-read-only": en.errors.connect["repo-read-only"],
  "sample-expired": en.errors.onboarding["sample-expired"],
  "manual-no-match": en.errors.onboarding["manual-no-match"],
  "not-ready": en.errors.onboarding["not-ready"],
  reconfirm: en.mcp.errors.reconfirm,
  "invalid-input": en.mcp.errors["invalid-input"],
  "too-many": en.mcp.errors["too-many"](BATCH_SAVE_LIMIT),
  "duplicate-key": en.mcp.errors["duplicate-key"],
  // 적재 lease 중 번역 쓰기 거부(sync-lock C4) — Sync 결과 화면의 문장이다. 다시 열리는 시각은 호출부가 `detail`로 싣는다.
  "sync-running": en.repositorySync.errors["already-running"],
} satisfies Record<ToolRejection, string>;

const text = (value: string): ToolResult["content"] => [{ type: "text", text: value }];

/**
 * 코어 거부 코드 → 화면과 같은 문장. 도구 전용 갈래(`MESSAGE`)를 먼저, 그다음 화면의 사전을 화면이 읽는 순서로 본다 — 온보딩 화면은
 * `onboardErrorMessage`가 연결 거부 다섯을 `connectErrorMessage`로 넘긴다. 어느 사전에도 없으면 `null`이다.
 */
function rejectionMessage(code: string, credential: Credential["kind"] | undefined): string | null {
  if (code === "token-scope") return scopeMessage(credential);
  if (Object.hasOwn(MESSAGE, code)) return MESSAGE[code as ToolRejection];
  if (isAccessError(code)) return accessErrorMessage(en, code);
  if (isRepositorySettingsError(code)) return repositorySettingsErrorMessage(en, code);
  if (isOnboardError(code)) return onboardErrorMessage(en, code);
  if (isConnectError(code)) return connectErrorMessage(en, code);
  return null;
}

/** 주체를 모르면(세션 경로·테스트) 개인 토큰 문장이다 — 그 전부터 그 문장이었다. */
function scopeMessage(credential: Credential["kind"] | undefined): string {
  return credential === "oauth" ? en.mcp.errors["token-scope-oauth"] : MESSAGE["token-scope"];
}

export function toToolResult(outcome: ToolOutcome, credential?: Credential["kind"]): ToolResult {
  if (outcome.status === "ok") return { isError: false, content: text(outcome.summary), structuredContent: outcome.data };
  if (outcome.status === "refused") {
    const message = outcome.message ?? rejectionMessage(outcome.code, credential);
    // 모르는 코드는 장애로 접는다 — 코드 원문을 싣지 않는다(코어 밖의 값이 결과로 새지 않게).
    if (message === null) return toToolResult({ status: "unavailable" });
    // 장애는 재시도 표시를 싣는다 — `detail`(코드·전송 여부)은 호출부가 고른 값이다.
    if (outcome.code === "unavailable") {
      return { isError: true, content: text(MESSAGE.unavailable), structuredContent: { ...outcome.detail, status: "unavailable", message: MESSAGE.unavailable, retryable: true } };
    }
    // `detail`은 호출부가 고른 값(행 오류 인덱스·재시도 시각 등)이다 — 예외·원문을 싣지 않는다.
    // ⚠️ 재시도 표시는 코드가 정한다 — 호출부가 화면 문장(`message`)을 골라 넘겨도 `sync-running`은 기다리면 풀리는 거부다.
    const retryable = outcome.code === "sync-running" ? { retryable: true } : {};
    return { isError: true, content: text(message), structuredContent: { ...outcome.detail, status: outcome.code, message, ...retryable } };
  }
  if (outcome.status === "needs-browser") {
    const message = en.mcp.needsBrowser[outcome.reason];
    return { isError: true, content: text(`${message} ${outcome.url}`), structuredContent: { status: "needs-browser", reason: outcome.reason, url: outcome.url, message } };
  }
  // ⚠️ 사전 조회는 `Object.hasOwn`으로 — 타입 밖의 값(`constructor` 등)이 프로토타입에서 문장을 찾지 않게(POSTMORTEM 2026-09-08).
  const status: ToolRejection = Object.hasOwn(MESSAGE, outcome.status) ? outcome.status : "unavailable";
  const message = status === "token-scope" ? scopeMessage(credential) : MESSAGE[status];
  return {
    isError: true,
    content: text(message),
    structuredContent: status === "unavailable" || status === "sync-running" ? { status, message, retryable: true } : { status, message },
  };
}
