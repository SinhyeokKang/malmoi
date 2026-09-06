import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OAuth state 서명·검증 (design §3.1). **I/O가 없다** — nonce 생성과 쿠키 쓰기·읽기는 껍데기가 한다.
 *
 * ⚠️ **`secret`을 인자로 받는다.** 함수 안에서 `requireEnv("AUTH_SECRET")`을 부르면 순수가 아니고,
 * 단위 테스트가 환경변수를 요구하게 된다 (CLAUDE.md — 환경변수는 함수 안에서, 그리고 이 판정층은
 * 그 함수조차 아니다).
 *
 * ⚠️ **state는 쿠키와 쿼리 양쪽에 있어야 한다.** 쿼리만 보면 CSRF이고, 쿠키만 보면 GitHub이
 * 돌려주는 값과 대조할 것이 없다. 쿠키가 서명된 payload를 들고 쿼리가 nonce만 든다.
 *
 * ⚠️ **목적지 slug는 서명 대상에 들어 있다.** GitHub이 돌려주는 쿼리에서 읽으면 공격자가 목적지를
 * 정한다. slug만 싣고 경로를 싣지 않으므로 open redirect 판정 자체가 필요 없다.
 */

/** 서명 대상. 키를 늘리면 옛 쿠키가 통째로 `state-mismatch`가 된다 — 10분 만료라 감수한다. */
type StatePayload = { userId: string; slug: string; nonce: string; exp: number };

export type StateCheck =
  | { status: "ok"; slug: string }
  | { status: "state-mismatch" }
  | { status: "state-expired" }
  | { status: "wrong-user" };

/**
 * `AUTH_SECRET`을 세션 서명과 공유하므로 용도 라벨로 도메인을 가른다 — 같은 키로 만든 다른 용도의
 * 서명이 이 자리에 재사용되지 못하게 한다.
 */
const LABEL = "malmoi-github-state";

export function signState(input: {
  userId: string;
  slug: string;
  nonce: string;
  expiresAt: Date;
  secret: string;
}): string {
  const payload: StatePayload = {
    userId: input.userId,
    slug: input.slug,
    nonce: input.nonce,
    exp: input.expiresAt.getTime(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, input.secret)}`;
}

export function verifyState(input: {
  cookie: string | null | undefined;
  query: string | null | undefined;
  userId: string;
  now: Date;
  secret: string;
}): StateCheck {
  // 서명 검사가 가장 앞이다 — 위조된 쿠키의 내용은 읽을 가치가 없다.
  const payload = readSigned(input.cookie, input.secret);
  if (payload === null) return { status: "state-mismatch" };

  // nonce 대조가 CSRF 방어의 본체다. 부재를 통과로 읽지 않는다.
  if (!input.query || input.query !== payload.nonce) return { status: "state-mismatch" };

  // 만료 정각은 이미 만료다. **wrong-user보다 앞에 둬** 만료된 state가 누구 것이었는지 말하지
  // 않는다 — `planInvitationAccept`가 만료를 이메일 대조보다 앞에 둔 것과 같은 축이다.
  if (input.now.getTime() >= payload.exp) return { status: "state-expired" };

  // 같은 브라우저에서 계정을 갈아탄 채 돌아온 callback을 거부한다.
  if (payload.userId !== input.userId) return { status: "wrong-user" };

  return { status: "ok", slug: payload.slug };
}

function sign(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(`${LABEL}.${encoded}`, "utf8").digest("base64url");
}

function readSigned(cookie: string | null | undefined, secret: string): StatePayload | null {
  if (!cookie) return null;

  const dot = cookie.lastIndexOf(".");
  // 구분자가 없거나 양쪽 중 하나가 비면 우리가 만든 값이 아니다.
  if (dot <= 0 || dot === cookie.length - 1) return null;

  const encoded = cookie.slice(0, dot);
  if (!equalConstantTime(cookie.slice(dot + 1), sign(encoded, secret))) return null;

  return parsePayload(encoded);
}

/**
 * ⚠️ **파싱 실패를 던지지 않는다.** 서명이 맞는데 형태가 깨지는 것은 payload 키를 바꾼 배포 사이에
 * 남은 옛 쿠키뿐이고, 던지면 callback이 원인 없는 500이 된다. `state-mismatch`가 정답이다 —
 * 사용자는 다시 누르면 되고, 새 쿠키는 새 형태로 발급된다.
 */
function parsePayload(encoded: string): StatePayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;

  const { userId, slug, nonce, exp } = raw as Record<string, unknown>;
  if (typeof userId !== "string" || typeof slug !== "string") return null;
  if (typeof nonce !== "string" || typeof exp !== "number") return null;

  return { userId, slug, nonce, exp };
}

function equalConstantTime(a: string, b: string): boolean {
  // 길이가 다르면 timingSafeEqual이 던지므로 먼저 걸러낸다 (`lib/push/auth.ts`와 같은 형).
  // 서명 길이는 고정이라 노출되는 정보가 없다.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
