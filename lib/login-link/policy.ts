import { routes } from "@/lib/routes";

/**
 * 같은 주소의 다른 로그인 수단을 붙이는 challenge의 순수 판정 (design §5.1).
 *
 * ⚠️ **`lib/session-revocation/policy.ts`와 형은 같지만 증명이 다르다.** 그쪽은 **살아 있는 세션**이
 * 인가를 대신하므로 `sessionDigest`·`stateDigest`를 challenge에 담아 왕복을 묶어야 한다. 여기는
 * 세션이 **없다** — 담는 것은 "무엇을 붙일 것인가"와 "성공하면 어디로 돌아가나"뿐이고, 왕복의
 * 진정성은 Auth.js가 **자기 이름·salt로 암호화한 state 쿠키**가 든다 (design 불변식 3). 훔친
 * challenge URL로 할 수 있는 일은 **기존 provider의 OAuth를 새로 통과하는 것**뿐이다.
 *
 * ⚠️ **잎에 가깝다 — import가 `lib/routes.ts` 하나다.** `/account`의 수단 카드가 **클라이언트**라
 * 이 파일의 그래프가 곧 번들이고, 해시(`challengeTokenHash`)를 여기 두면 `node:crypto`가 따라
 * 들어온다(실측 — `client-graph.test.ts`가 잡았다). 그래서 해시는 `store.ts`가 든다.
 *
 * ⚠️ **`lib/github-connect/account-link.ts`와 축이 다르다** — 그쪽은 GitHub App 연결의 소유권이고
 * 여기는 로그인 수단이다. 이름이 갈려 있어야 다음 사람이 매번 대조하지 않는다 (design ⑫).
 */

const PURPOSE = "malmoi/login-link";

export type LoginProvider = "github" | "google";

/** ⚠️ **`github-app`은 로그인 수단이 아니다** — 리포 쓰기 연결이고 그 행은 이 판정을 지나지 않는다. */
export const LOGIN_PROVIDERS: readonly LoginProvider[] = ["github", "google"];

export function isLoginProvider(value: string): value is LoginProvider {
  // 배열 `includes`다 — provider 문자열이 남이 정한 값이라 객체 조회는 프로토타입 키를 통과시킨다.
  return LOGIN_PROVIDERS.includes(value as LoginProvider);
}

/**
 * ⚠️ **임의 URL이 아니라 갈래 이름이다** (design 불변식 9). 저장된 문자열을 그대로 리다이렉트에
 * 쓰면 open redirect 판정이 생기고, 그 판정을 잊는 것이 조용하다 — `lib/github-connect/state.ts`의
 * `StateDest`와 같은 관용구이고 이유도 같다.
 */
export type LinkDest = { kind: "invite"; token: string } | { kind: "projects" };

export type Challenge = {
  userId: string;
  /** **붙일** 수단이다 — 지금 로그인을 시도해 거부된 쪽. 확인은 반대쪽 provider로 한다. */
  provider: LoginProvider;
  providerAccountId: string;
  dest: LinkDest;
};

/** 10분. 실패가 challenge를 소비하지 않으므로(design ⑧) 재시도의 상한을 이것이 든다. */
export const CHALLENGE_TTL_MINUTES = 10;

export function challengePrefix(userId?: string): string {
  return JSON.stringify(userId === undefined ? [PURPOSE, "v1"] : [PURPOSE, "v1", userId]).slice(0, -1) + ",";
}

export function challengeIdentifier(c: Challenge): string {
  return JSON.stringify([
    PURPOSE,
    "v1",
    c.userId,
    c.provider,
    c.providerAccountId,
    c.dest.kind,
    c.dest.kind === "invite" ? c.dest.token : "",
  ]);
}

export function parseChallengeIdentifier(identifier: string): Challenge | null {
  try {
    const a: unknown = JSON.parse(identifier);
    if (!Array.isArray(a) || a.length !== 7) return null;
    const [purpose, version, userId, provider, providerAccountId, destKind, destToken] = a;
    if (
      purpose !== PURPOSE ||
      version !== "v1" ||
      typeof userId !== "string" ||
      !userId ||
      typeof provider !== "string" ||
      !isLoginProvider(provider) ||
      typeof providerAccountId !== "string" ||
      !providerAccountId ||
      typeof destToken !== "string"
    ) {
      return null;
    }
    const dest: LinkDest | null =
      destKind === "projects" && destToken === ""
        ? { kind: "projects" }
        : destKind === "invite" && destToken !== ""
          ? { kind: "invite", token: destToken }
          : null;
    if (dest === null) return null;
    const result: Challenge = { userId, provider, providerAccountId, dest };
    // 왕복 대조 — 정규형이 아닌 identifier가 조용히 통과하지 않는다.
    return challengeIdentifier(result) === identifier ? result : null;
  } catch {
    return null;
  }
}

/**
 * 화면과 확인이 공유하는 수명·형 판정.
 *
 * ⚠️ **만료가 provider 불일치보다 앞이다** — `verifyState`가 `state-expired`를 `wrong-user`보다
 * 앞에 둔 것과 같은 축이다: **만료된 challenge가 누구 것이었는지 말하지 않는다.**
 *
 * ⚠️ **붙일 provider로는 확인할 수 없다** — 같은 provider로 돌아온 callback은 소유를 두 번 증명한
 * 것이 아니라 한 번 증명한 것이다.
 */
export function checkChallenge(
  c: Challenge,
  input: { confirming: string; expires: Date; now: Date },
): "ok" | "expired" | "invalid" {
  if (!(input.expires.getTime() > input.now.getTime())) return "expired";
  if (!isLoginProvider(input.confirming) || input.confirming === c.provider) return "invalid";
  return "ok";
}

/**
 * 확인 상대를 **결정적으로** 고른다 — `github` 우선, 없으면 `google` (design ③).
 *
 * 두 수단 모두 소유 증명이라 확인 상대로 동등하고, 필요한 것은 결정성 하나다. 클라이언트가
 * 고르게 하면 공격자가 확인 상대를 고르게 된다.
 *
 * ⚠️ **"가장 먼저 등록한 수단"으로 하지 않는다** — `Account`에 `createdAt`이 없고, 추가하면 기존
 * 행이 전부 null이라 폴백 규칙이 또 필요하다.
 */
export function pickLoginAccount<T extends { provider: string }>(accounts: readonly T[]): T | null {
  for (const provider of LOGIN_PROVIDERS) {
    const found = accounts.find((a) => a.provider === provider);
    if (found !== undefined) return found;
  }
  return null;
}

/** `/account`의 수단 카드 — **행이 언제나 둘이고 순서가 고정**이다. 미연결 행의 추가는 account-connect가 담당한다. */
export function loginMethodRows(
  accounts: readonly { provider: string }[],
): { provider: LoginProvider; connected: boolean }[] {
  return LOGIN_PROVIDERS.map((provider) => ({
    provider,
    connected: accounts.some((a) => a.provider === provider),
  }));
}

/** 마지막 로그인 수단은 해제할 수 없다 (design 불변식 6). */
export function canUnlink(methods: readonly string[], provider: string): boolean {
  const login = methods.filter(isLoginProvider);
  return isLoginProvider(provider) && login.includes(provider) && login.length > 1;
}

export type LinkOutcome =
  | "linked"
  | "expired"
  | "wrong-account"
  | "already-linked"
  | "invalid"
  | "cancelled"
  | "unavailable";

/** 성공 착지 — **갈래 이름으로만** 만들어진다 (불변식 9). */
export function outcomeUrl(dest: LinkDest): string {
  return dest.kind === "invite" ? routes.invite(dest.token) : routes.projects();
}

/**
 * 실패 착지. **같은 화면으로 돌아간다** — 메시지와 조치(다시 누를 버튼)가 한 자리에 있어야 한다
 * (design §5.5 상태 둘).
 *
 * ⚠️ **만료는 이 화면을 다시 그리지 않는다** (완료 조건 5) — 다시 그리면 그 상태가 또 하나의
 * 표면이 된다. 토큰이 없는 경우도 같은 곳으로 간다: 돌아갈 challenge가 없다.
 */
export function failureUrl(challengeToken: string | null, outcome: LinkOutcome): string {
  /**
   * ⚠️ **돌아갈 challenge가 없는 갈래는 이 화면으로 보내지 않는다.** `expired`·`invalid`(단일 사용
   * 뒤의 재시도)는 행이 사라진 상태라, 링크 화면으로 보내면 그 화면이 **사유 없이** `/signin`으로
   * 한 번 더 튕겨 **문구가 통째로 사라진다** — 사유를 보내놓고 아무도 안 읽는 것이 POSTMORTEM
   * 2026-09-06의 사고다. 나머지 넷은 challenge가 살아 있어 다시 누를 버튼이 그 화면에 있다.
   */
  if (challengeToken === null || outcome === "expired" || outcome === "invalid" || outcome === "linked") {
    return routes.signIn({ error: "LinkExpired" });
  }
  return routes.signInLink(challengeToken, { e: outcome });
}

/**
 * Auth.js의 `callback-url` 쿠키 → **갈래 이름**. ⚠️ **저장하는 것은 갈래이고 URL이 아니다**
 * (불변식 9) — 저장된 문자열을 그대로 리다이렉트에 쓰면 open redirect 판정이 생기고, 그 판정을
 * 잊는 것이 조용하다. 모르는 목적지는 전부 `/projects`로 접는다.
 */
export function destFromCallbackUrl(value: string | undefined): LinkDest {
  if (value === undefined || value === "") return { kind: "projects" };
  try {
    // 상대 경로로 올 수도 있어 base를 준다 — origin은 어차피 버린다(갈래만 남는다).
    const target = new URL(decodeURIComponent(value), "http://localhost");
    const match = /^\/invite\/([^/]+)$/.exec(target.pathname);
    const token = match?.[1];
    return token === undefined || token === "" ? { kind: "projects" } : { kind: "invite", token: decodeURIComponent(token) };
  } catch {
    return { kind: "projects" };
  }
}

/** URL 토큰을 나르는 쿠키 — 원문은 여기와 주소창에만 있고 DB엔 해시만 있다. */
export function linkCookie(secure: boolean) {
  return {
    name: `${secure ? "__Host-" : ""}malmoi-login-link`,
    options: { secure, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: CHALLENGE_TTL_MINUTES * 60 },
  };
}

/**
 * Auth.js는 state를 **쿠키 이름을 salt로** 암호화하므로, 이름을 가르면 이 왕복이 일반 로그인으로
 * 개명될 수 없다 (POSTMORTEM 2026-09-10 — `session-revocation`이 도달한 구조 그대로).
 */
export function linkStateCookie(secure: boolean) {
  return {
    name: `${secure ? "__Secure-" : ""}malmoi-link-state`,
    options: { secure, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 900 },
  };
}
