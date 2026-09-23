/**
 * 초대 메일 설정 판정 (design §5). **던지지 않는다** — 설정이 없거나 틀리면 발급·발송만 막고
 * 부팅·로그인·멤버 화면은 그대로 산다. 그래서 `requireEnv`가 아니라 값 맵을 받는다.
 *
 * ⚠️ 메일 링크의 origin은 **요청 Host가 아니라 이 설정**에서 온다. 그리고 그 값을 배포 환경과 대조한다 —
 * preview가 프로덕션 링크를 보내면 dev DB에 만든 초대가 prod에서 `not-found`가 된다.
 */

export type InvitationEmailConfig =
  | { status: "ready"; apiKey: string; from: string; origin: string }
  | { status: "unavailable"; reason: "missing" | "invalid-from" | "invalid-origin" | "origin-mismatch" };

type EnvSource = Record<string, string | undefined>;

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/;
// `이름 <주소>` 또는 `주소`. 공백·꺾쇠가 섞인 주소는 공급자가 거부하기 전에 여기서 막고,
// 이름의 개행은 헤더 줄을 가를 수 있는 모양이라 받지 않는다.
const ADDRESS = "[^\\s@<>]+@[^\\s@<>]+";
const FROM = new RegExp(`^(?:[^<>\\r\\n]*<${ADDRESS}>|${ADDRESS})$`);

function expectedOrigin(vercelEnv: string | undefined): string | null {
  if (vercelEnv === "production") return "https://mal-moi.com";
  if (vercelEnv === "preview") return "https://dev.mal-moi.com";
  return null;
}

export function readInvitationEmailConfig(env: EnvSource): InvitationEmailConfig {
  const apiKey = env.RESEND_API_KEY;
  const from = env.INVITATION_EMAIL_FROM;
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

  const expected = expectedOrigin(env.VERCEL_ENV);
  const matches = expected === null ? LOCAL_HOST.test(url.hostname) : origin === expected;
  if (!matches) return { status: "unavailable", reason: "origin-mismatch" };

  return { status: "ready", apiKey, from, origin };
}
