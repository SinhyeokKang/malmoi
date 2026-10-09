/**
 * **배포 모드 판정 — `MALMOI_ORIGIN`이 있으면 self-hosted다** (self-hosting design §2). 별도 모드 변수가 없다 — origin 정본이 둘이 되지 않게.
 *
 * ⚠️ **import가 없는 잎 모듈이다.** middleware(Edge)가 부르므로 `lib/env.ts`(→ `node:crypto`)를 물 수 없다 — 그래서 `process.env`를
 * 직접 읽고 빈 문자열·공백 = 미설정 규칙을 손으로 적용한다. `MALMOI_ORIGIN`·`VERCEL_ENV`를 읽는 비테스트 코드와 hosted 도메인 리터럴의
 * 집이 여기 하나다(SH-15 ① — `__tests__/self-hosted-gates.test.ts`가 센다).
 *
 * ⚠️ **fail-closed는 preflight가 아니라 이 판정이 지킨다.** Vercel에서는 preflight가 돌지 않으므로 누가 Vercel env에 `MALMOI_ORIGIN`을
 * 넣으면 `VERCEL_ENV`와 함께 있어 무효가 되고, 모든 소비자가 무효에서 origin을 만들지 않는다 — 읽기 전용 FS 위에서 self-hosted로
 * 조용히 돌지 않는다.
 *
 * `next start`의 middleware가 이 값을 빌드 때 인라인하지 않고 런타임에 읽는 것을 실측했다(2026-10-09, 같은 빌드를 두 값으로 기동).
 */

/** hosted 프로덕션 — canonical·action `api-url` 기본값·메일 이미지가 가리키는 곳. */
export const HOSTED_PRODUCTION_ORIGIN = "https://mal-moi.com";
/** hosted preview 고정 URL — 배포별 URL은 OAuth에 등록할 수 없어 이것만 쓴다(CLAUDE.md 브랜치·배포 절). */
export const HOSTED_PREVIEW_ORIGIN = "https://dev.mal-moi.com";

export type OriginRejection = "malformed" | "not-https" | "userinfo" | "path" | "query" | "fragment" | "ipv6" | "idn";

export type DeploymentMode =
  | { kind: "hosted"; vercelEnv: string | undefined }
  | { kind: "self-hosted"; origin: string; host: string }
  | { kind: "invalid"; reason: OriginRejection | "vercel-env-present" };

/**
 * `origin.ts`의 `HOST`보다 좁다 — 밑줄·비ASCII에 더해 빈 라벨·끝 점·하이픈으로 시작하거나 끝나는 라벨을 받지 않는다. 끝 점은 브라우저
 * Host에 실리지 않아 preflight를 지나도 런타임에 모든 요청이 null이 된다. 포트는 `URL.host`가 이미 갈라 둔다.
 */
const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);

/**
 * 설정 origin 파서. 끝 슬래시·대문자 host·`:443`은 정규화하고 비기본 포트는 유지한다. 요청 헤더에서 추론하지 않는 값이라 모양 밖은
 * 고치지 않고 거절한다. ⚠️ **원문이 `https://`로 시작해야 한다** — WHATWG `URL`은 `https:host`·`https:/host`·`\`를 고쳐 받는다.
 *
 * ⚠️ **IPv6 리터럴·IDN은 지원하지 않는다** — `origin.ts`의 `HOST`가 이미 거부하므로 받으면 모든 요청이 null이 된다. IDN은 `URL`이
 * punycode로 바꾸기 전에 원문으로 본다(바꾼 뒤엔 일반 ASCII와 구별되지 않는다).
 */
export function parseOrigin(raw: string): { ok: true; origin: string; host: string } | { ok: false; reason: OriginRejection } {
  if (/[\s\\]/.test(raw)) return { ok: false, reason: "malformed" };
  if (/[^\x00-\x7f]/.test(raw) || /(^|[/.@])xn--/i.test(raw)) return { ok: false, reason: "idn" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not-https" };
  if (!raw.startsWith("https://")) return { ok: false, reason: "malformed" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "userinfo" };
  if (url.hostname.startsWith("[")) return { ok: false, reason: "ipv6" };
  if (!HOSTNAME.test(url.hostname)) return { ok: false, reason: "malformed" };
  if (url.pathname !== "/") return { ok: false, reason: "path" };
  // `?`·`#`만 붙은 원문은 `URL`이 빈 search·hash로 접는다 — 원문으로 본다.
  if (url.search !== "" || raw.includes("?")) return { ok: false, reason: "query" };
  if (url.hash !== "" || raw.includes("#")) return { ok: false, reason: "fragment" };
  return { ok: true, origin: url.origin, host: url.host };
}

function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/** 순수 판정 — preflight와 지연 getter가 같은 규칙을 쓴다. */
export function resolveDeploymentMode(env: { MALMOI_ORIGIN?: string | undefined; VERCEL_ENV?: string | undefined }): DeploymentMode {
  const origin = present(env.MALMOI_ORIGIN);
  const vercelEnv = present(env.VERCEL_ENV);
  if (origin === undefined) return { kind: "hosted", vercelEnv };
  if (vercelEnv !== undefined) return { kind: "invalid", reason: "vercel-env-present" };
  const parsed = parseOrigin(origin);
  return parsed.ok ? { kind: "self-hosted", origin: parsed.origin, host: parsed.host } : { kind: "invalid", reason: parsed.reason };
}

/**
 * 호출 시점의 모드. ⚠️ **모듈 최상위에서 평가하지 않는다** — import만으로 env를 읽으면 env 없는 build가 죽는다(POSTMORTEM 2026-08-31).
 * `process.env.X`를 글자 그대로 쓴다 — 클라이언트 번들에서는 `undefined`가 되어 hosted로 읽힌다(클라이언트는 이 판정을 쓰지 않는다).
 */
export function deploymentMode(): DeploymentMode {
  return resolveDeploymentMode({ MALMOI_ORIGIN: process.env.MALMOI_ORIGIN, VERCEL_ENV: process.env.VERCEL_ENV });
}

/** 요청 Host를 못 믿을 때 보여 줄 origin — self-hosted가 SaaS로 떨어지지 않는다. 무효면 없다. */
export function fallbackOrigin(mode: DeploymentMode): string | null {
  if (mode.kind === "self-hosted") return mode.origin;
  return mode.kind === "hosted" ? HOSTED_PRODUCTION_ORIGIN : null;
}
