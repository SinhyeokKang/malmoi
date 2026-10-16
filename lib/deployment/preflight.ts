import { LOGIN_PROVIDER_ENV, loginProviderStates, present } from "@/lib/auth/login-providers";
import { LOGIN_PROVIDERS } from "@/lib/login-link/policy";
import { FROM as INVITATION_FROM } from "@/lib/invitation-email/config";

import { GITHUB_APP_ENV, planGitHubAppConfig } from "./github-app";
import { resolveDeploymentMode, type OriginRejection } from "./mode";

/**
 * **self-hosted 기동 전 판정** (self-hosting design §2·§9). 필수 설정이 빠진 채 뜨면 사용자는 "Try again later"류의 일시 장애 문구나
 * "관리자에게 요청" 경로로 막힌다 — 영구 설정 결함을 일시 장애로 보이게 하지 않으려고 기동 자체를 막는다. 런타임 문구는 신설하지 않는다.
 *
 * ⚠️ **누락·형식만 본다.** 형식은 맞지만 Resend가 거부하는 키·미검증 발신자는 여기서 못 잡는다 — 기존 계약대로 초대 발급 뒤
 * `email-rejected`다. ⚠️ **결과에 값을 싣지 않는다** — 이름과 사유 코드뿐이다(기동 로그에 비밀이 남지 않게).
 *
 * 순수 판정이다 — env 맵과 디렉터리 probe를 주입받는다. 기동 진입 스크립트가 실제 `process.env`·파일 시스템을 넘긴다.
 */

/**
 * self-hosted에서 각 env 이름이 무엇인가. `requireEnv`·`optionalEnv`가 읽는 이름과 `.env.example`의 키가 전부 여기 분류된다(SH-15 ②).
 *
 * - `required` — preflight가 요구한다(web 컨테이너)
 * - `optional` — 없어도 기동한다. ⚠️ 로그인 공급자 여섯(`AUTH_GITHUB_*`·`AUTH_GITLAB_*`·`AUTH_GOOGLE_*`)은 단독으로 optional이고 **쌍 제약은 `preflight()`의
 *   쌍 규칙이 든다** — 완전한 쌍 하나 이상 + 반쪽 0(optional-login-providers design §2.2). 새 분류를 만들지 않은 이유: compose·`.env.example`
 *   대조 필터(`required || optional`)가 그대로 맞는다. `GITHUB_APP_*` 다섯도 optional + all-or-none 그룹이다
 * - `hosted-only` — self-hosted는 읽지 않는다. `INVITATION_EMAIL_ORIGIN`만 있으면 거부한다(`MALMOI_ORIGIN`에서 파생 — 정본 둘 방지)
 * - `command` — web이 아니라 운영 명령·로컬 CLI가 읽는다. ⚠️ `DIRECT_URL`(DDL 자격증명)을 web에 요구하지 않는다 — 앱에는 DDL 권한을 주지 않는다
 */
export const SELF_HOSTED_ENV = {
  MALMOI_ORIGIN: "required",
  MALMOI_UPLOAD_DIR: "required",
  MALMOI_PRIVACY_URL: "required",
  AUTH_URL: "required",
  AUTH_TRUST_HOST: "required",
  AUTH_SECRET: "required",
  AUTH_GITHUB_ID: "optional",
  AUTH_GITHUB_SECRET: "optional",
  AUTH_GITLAB_ID: "optional",
  AUTH_GITLAB_SECRET: "optional",
  AUTH_GOOGLE_ID: "optional",
  AUTH_GOOGLE_SECRET: "optional",
  APP_SIGNING_SECRET: "required",
  DATABASE_URL: "required",
  GITHUB_APP_ID: "optional",
  GITHUB_APP_PRIVATE_KEY: "optional",
  GITHUB_APP_CLIENT_ID: "optional",
  GITHUB_APP_CLIENT_SECRET: "optional",
  GITHUB_APP_SLUG: "optional",
  CRON_SECRET: "required",
  TOKEN_ENCRYPTION_KEYS: "required",
  TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "required",
  PII_ENCRYPTION_KEYS: "required",
  PII_ENCRYPTION_ACTIVE_KEY_ID: "required",
  EMAIL_LOOKUP_KEY: "required",
  EMAIL_LOOKUP_KEY_ID: "required",
  RESEND_API_KEY: "required",
  INVITATION_EMAIL_FROM: "required",
  OPERATOR_EMAILS: "optional",
  INVITATION_EMAIL_ORIGIN: "hosted-only",
  VERCEL_ENV: "hosted-only",
  BLOB_READ_WRITE_TOKEN: "hosted-only",
  BLOB_PUBLIC_HOST: "hosted-only",
  DIRECT_URL_PROD: "hosted-only",
  DIRECT_URL: "command",
  CREDENTIAL_TARGET: "command",
  PUSH_TOKEN: "command",
} as const satisfies Record<string, "required" | "optional" | "hosted-only" | "command">;

export type PreflightReason =
  | "missing"
  | "invalid-format"
  | "present"
  | "vercel-env-present"
  | "auth-url-mismatch"
  | "privacy-cycle"
  | "relative-path"
  | "not-found"
  | "not-directory"
  | "not-writable"
  /** 로그인 공급자 쌍의 한쪽만 있다 — 빠진 쪽 이름으로 낸다. */
  | "incomplete-pair"
  /** GitHub App 다섯 중 일부만 있다 — 빠진 이름으로 낸다. */
  | "incomplete-group"
  /** 완전한 로그인 공급자 쌍이 하나도 없다 — 두 ID 이름으로 낸다. */
  | "no-login-provider"
  /** 서명·인가 비밀이 `MIN_SECRET_LENGTH`보다 짧다. */
  | "too-short"
  /** `APP_SIGNING_SECRET`이 `AUTH_SECRET`과 같다 — 한 회전이 로그인·연결·온보딩을 함께 무효로 만든다. */
  | "reused"
  | OriginRejection;

export type PreflightProblem = { name: string; reason: PreflightReason };
export type PreflightResult = { ok: true } | { ok: false; problems: PreflightProblem[] };

/** 업로드 디렉터리 확인 — 진입 스크립트가 실제 파일 시스템으로 구현한다. 절대 경로에만 불린다. */
/** `not-directory`는 경로가 있지만 진짜 디렉터리가 아님(파일·symlink)이다 — `missing`으로 접으면 운영자가 오타·마운트를 의심한다. */
export type UploadDirProbe = (path: string) => "ok" | "missing" | "not-directory" | "not-writable";

/** Resend API 키 모양 — 유효성은 공급자만 안다. */
const RESEND_KEY = /^re_\S+$/;
/**
 * 서명·인가 비밀의 하한 (2026-10-17 보안 감사). `CRON_SECRET`은 공개된 `/api/pull`의 유일한 인가이고 나머지 둘은 HMAC 키다 — 있는지만 보면
 * `changeme`가 통과한다. 가이드의 생성 명령(`openssl rand -base64 32` 등)은 전부 43자 이상이라 그 명령을 따른 설치는 걸리지 않는다.
 * 암호화 키 셋은 `validateCredentialKeys`가 따로 본다.
 */
const MIN_SECRET_LENGTH = 32;
const SECRETS = ["AUTH_SECRET", "APP_SIGNING_SECRET", "CRON_SECRET"] as const;

/** GitHub App slug — 설치 링크(`apps/<slug>/installations/new`)의 경로 조각이다. */
const APP_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * 운영자 정책 URL이 이 설치의 `/privacy`면 그 페이지가 자기에게 redirect해 끝나지 않는다. 끝 슬래시·query·대문자 host 변형도 같다.
 * ⚠️ **경로는 raw와 decode한 값을 둘 다 본다** — Next가 `/%70rivacy`를 `/privacy`로 찾는다(Astra 교차 리뷰 🟡3). 자기 origin인데 decode가
 * 실패하면 순환이 아님을 보일 수 없어 거부한다.
 */
function privacyProblem(raw: string, selfOrigin: string | undefined): PreflightReason | null {
  if (/\s/.test(raw)) return "malformed";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "malformed";
  }
  if (url.protocol !== "https:") return "not-https";
  if (url.username !== "" || url.password !== "") return "userinfo";
  if (selfOrigin === undefined || url.origin !== selfOrigin) return null;
  const paths = [url.pathname];
  try {
    paths.push(decodeURIComponent(url.pathname));
  } catch {
    return "privacy-cycle";
  }
  return paths.some((path) => path.replace(/\/+$/, "") === "/privacy") ? "privacy-cycle" : null;
}

export function preflight(env: Record<string, string | undefined>, probeUploadDir: UploadDirProbe): PreflightResult {
  const problems: PreflightProblem[] = [];
  const report = (name: string, reason: PreflightReason) => problems.push({ name, reason });

  for (const [name, kind] of Object.entries(SELF_HOSTED_ENV)) {
    if (kind === "required" && present(env[name]) === undefined) report(name, "missing");
  }

  /**
   * 로그인 공급자 쌍 규칙 (optional-login-providers spec §4.1). ⚠️ **반쪽을 조용히 끄지 않는다**(Q2) — 거의 언제나 오타·누락이라
   * 운영자가 "버튼이 왜 없지"부터 찾게 된다. 반쪽과 0개가 함께면 반쪽만 낸다: 고칠 자리 하나를 가리킨다.
   */
  const states = loginProviderStates(env);
  const partial = LOGIN_PROVIDERS.filter((provider) => states[provider] === "partial");
  for (const provider of partial) {
    const names = LOGIN_PROVIDER_ENV[provider];
    report(present(env[names.id]) === undefined ? names.id : names.secret, "incomplete-pair");
  }
  if (partial.length === 0 && !LOGIN_PROVIDERS.some((provider) => states[provider] === "enabled")) {
    for (const provider of LOGIN_PROVIDERS) report(LOGIN_PROVIDER_ENV[provider].id, "no-login-provider");
  }

  // GitLab 전용 설치는 App 없이 뜬다. 일부만 채운 구성은 로그인 쌍처럼 기동 전에 거부한다.
  const appEnv = Object.fromEntries(GITHUB_APP_ENV.map(name => [name, present(env[name])]));
  if (planGitHubAppConfig(appEnv) === "partial") {
    for (const name of GITHUB_APP_ENV) {
      if (present(env[name]) === undefined) report(name, "incomplete-group");
    }
  }

  const mode = resolveDeploymentMode(env);
  const origin = mode.kind === "self-hosted" ? mode.origin : undefined;
  if (mode.kind === "invalid") report("MALMOI_ORIGIN", mode.reason);

  // Auth.js는 `AUTH_TRUST_HOST`만으로 forwarded Host를 믿는다 — 이 대조가 실제 방어선이다(design §2).
  const authUrl = present(env.AUTH_URL);
  if (authUrl !== undefined && origin !== undefined) {
    if (withoutTrailingSlash(authUrl) !== origin) report("AUTH_URL", "auth-url-mismatch");
  }
  const trustHost = present(env.AUTH_TRUST_HOST);
  if (trustHost !== undefined && trustHost !== "true") report("AUTH_TRUST_HOST", "invalid-format");

  const privacy = present(env.MALMOI_PRIVACY_URL);
  if (privacy !== undefined) {
    const reason = privacyProblem(privacy, origin);
    if (reason !== null) report("MALMOI_PRIVACY_URL", reason);
  }

  const uploadDir = present(env.MALMOI_UPLOAD_DIR);
  if (uploadDir !== undefined) {
    if (!uploadDir.startsWith("/")) report("MALMOI_UPLOAD_DIR", "relative-path");
    else {
      const status = probeUploadDir(uploadDir);
      if (status === "missing") report("MALMOI_UPLOAD_DIR", "not-found");
      else if (status === "not-directory") report("MALMOI_UPLOAD_DIR", "not-directory");
      else if (status === "not-writable") report("MALMOI_UPLOAD_DIR", "not-writable");
    }
  }

  const resendKey = present(env.RESEND_API_KEY);
  if (resendKey !== undefined && !RESEND_KEY.test(resendKey)) report("RESEND_API_KEY", "invalid-format");
  const from = present(env.INVITATION_EMAIL_FROM);
  if (from !== undefined && !INVITATION_FROM.test(from)) report("INVITATION_EMAIL_FROM", "invalid-format");
  if (present(env.INVITATION_EMAIL_ORIGIN) !== undefined) report("INVITATION_EMAIL_ORIGIN", "present");

  for (const name of SECRETS) {
    const value = present(env[name]);
    if (value !== undefined && value.length < MIN_SECRET_LENGTH) report(name, "too-short");
  }
  // sec-audit-3 #14가 둘을 갈랐다 — 같은 값이면 그 분리가 조용히 무너진다.
  const signing = present(env.APP_SIGNING_SECRET);
  if (signing !== undefined && signing.length >= MIN_SECRET_LENGTH && signing === present(env.AUTH_SECRET)) report("APP_SIGNING_SECRET", "reused");

  const appSlug = present(env.GITHUB_APP_SLUG);
  if (appSlug !== undefined && !APP_SLUG.test(appSlug)) report("GITHUB_APP_SLUG", "invalid-format");

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
