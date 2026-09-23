import { normalizeEmail } from "@/lib/auth/email";

import { INVITATION_HOURLY_LIMIT } from "./limits";

/**
 * 다중 초대 입력 검증 (design §3.2). 클라이언트 폼과 Server Action이 **같은 판정**을 지난다.
 *
 * ⚠️ **일부 오류가 있는 주소를 조용히 빼고 보내지 않는다** — 오류 행의 입력 인덱스를 돌려주고 요청 전체를 거부한다.
 */

export type InviteRole = "OWNER" | "EDITOR";
export type Recipient = { email: string; role: InviteRole };
export type RecipientRowError = { index: number; code: "invalid-email" | "invalid-role" | "duplicate" };

export type RecipientsResult =
  | { status: "ok"; recipients: Recipient[] }
  | { status: "empty" }
  | { status: "too-many"; limit: number }
  | { status: "invalid-rows"; rowErrors: RecipientRowError[] };

/**
 * ⚠️ **`zod`를 쓰지 않는다** — 이 모듈은 클라이언트 폼도 부르는데 `zod`가 클라이언트 허용 목록 밖이다
 * (`components/__tests__/client-graph.test.ts`). 정규식은 zod 4.5.4 `z.string().email()`의 것을 그대로
 * 옮겼다 — 단건 초대가 쓰던 판정과 같은 주소를 받는다. 320은 RFC 5321의 주소 최대 길이다.
 */
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
const EMAIL_MAX = 320;

function isRole(value: string): value is InviteRole {
  return value === "OWNER" || value === "EDITOR";
}

export function splitPastedEmails(text: string): string[] {
  return text.split(/[\s,;]+/).filter((part) => part !== "");
}

export function parseRecipients(rows: readonly { email: string; role: string }[]): RecipientsResult {
  const recipients: Recipient[] = [];
  const rowErrors: RecipientRowError[] = [];
  // Map이다 — 남이 정한 문자열(주소)을 키로 쓰므로 평범한 객체면 `__proto__`가 조용히 사라진다.
  const seen = new Map<string, number>();

  rows.forEach((row, index) => {
    // 완전히 빈 행은 "아직 안 채운 칸"이지 잘못된 주소가 아니다.
    const trimmed = row.email.trim();
    if (trimmed === "") return;

    if (trimmed.length > EMAIL_MAX || !EMAIL.test(trimmed)) {
      rowErrors.push({ index, code: "invalid-email" });
      return;
    }
    const role = row.role;
    if (!isRole(role)) {
      rowErrors.push({ index, code: "invalid-role" });
      return;
    }
    // 중복은 정규화한 원문으로 가린다 — 마스킹 라벨로 가리면 다른 두 주소가 한 행이 된다(POSTMORTEM 2026-09-09).
    const email = normalizeEmail(trimmed);
    if (seen.has(email)) {
      rowErrors.push({ index, code: "duplicate" });
      return;
    }
    seen.set(email, index);
    recipients.push({ email, role });
  });

  if (rowErrors.length > 0) return { status: "invalid-rows", rowErrors };
  if (recipients.length === 0) return { status: "empty" };
  if (recipients.length > INVITATION_HOURLY_LIMIT) return { status: "too-many", limit: INVITATION_HOURLY_LIMIT };
  return { status: "ok", recipients };
}
