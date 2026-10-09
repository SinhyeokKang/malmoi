import { HOSTED_PREVIEW_ORIGIN, HOSTED_PRODUCTION_ORIGIN, resolveDeploymentMode, type DeploymentMode } from "@/lib/deployment/mode";

/**
 * 초대 메일 설정 판정 (design §5). **던지지 않는다** — 설정이 없거나 틀리면 발급·발송만 막고
 * 부팅·로그인·멤버 화면은 그대로 산다. 그래서 `requireEnv`가 아니라 값 맵을 받는다.
 *
 * ⚠️ 메일 링크의 origin은 **요청 Host가 아니라 이 설정**에서 온다. 그리고 그 값을 배포 환경과 대조한다 —
 * preview가 프로덕션 링크를 보내면 dev DB에 만든 초대가 prod에서 `not-found`가 된다.
 *
 * ⚠️ **self-hosted는 origin을 배포 모드의 설정 origin에서 파생한다**(self-hosting design §2·§7) — `INVITATION_EMAIL_ORIGIN`을 읽지 않는다
 * (있으면 preflight가 거부한다 — 정본 둘 방지). 무효 모드는 `invalid-origin`이다 — hosted 값으로 떨어지지 않는다.
 */

export type InvitationEmailConfig =
  | { status: "ready"; apiKey: string; from: string; origin: string }
  | { status: "unavailable"; reason: "missing" | "invalid-from" | "invalid-origin" | "origin-mismatch" };

type EnvSource = Record<string, string | undefined>;

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/;
// `이름 <주소>` 또는 `주소`. 공백·꺾쇠가 섞인 주소는 공급자가 거부하기 전에 여기서 막고,
// 이름의 개행은 헤더 줄을 가를 수 있는 모양이라 받지 않는다.
const ADDRESS = "[^\\s@<>]+@[^\\s@<>]+";
/** self-hosted preflight도 같은 모양을 요구한다(`lib/deployment/preflight.ts`) — 두 벌이면 한쪽이 낡는다. */
export const FROM = new RegExp(`^(?:[^<>\\r\\n]*<${ADDRESS}>|${ADDRESS})$`);

function expectedOrigin(vercelEnv: string | undefined): string | null {
  if (vercelEnv === "production") return HOSTED_PRODUCTION_ORIGIN;
  if (vercelEnv === "preview") return HOSTED_PREVIEW_ORIGIN;
  return null;
}

/** `mode`를 생략하면 같은 env 맵에서 판정한다 — 런타임 진입(`send.ts`)은 `deploymentMode()`를 넘긴다. */
export function readInvitationEmailConfig(env: EnvSource, mode: DeploymentMode = resolveDeploymentMode(env)): InvitationEmailConfig {
  const apiKey = env.RESEND_API_KEY;
  const from = env.INVITATION_EMAIL_FROM;
  if (mode.kind !== "hosted") {
    if (!apiKey || !from) return { status: "unavailable", reason: "missing" };
    if (!FROM.test(from)) return { status: "unavailable", reason: "invalid-from" };
    return mode.kind === "self-hosted" ? { status: "ready", apiKey, from, origin: mode.origin } : { status: "unavailable", reason: "invalid-origin" };
  }

  const origin = env.INVITATION_EMAIL_ORIGIN;
  if (!apiKey || !from || !origin) return { status: "unavailable", reason: "missing" };

  if (!FROM.test(from)) return { status: "unavailable", reason: "invalid-from" };

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return { status: "unavailable", reason: "invalid-origin" };
  }
  // 경로·query·fragment·userinfo가 붙으면 정규화한 origin과 달라진다 — 링크 조립이 그 조각을 싣지 않게 한다.
  if (url.origin !== origin || url.username !== "" || url.password !== "") {
    return { status: "unavailable", reason: "invalid-origin" };
  }

  const expected = expectedOrigin(mode.vercelEnv);
  const matches = expected === null ? LOCAL_HOST.test(url.hostname) : origin === expected;
  if (!matches) return { status: "unavailable", reason: "origin-mismatch" };

  return { status: "ready", apiKey, from, origin };
}
