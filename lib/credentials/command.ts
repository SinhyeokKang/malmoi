import { optionalEnv } from "@/lib/env";
import { CredentialError } from "./crypto";
import { logCredentialFailure } from "./log";
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
export type CredentialTarget = "dev" | "prod" | "self-hosted";
const HOSTED_REFS = { dev: "bfugwmjubgmmroevrave", prod: "xgsyyapzkpbdtkrprlmn" } as const;
/**
 * 셀프 호스팅 DB URL. hosted allowlist 대신 "driver가 대상을 query로 덮을 수 없다"만 고정한다.
 * TLS 생략은 Compose 내부 서비스 호스트(`postgres`)에만 허용한다 — 그 밖은 네트워크를 건너므로 `verify-full`이다(design §4).
 * hosted Supabase ref를 가리키면 거절한다 — self-hosted 명령이 hosted DB를 돌리는 경로를 만들지 않는다.
 */
function selfHostedUrl(parsed: URL): boolean {
  const query = [...parsed.searchParams];
  const tls = query.length === 0 ? null : query.length === 1 && query[0]![0] === "sslmode" ? query[0]![1] : undefined;
  const internal = parsed.hostname === "postgres";
  const tlsOk = tls === "verify-full" || (internal && (tls === null || tls === "disable"));
  const hosted = Object.values(HOSTED_REFS).some(ref => parsed.hostname.includes(ref) || parsed.username.includes(ref));
  return parsed.username !== "" && /^\/[^/]+$/.test(parsed.pathname) && tlsOk && !hosted;
}
// 환경변수는 `lib/env.ts`로 읽는다(CLAUDE.md) — `env`는 테스트가 주입하는 자리다. 스크립트는 넘기지 않는다.
export function credentialTarget(env: Record<string, string | undefined> = process.env): { target: CredentialTarget; url: string } {
  const target = optionalEnv("CREDENTIAL_TARGET", env);
  if (target !== "dev" && target !== "prod" && target !== "self-hosted") throw new CredentialError();
  const url = optionalEnv(target === "prod" ? "DIRECT_URL_PROD" : "DIRECT_URL", env);
  if (!url) throw new CredentialError();
  try {
    const parsed = new URL(url);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new CredentialError();
    if (target === "self-hosted") {
      if (!selfHostedUrl(parsed)) throw new CredentialError();
      return { target, url };
    }
    const ref = HOSTED_REFS[target];
    const direct = parsed.hostname === `db.${ref}.supabase.co` && parsed.username === "postgres";
    const pooler = parsed.hostname.endsWith(".pooler.supabase.com") && parsed.username === `postgres.${ref}`;
    if (parsed.port !== "5432" || parsed.pathname !== "/postgres" || !(direct || pooler) || [...parsed.searchParams].some(([key, value]) => key !== "sslmode" || value !== "verify-full")) throw new CredentialError();
    return { target, url };
  } catch (error) { logCredentialFailure("credential-target", error); throw new CredentialError(); }
}
/**
 * finalize가 부르는 마이그레이션 명령. target마다 명시 분기다 — "prod가 아니면 dev"로 두면 self-hosted가 `PRISMA_TARGET=dev`를 달고
 * 나간다. self-hosted는 `prod`가 아닌 명시값을 세워 `prisma.config.ts`가 `DIRECT_URL`(credentialTarget이 검증한 그 URL)을 읽게 한다 —
 * 지우기만 하면 그 파일의 dotenv가 `.env.local`의 값을 되살릴 수 있다(dotenv는 이미 있는 변수를 덮지 않는다).
 */
export function finalizeDeploy<Env extends Record<string, string | undefined>>(target: CredentialTarget, env: Env): { args: string[]; env: Env } {
  switch (target) {
    case "prod": return { args: ["db:deploy"], env: { ...env, PRISMA_TARGET: "prod" } };
    case "dev": return { args: ["exec", "prisma", "migrate", "deploy"], env: { ...env, PRISMA_TARGET: "dev" } };
    case "self-hosted": return { args: ["exec", "prisma", "migrate", "deploy"], env: { ...env, PRISMA_TARGET: "self-hosted" } };
  }
}
