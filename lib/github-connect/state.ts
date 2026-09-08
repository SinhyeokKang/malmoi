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
 * ⚠️ **목적지는 서명 대상에 들어 있다.** GitHub이 돌려주는 쿼리에서 읽으면 공격자가 목적지를
 * 정한다. 갈래와 slug만 싣고 경로를 싣지 않으므로 open redirect 판정 자체가 필요 없다.
 */

/**
 * 연결 왕복이 끝난 뒤 착지할 곳 (design §3.6). **갈래가 둘이다**: 설정 화면은 프로젝트가 있고,
 * 생성 화면(`/projects/new`)은 아직 없다 — 그래서 slug가 착지를 겸할 수 없다.
 */
export type StateDest = { kind: "settings"; slug: string } | { kind: "new" };

/** 서명 대상. 키를 늘리면 옛 쿠키가 통째로 `state-mismatch`가 된다 — 10분 만료라 감수한다. */
type StatePayload = { userId: string; dest: StateDest; nonce: string; exp: number };

export type StateCheck =
  | { status: "ok"; dest: StateDest }
  | { status: "state-mismatch" }
  | { status: "state-expired" }
  | { status: "wrong-user" };

/**
 * `AUTH_SECRET`을 세션 서명과 공유하므로 용도 라벨로 도메인을 가른다 — 같은 키로 만든 다른 용도의
 * 서명이 이 자리에 재사용되지 못하게 한다.
 */
const LABEL = "malmoi-github-state";

/**
 * state 쿠키 이름. **`__Host-` 접두는 https에서만** 붙인다.
 *
 * ⚠️ 그 접두는 `Secure` 속성을 요구하고, **Safari는 `http://localhost`에서 Secure 쿠키를 저장하지
 * 않는다** — 로컬 callback이 항상 `state-mismatch`가 되고, 증상이 "쿠키가 없다"라서 서명이나 nonce를
 * 의심하게 만든다. `lib/auth/cookie.ts`가 `authjs.session-token`과 `__Secure-` 접두 둘을 프로토콜로
 * 가르는 것과 같은 처리다.
 */
export function stateCookieName(secure: boolean): string {
  return secure ? `__Host-${BASE_COOKIE}` : BASE_COOKIE;
}

/**
 * **읽는 쪽이 볼 이름 전부.** 쓰는 쪽(Server Action)은 `x-forwarded-proto`로, 읽는 쪽(callback)은
 * 요청 URL로 프로토콜을 판정한다 — 둘은 다른 신호라 갈릴 수 있고, 갈리면 **쓴 쿠키와 찾는 쿠키의
 * 이름이 달라져** 연결이 100% `state-mismatch`가 된다. 증상이 "쿠키가 없다"라서 위의 Safari 함정과
 * 구별되지 않는다.
 *
 * `lib/auth/cookie.ts`가 `authjs.session-token`과 `__Secure-` 접두 둘을 다 보는 것과 같은 해법이다:
 * **쓰는 쪽만 정확하면 되고, 읽는 쪽은 관대해도 안전하다** — 어느 이름으로 왔든 서명이 진짜인지는
 * `verifyState`가 따로 판정한다.
 */
export function stateCookieNames(): readonly string[] {
  return [stateCookieName(true), stateCookieName(false)];
}

const BASE_COOKIE = "malmoi-gh-state";

/**
 * state의 수명(분). **쿠키 `maxAge`와 서명 `exp`를 함께 정하므로 한 곳에 둔다** — 연결을 시작하는
 * Action이 둘(설정 화면·생성 화면)이고, 각자 상수를 들면 한쪽만 늘렸을 때 "어느 화면에서
 * 시작했는지에 따라 state-mismatch가 난다"가 되고 증상이 쿠키 부재와 구별되지 않는다
 * (code-review 2026-09-07 🟡4 · malmoi#7과 같은 진단 함정).
 *
 * 인가 화면까지 왕복하기에 충분하고, 방치된 탭이 오래 열려 있지 않을 만큼 짧다.
 */
export const STATE_TTL_MINUTES = 10;

export function signState(input: {
  userId: string;
  dest: StateDest;
  nonce: string;
  expiresAt: Date;
  secret: string;
}): string {
  requireSecret(input.secret);

  const payload: StatePayload = {
    userId: input.userId,
    dest: input.dest,
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
  requireSecret(input.secret);

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

  return { status: "ok", dest: payload.dest };
}

/**
 * ⚠️ **빈 키를 거부한다.** `createHmac("sha256", "")`는 던지지 않고 동작하므로, 빈 secret으로 만든
 * 서명은 **누구나 재현할 수 있다** — `verifyState`가 위조 쿠키를 통과시키고 공격자가 `slug`와
 * `userId`를 정한 state로 callback에 들어온다. `requireEnv`가 빈 문자열을 던져 정상 경로는 막혀
 * 있지만, 그것에 의존만 하면 호출부의 실수 하나로 방어가 통째로 사라진다 — `checkBearer`가
 * `expected === ""`를 `not-configured`로 가른 것과 같은 판단이다 (`lib/push/auth.ts`).
 *
 * **`state-mismatch`로 접지 않고 던지는 이유**: 접으면 설정 오류가 "다시 눌러 주세요"로 위장돼
 * 사용자가 같은 버튼을 무한히 누른다 (POSTMORTEM 2026-09-06 — 장애를 정상으로 읽었다). 이건
 * 사용자가 할 수 있는 일이 없는 프로그래밍 오류라 500이 정직하다.
 */
function requireSecret(secret: string): void {
  if (secret === "") throw new Error("the state signing key is empty — check AUTH_SECRET.");
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

  const { userId, dest, nonce, exp } = raw as Record<string, unknown>;
  if (typeof userId !== "string") return null;
  if (typeof nonce !== "string" || typeof exp !== "number") return null;

  const parsedDest = parseDest(dest);
  if (parsedDest === null) return null;

  return { userId, dest: parsedDest, nonce, exp };
}

/**
 * ⚠️ **옛 모양(`{slug}`)은 여기서 `null`이 되어 `state-mismatch`가 된다.** 관대하게 받아 주면
 * "slug가 있으면 설정 화면"이라는 세 번째 규칙이 착지 판정에 영구히 남는다 — 10분 만료라 배포 직후
 * 그 창의 사용자는 버튼을 다시 누르면 된다 (design §3.6).
 *
 * ⚠️ **`settings`인데 slug가 비면 거부한다.** 통과시키면 착지가 `/projects//settings`가 되고, 그건
 * 라우트가 아니라 404다 — 사용자에게는 "연결을 눌렀는데 아무 일도 안 났다"로 보인다.
 */
function parseDest(dest: unknown): StateDest | null {
  if (typeof dest !== "object" || dest === null || Array.isArray(dest)) return null;
  const { kind, slug } = dest as Record<string, unknown>;
  if (kind === "new") return { kind: "new" };
  if (kind !== "settings") return null;
  if (typeof slug !== "string" || slug === "") return null;
  return { kind: "settings", slug };
}

function equalConstantTime(a: string, b: string): boolean {
  // 길이가 다르면 timingSafeEqual이 던지므로 먼저 걸러낸다 (`lib/push/auth.ts`와 같은 형).
  // 서명 길이는 고정이라 노출되는 정보가 없다.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
