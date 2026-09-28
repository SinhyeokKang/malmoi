import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "@/lib/settings/message";

import { BATCH_SAVE_LIMIT } from "./batch";

/**
 * 도구 결과 변환 (mcp-connector design §2.3). 모든 도구의 union이 여기를 지나 MCP `CallToolResult`가 된다.
 *
 * - 거부는 `isError: true` + 기존 거부 코드 + **화면과 같은 문장**이다. 화면에 있는 거부는 화면의 키를 가리키고, 도구에만 있는
 *   갈래만 `m.mcp`에 있다 — 같은 거부에 문구가 두 벌이면 안 된다.
 * - **장애는 거부가 아니다**(ARCHITECTURE §6.00 ②) — `unavailable`만 `retryable: true`를 싣는다.
 * - **예외 문구를 싣지 않는다**(§6.0) — 결과 모양에 예외 자리가 없고, 입력의 다른 필드는 읽지 않는다.
 *
 * 도구가 새 거부 갈래를 내면 `TOOL_REJECTIONS`와 `MESSAGE`에 함께 늘린다 — `satisfies`가 빠진 갈래를 잡는다.
 */

export const TOOL_REJECTIONS = [
  "not-found", "forbidden", "archived", "unavailable", "token-scope",
  "repo-read-only", "sample-expired", "manual-no-match", "not-ready",
  "reconfirm", "invalid-input", "too-many", "duplicate-key",
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
  "not-found": m.errors.access["not-found"],
  forbidden: m.errors.access.forbidden,
  archived: m.errors.access.archived,
  unavailable: m.errors.access.unavailable,
  "token-scope": m.mcp.errors["token-scope"],
  "repo-read-only": m.errors.connect["repo-read-only"],
  "sample-expired": m.errors.onboarding["sample-expired"],
  "manual-no-match": m.errors.onboarding["manual-no-match"],
  "not-ready": m.errors.onboarding["not-ready"],
  reconfirm: m.mcp.errors.reconfirm,
  "invalid-input": m.mcp.errors["invalid-input"],
  "too-many": m.mcp.errors["too-many"](BATCH_SAVE_LIMIT),
  "duplicate-key": m.mcp.errors["duplicate-key"],
} satisfies Record<ToolRejection, string>;

const text = (value: string): ToolResult["content"] => [{ type: "text", text: value }];

/**
 * 코어 거부 코드 → 화면과 같은 문장. 도구 전용 갈래(`MESSAGE`)를 먼저, 그다음 화면의 사전을 화면이 읽는 순서로 본다 — 온보딩 화면은
 * `onboardErrorMessage`가 연결 거부 다섯을 `connectErrorMessage`로 넘긴다. 어느 사전에도 없으면 `null`이다.
 */
function rejectionMessage(code: string): string | null {
  if (Object.hasOwn(MESSAGE, code)) return MESSAGE[code as ToolRejection];
  if (isAccessError(code)) return accessErrorMessage(code);
  if (isRepositorySettingsError(code)) return repositorySettingsErrorMessage(code);
  if (isOnboardError(code)) return onboardErrorMessage(code);
  if (isConnectError(code)) return connectErrorMessage(code);
  return null;
}

export function toToolResult(outcome: ToolOutcome): ToolResult {
  if (outcome.status === "ok") return { isError: false, content: text(outcome.summary), structuredContent: outcome.data };
  if (outcome.status === "refused") {
    const message = outcome.message ?? rejectionMessage(outcome.code);
    // 모르는 코드는 장애로 접는다 — 코드 원문을 싣지 않는다(코어 밖의 값이 결과로 새지 않게).
    if (message === null || outcome.code === "unavailable") return toToolResult({ status: "unavailable" });
    // `detail`은 호출부가 고른 값(행 오류 인덱스·재시도 시각 등)이다 — 예외·원문을 싣지 않는다.
    return { isError: true, content: text(message), structuredContent: { ...outcome.detail, status: outcome.code, message } };
  }
  if (outcome.status === "needs-browser") {
    const message = m.mcp.needsBrowser[outcome.reason];
    return { isError: true, content: text(`${message} ${outcome.url}`), structuredContent: { status: "needs-browser", reason: outcome.reason, url: outcome.url, message } };
  }
  // ⚠️ 사전 조회는 `Object.hasOwn`으로 — 타입 밖의 값(`constructor` 등)이 프로토타입에서 문장을 찾지 않게(POSTMORTEM 2026-09-08).
  const status: ToolRejection = Object.hasOwn(MESSAGE, outcome.status) ? outcome.status : "unavailable";
  const message = MESSAGE[status];
  return {
    isError: true,
    content: text(message),
    structuredContent: status === "unavailable" ? { status, message, retryable: true } : { status, message },
  };
}
