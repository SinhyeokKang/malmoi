import { CredentialError } from "./crypto";
import type { ConversionOptions } from "./conversion";
import type { MigrationMode } from "./migration";
export function credentialCommand(args: string[]): ConversionOptions {
  const allowed = ["--apply", "--traffic-blocked", "--writers-drained"];
  const modes: MigrationMode[] = ["backfill", "verify", "rotate-token", "rotate-pii", "reindex"];
  let mode: MigrationMode = "backfill";
  const seen = new Set<string>();
  for (const arg of args) {
    const key = arg.split("=")[0]!;
    if (seen.has(key)) throw new CredentialError();
    seen.add(key);
    if (arg.startsWith("--mode=")) {
      const value = arg.slice(7);
      if (!modes.includes(value as MigrationMode)) throw new CredentialError();
      mode = value as MigrationMode;
    } else if (!allowed.includes(arg)) throw new CredentialError();
  }
  const result = { mode, apply: args.includes("--apply"), trafficBlocked: args.includes("--traffic-blocked"), writersDrained: args.includes("--writers-drained") };
  if (result.apply && (!result.trafficBlocked || !result.writersDrained || mode === "verify")) throw new CredentialError();
  return result;
}
export function credentialTarget(env: Readonly<Record<string, string | undefined>>): { target: "dev" | "prod"; url: string } {
  const target = env.CREDENTIAL_TARGET;
  if (target !== "dev" && target !== "prod") throw new CredentialError();
  const url = env[target === "prod" ? "DIRECT_URL_PROD" : "DIRECT_URL"];
  if (!url) throw new CredentialError();
  try {
    const parsed = new URL(url);
    const ref = target === "prod" ? "xgsyyapzkpbdtkrprlmn" : "bfugwmjubgmmroevrave";
    const direct = parsed.hostname === `db.${ref}.supabase.co` && parsed.username === "postgres";
    const pooler = parsed.hostname.endsWith(".pooler.supabase.com") && parsed.username === `postgres.${ref}`;
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.port !== "5432" || parsed.pathname !== "/postgres" || !(direct || pooler) || [...parsed.searchParams].some(([key, value]) => key !== "sslmode" || value !== "verify-full")) throw new CredentialError();
    return { target, url };
  } catch { throw new CredentialError(); }
}
