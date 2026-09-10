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
export function verifyLookupEmail(actual: string, expected: string): void {
  if (normalizeEmail(actual) !== normalizeEmail(expected)) throw new CredentialError();
}
