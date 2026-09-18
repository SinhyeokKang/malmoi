import { checkChallenge, isLoginProvider, pickLoginAccount, type Challenge, type LoginProvider } from "./policy";

/**
 * 거부를 안내로 바꾸는 판정 둘 (ARCHITECTURE "계정 병합").
 *
 * ⚠️ **자동 병합은 여전히 없다.** `offer`가 여는 것은 **화면 하나**이고, 행을 쓰는 것은 기존
 * provider의 OAuth를 새로 통과한 `planLinkConfirm`의 `ok` 하나뿐이다 — `allowDangerousEmailAccountLinking`은
 * 어느 provider에도 켜지 않는다 (ARCHITECTURE §6.2.1).
 */

export type LinkOffer =
  | { kind: "sign-in" }
  | { kind: "reject" }
  | { kind: "offer"; userId: string; have: LoginProvider };

/**
 * ⚠️ **`existingUser`는 새 조회가 아니다** (ARCHITECTURE "계정 병합"). 호출부가 이미 "이 Account가 새 것인가"를
 * 알고 있고, **그 값이 '없다'일 때만** 이메일 조회 하나를 더한다 — 재방문 로그인(대부분)에는
 * 비용이 0이다.
 */
export function planLinkOffer(input: {
  provider: string;
  providerAccountId: string;
  verifiedEmail: string | null;
  existingUser: { id: string; methods: readonly string[] } | null;
}): LinkOffer {
  // provider 설정이 검증에 실패하면 빈 문자열로 온다 — 이메일이 **같을 때만** 병합하므로
  // 여기서 거부하지 않으면 병합의 전제가 사라진다 (불변식 1).
  if (input.verifiedEmail === null || input.verifiedEmail === "") return { kind: "reject" };
  if (!isLoginProvider(input.provider)) return { kind: "sign-in" };
  const user = input.existingUser;
  if (user === null) return { kind: "sign-in" };
  const methods = user.methods.filter(isLoginProvider);
  /**
   * ⚠️ **같은 provider의 다른 계정은 병합 대상이 아니다.** 확인 상대가 그 provider 자신이 되어
   * 소유를 두 번 증명하는 형이 깨진다 — 현재 거부(`OAuthAccountNotLinked`)를 그대로 둔다.
   */
  if (methods.length === 0 || methods.includes(input.provider)) return { kind: "sign-in" };
  const have = pickLoginAccount(methods.map((provider) => ({ provider })));
  if (have === null) return { kind: "sign-in" };
  return { kind: "offer", userId: user.id, have: have.provider as LoginProvider };
}

export type LinkConfirm = {
  kind: "ok" | "expired" | "wrong-account" | "already-linked" | "invalid";
  /** ⚠️ **`ok`에서만 참이다** (ARCHITECTURE "계정 병합") — 실패가 소비하면 훔친 URL 한 번으로 남의 병합을 태운다. */
  consume: boolean;
};

/**
 * ⚠️ **`confirmedUserId`이지 `signedInUserId`가 아니다** — 그 시점에 세션은 없다. 값은
 * `(provider, providerAccountId)`로 조회한 `Account.userId`이고, **없으면 그 자체로 `wrong-account`**다:
 * `signIn`이 받는 `user.id`는 처음 보는 계정일 때 갓 만들어진 난수라 DB의 어떤 행과도 안 맞는다
 * (`@auth/core`의 `oauth/callback.js` — `auth.ts`가 이미 같은 이유로 그 값을 못 믿는다고 적어 뒀다).
 */
export function planLinkConfirm(input: {
  challenge: Challenge;
  confirming: { provider: string; providerAccountId: string };
  confirmedUserId: string | null;
  /** 붙이려는 `Account` 행이 이미 있다 — 쓸 것이 없다. */
  pendingLinked: boolean;
  expires: Date;
  now: Date;
}): LinkConfirm {
  const shape = checkChallenge(input.challenge, {
    confirming: input.confirming.provider,
    expires: input.expires,
    now: input.now,
  });
  if (shape !== "ok") return { kind: shape, consume: false };
  if (input.confirmedUserId === null || input.confirmedUserId !== input.challenge.userId) {
    return { kind: "wrong-account", consume: false };
  }
  if (input.pendingLinked) return { kind: "already-linked", consume: false };
  return { kind: "ok", consume: true };
}
