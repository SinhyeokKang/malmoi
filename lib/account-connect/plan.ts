import { isLoginProvider, type LoginProvider } from "@/lib/login-link/policy";
export const CONNECT_OUTCOMES = ["connected", "email-mismatch", "already-connected", "taken-by-other", "expired", "cancelled", "unverified", "wrong-user", "failed"] as const;
export type ConnectOutcome = (typeof CONNECT_OUTCOMES)[number];
const outcomes: ReadonlySet<string> = new Set(CONNECT_OUTCOMES);
export function connectOutcome(raw: string | undefined): ConnectOutcome | null {
  return raw !== undefined && outcomes.has(raw) ? raw as ConnectOutcome : null;
}
export function isUnlinkOutcome(raw: string | undefined): raw is "disconnected" | "last-method" | "unavailable" {
  return raw === "disconnected" || raw === "last-method" || raw === "unavailable";
}
const PURPOSE = "malmoi/account-connect";
export type ConnectChallenge = { userId: string; provider: LoginProvider; emailLookup: string; sessionDigest: string; stateDigest: string };
export function connectChallengePrefix(userId?: string): string {
  return JSON.stringify(userId === undefined ? [PURPOSE, "v1"] : [PURPOSE, "v1", userId]).slice(0, -1) + ",";
}
export function connectChallengeIdentifier(c: ConnectChallenge): string {
  return JSON.stringify([PURPOSE, "v1", c.userId, c.provider, c.emailLookup, c.sessionDigest, c.stateDigest]);
}
export function parseConnectChallenge(identifier: string): ConnectChallenge | null {
  try {
    const a: unknown = JSON.parse(identifier);
    if (!Array.isArray(a) || a.length !== 7) return null;
    const [purpose, version, userId, provider, emailLookup, sessionDigest, stateDigest] = a;
    if (purpose !== PURPOSE || version !== "v1" || typeof userId !== "string" || !userId || !isLoginProvider(provider) ||
      typeof emailLookup !== "string" || !/^hmac:v1:[^:]+:[a-f0-9]{64}$/.test(emailLookup) ||
      typeof sessionDigest !== "string" || !/^sha256:v1:[a-f0-9]{64}$/.test(sessionDigest) ||
      typeof stateDigest !== "string" || !/^[a-f0-9]{64}$/.test(stateDigest)) return null;
    const c = { userId, provider, emailLookup, sessionDigest, stateDigest };
    return connectChallengeIdentifier(c) === identifier ? c : null;
  } catch { return null; }
}
/** state/sessionToken are digests prepared by store.ts; this module is safe in the client graph. */
export function planLoginMethodLink(input: {
  challenge: (ConnectChallenge & { expires: Date }) | null; sessionUserId: string | null;
  provider: string; providerLookup: string | null; existing: { userId: string } | null;
  state: string; sessionToken: string; now: Date;
}): ConnectOutcome {
  const c = input.challenge;
  if (!c || !(c.expires.getTime() > input.now.getTime())) return "expired";
  if (c.userId !== input.sessionUserId || c.sessionDigest !== input.sessionToken) return "wrong-user";
  if (c.stateDigest !== input.state || c.provider !== input.provider) return "failed";
  if (input.providerLookup === null || input.providerLookup === "") return "unverified";
  if (input.providerLookup !== c.emailLookup) return "email-mismatch";
  if (input.existing) return input.existing.userId === c.userId ? "already-connected" : "taken-by-other";
  return "connected";
}
