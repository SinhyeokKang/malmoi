import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";
import { normalizeEmail } from "@/lib/auth/email";

export class CredentialError extends Error {
  constructor() { super("credential storage unavailable"); this.name = "CredentialError"; }
}
const invalid = (): never => { throw new CredentialError(); };
const validId = (id: string) => /^[A-Za-z0-9_-]{1,32}$/.test(id);
function keyCheck(key: Buffer, kid: string): void {
  if (key.length !== 32 || !validId(kid)) invalid();
}
function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) invalid();
  const result = Buffer.from(value, "base64url");
  if (result.toString("base64url") !== value) invalid();
  return result;
}
export function parseKeyring(raw: string): ReadonlyMap<string, Buffer> {
  try {
    const data: unknown = JSON.parse(raw);
    if (data === null || typeof data !== "object" || Array.isArray(data)) return invalid();
    const result = new Map<string, Buffer>();
    for (const [id, encoded] of Object.entries(data)) {
      if (typeof encoded !== "string") return invalid();
      const key = Buffer.from(encoded, "base64");
      keyCheck(key, id);
      if (key.toString("base64") !== encoded) return invalid();
      result.set(id, key);
    }
    if (result.size === 0) return invalid();
    return result;
  } catch { return invalid(); }
}
export function encrypt(value: string, aad: string, kid: string, key: Buffer, nonce: Buffer): string {
  keyCheck(key, kid);
  if (nonce.length !== 12) return invalid();
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["enc", "v1", kid, nonce.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(":");
}
export function decrypt(value: string, aad: string, keys: ReadonlyMap<string, Buffer>): string {
  try {
    const parts = value.split(":");
    const [prefix, version, kid, iv, body, tag] = parts;
    if (parts.length !== 6 || prefix !== "enc" || version !== "v1" || kid === undefined || iv === undefined || body === undefined || tag === undefined) return invalid();
    const key = keys.get(kid);
    if (!key) return invalid();
    keyCheck(key, kid);
    const nonce = decode(iv), ciphertext = decode(body), authTag = decode(tag);
    if (nonce.length !== 12 || authTag.length !== 16) return invalid();
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch { return invalid(); }
}
export function emailLookup(email: string, scope: string, key: Buffer, kid: string): string {
  keyCheck(key, kid);
  const normalized = normalizeEmail(email);
  if (!normalized) return invalid();
  return `hmac:v1:${kid}:${createHmac("sha256", key).update(JSON.stringify(["malmoi/email-lookup", "v1", scope, normalized])).digest("hex")}`;
}
export function hashSessionToken(raw: string): string {
  return `sha256:v1:${createHash("sha256").update("malmoi/session/v1\0").update(raw).digest("hex")}`;
}
export function isSessionValid(expires: Date, now: Date): boolean { return expires.getTime() > now.getTime(); }
