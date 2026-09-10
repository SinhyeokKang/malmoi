import "server-only";
import { normalizeEmail } from "@/lib/auth/email";
import { CredentialError } from "./crypto";
import { lookupEmail, openPii, sealPii } from "./storage";

type UserFields = { email?: string; name?: string | null; image?: string | null };
export function encodeUserFields(id: string, fields: UserFields): UserFields & { emailLookup?: string } {
  const result: UserFields & { emailLookup?: string } = {};
  if (fields.email !== undefined) {
    const email = normalizeEmail(fields.email);
    result.emailLookup = lookupEmail(email);
    result.email = sealPii(email, { table: "User", id, field: "email" })!;
  }
  for (const field of ["name", "image"] as const) {
    if (fields[field] !== undefined) result[field] = sealPii(fields[field], { table: "User", id, field });
  }
  return result;
}
export function decodeUser<T extends { id: string; email?: string; name?: string | null; image?: string | null; emailLookup?: string | null }>(row: T): Omit<T, "emailLookup"> {
  const { emailLookup: _lookup, ...result } = row;
  if (row.email !== undefined) result.email = openPii(row.email, { table: "User", id: row.id, field: "email" })!;
  for (const field of ["name", "image"] as const) {
    const value = row[field];
    if (value !== undefined) result[field] = openPii(value, { table: "User", id: row.id, field });
  }
  return result;
}
export function encodeInvitationEmail(id: string, projectId: string, email: string) {
  const normalized = normalizeEmail(email);
  return { email: sealPii(normalized, { table: "ProjectInvitation", id, projectId, field: "email" })!, emailLookup: lookupEmail(normalized, projectId) };
}
export function decodeInvitation<T extends { id: string; projectId: string; email: string; emailLookup?: string | null }>(row: T): Omit<T, "emailLookup"> {
  const { emailLookup: _lookup, ...result } = row;
  result.email = openPii(row.email, { table: "ProjectInvitation", id: row.id, projectId: row.projectId, field: "email" })!;
  return result;
}
/**
 * 행 하나의 복호화 실패를 **값으로** 돌려준다 — 목록 로더가 나머지 행을 계속 그리게 하는 자리다.
 *
 * ⚠️ **호출 전에 `validatePiiReadKeys()`를 지나야 한다.** 안 그러면 키 부재라는 **장애**가 행마다
 * `null`로 접혀 "전원 정보 없음"과 구별되지 않는다. 이 함수가 답하는 것은 "이 행이 지금 keyring으로
 * 열리는가"뿐이다.
 *
 * ⚠️ **`CredentialError`만 삼킨다** — Prisma 오류나 프로그래밍 실수를 함께 접으면 그것도 조용해진다.
 */
export function readable<T>(decode: () => T): T | null {
  try {
    return decode();
  } catch (error) {
    if (error instanceof CredentialError) return null;
    throw error;
  }
}

export function verifyLookupEmail(actual: string, expected: string): void {
  if (normalizeEmail(actual) !== normalizeEmail(expected)) throw new CredentialError();
}
