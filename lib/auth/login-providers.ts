import { optionalEnv } from "@/lib/env";
import { LOGIN_PROVIDERS, type LoginProvider } from "@/lib/login-link/policy";

/**
 * 로그인 공급자의 **켜진 집합** (optional-login-providers spec §4). 운영자가 자격증명 쌍을 넣은 공급자만 켜진다 — hosted는 둘 다
 * 넣으므로 결과가 지금과 같다(Q1: 모드별로 가르지 않는다).
 *
 * ⚠️ **모듈 최상위에서 env를 읽지 않는다** (POSTMORTEM 2026-08-31 + 🔁 2건) — 켜진 집합은 요청마다 `enabledLoginProviders()`로 얻는다.
 *
 * ⚠️ **`server-only`를 붙이지 않는다** — `scripts/preflight.ts`가 tsx로 이 모듈을 문다(react-server 조건 밖에서 던진다). 대신
 * `lib/env` → `lib/failure`를 끌고 오므로 **클라이언트 그래프(`lib/login-link/policy.ts`)와 `middleware.ts`가 이것을 import하지
 * 않는다** — 켜진 집합은 서버가 구해 인자·props로 내려보낸다(POSTMORTEM 2026-09-07, `client-graph.test.ts`).
 */

export type LoginProviderState = "enabled" | "absent" | "partial";

/** env 이름 표 — preflight의 쌍 규칙과 SH-15 ②-c 게이트가 같은 표를 본다. */
export const LOGIN_PROVIDER_ENV: Record<LoginProvider, { id: string; secret: string }> = {
  github: { id: "AUTH_GITHUB_ID", secret: "AUTH_GITHUB_SECRET" },
  google: { id: "AUTH_GOOGLE_ID", secret: "AUTH_GOOGLE_SECRET" },
};

/**
 * 공백만 있는 값은 빈 값이다. ⚠️ **preflight와 이 모듈이 같은 함수 하나를 쓴다** — 두 벌이면 기동 판정과 런타임 켜진 집합이
 * 갈린다(공백 ID로 기동은 통과했는데 버튼이 사라지는 식). `optionalEnv`는 빈 문자열만 접고 공백은 통과시키므로 트림은 여기가 든다.
 */
export function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/** 순수 — env 맵을 받는다. 둘 다 있으면 `enabled`, 둘 다 없으면 `absent`, 하나만이면 `partial`. */
export function loginProviderStates(env: Record<string, string | undefined>): Record<LoginProvider, LoginProviderState> {
  const state = (provider: LoginProvider): LoginProviderState => {
    const names = LOGIN_PROVIDER_ENV[provider];
    const count = [names.id, names.secret].filter((name) => present(env[name]) !== undefined).length;
    return count === 2 ? "enabled" : count === 0 ? "absent" : "partial";
  };
  return { github: state("github"), google: state("google") };
}

/**
 * Auth.js provider 목록을 켜진 집합으로 거른다 — 꺼진 공급자는 `providers`에 없으므로 `/api/auth/signin/<p>`·callback이 성립하지
 * 않는다(화면 숨김이 유일한 방어선이 아니다). 순서는 입력 목록 그대로다.
 */
export function withEnabled<T extends { id: string }>(all: readonly T[], enabled: readonly LoginProvider[]): T[] {
  return all.filter((provider) => (enabled as readonly string[]).includes(provider.id));
}

/**
 * 호출 시점의 켜진 집합 — 순서는 `LOGIN_PROVIDERS`(github → google).
 *
 * ⚠️ **이름 리터럴 넷으로 읽는다** — SH-15 ②가 `optionalEnv` 인자를 AST로 뽑아 preflight 표와 대조한다. 템플릿은 `unresolved`로 red다.
 */
export function enabledLoginProviders(): LoginProvider[] {
  const states = loginProviderStates({
    AUTH_GITHUB_ID: optionalEnv("AUTH_GITHUB_ID"),
    AUTH_GITHUB_SECRET: optionalEnv("AUTH_GITHUB_SECRET"),
    AUTH_GOOGLE_ID: optionalEnv("AUTH_GOOGLE_ID"),
    AUTH_GOOGLE_SECRET: optionalEnv("AUTH_GOOGLE_SECRET"),
  });
  return LOGIN_PROVIDERS.filter((provider) => states[provider] === "enabled");
}
