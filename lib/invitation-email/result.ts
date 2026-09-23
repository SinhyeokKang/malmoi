/**
 * Resend `/emails/batch` 응답 판정 (design §4). **요청 단위**다 — 주소별 발송 상태를 만들지 않는다.
 *
 * ⚠️ **accepted는 보낸 수만큼의 id를 확인했을 때뿐이다.** 모자라거나 모양을 모르면 unknown이다 —
 * 일부가 나갔을 수 있으므로 성공으로도 실패로도 접지 않는다(unknown 안내가 "다시 보내면 이전 링크가
 * 만료된다"를 알린다).
 */

export type BatchResponse = { kind: "http"; status: number; body: unknown } | { kind: "failed" };
export type EmailOutcome = "accepted" | "rejected" | "unknown";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasAllIds(body: unknown, expected: number): boolean {
  if (!isRecord(body)) return false;
  // 허용 모드의 부분 실패 목록이다 — 하나라도 있으면 전부 접수됐다고 말할 수 없다.
  if (Array.isArray(body.errors) && body.errors.length > 0) return false;
  const data = body.data;
  if (!Array.isArray(data) || data.length !== expected) return false;
  return data.every((item) => isRecord(item) && typeof item.id === "string" && item.id !== "");
}

export function judgeBatchResponse(response: BatchResponse, expected: number): EmailOutcome {
  if (response.kind === "failed") return "unknown";
  const { status, body } = response;
  if (status >= 200 && status < 300) return hasAllIds(body, expected) ? "accepted" : "unknown";
  // 408은 공급자 쪽 timeout이라 처리 여부를 모른다. 나머지 4xx는 요청을 받지 않았다는 명시적 거부다.
  if (status >= 400 && status < 500 && status !== 408) return "rejected";
  return "unknown";
}
