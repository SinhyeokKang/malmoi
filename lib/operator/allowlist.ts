import { normalizeEmail } from "@/lib/auth/email";

/**
 * `OPERATOR_EMAILS`(쉼표 구분 이메일 주소 전체) → 정규화한 주소 집합.
 *
 * 조각마다 계정 병합·저장과 **같은 `normalizeEmail`** 을 지난다 — 갈리면 env 주소가 그 사람의 `emailLookup`과
 * 안 맞아 운영자가 조용히 비운영자가 된다. `@`가 정확히 하나이고 앞뒤가 비지 않은 조각만 받고 나머지는 버린다
 * (형식이 틀린 한 조각이 나머지 운영자를 지우지 않게). 도메인 단위 지정은 없다 — 주소 전체가 같아야 한다.
 *
 * Set이라 남이 정한 문자열(`__proto__` 등)을 키로 쓰는 문제가 없다.
 */
export function parseOperatorEmails(raw: string | undefined): ReadonlySet<string> {
  const emails = new Set<string>();
  if (raw === undefined) return emails;
  for (const piece of raw.split(",")) {
    const email = normalizeEmail(piece);
    const parts = email.split("@");
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") continue;
    emails.add(email);
  }
  return emails;
}
