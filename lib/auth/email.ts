/**
 * 이메일 정규화 — 저장과 비교가 **같은 함수를 지난다**. 갈리면 초대 대조가 대소문자로 실패한다.
 *
 * ⚠️ **trim과 소문자까지만 한다.** gmail의 점이나 `+` 태그를 접는 정규화를 넣지 않는다 —
 * 그건 provider가 준 주소를 우리가 재해석하는 것이고, 결과로 **다른 사람 앞으로 온 초대와
 * 일치시킬 수 있다.** 이메일 소유권 증명은 provider의 몫이고(ARCHITECTURE §6.02) 우리는 그 값을 그대로 든다.
 */

/**
 * `toLocaleLowerCase`가 아니라 `toLowerCase`다 — 터키어 로케일에서 `I`가 `ı`로 내려가면
 * 서버 로케일에 따라 같은 주소가 다른 값이 된다.
 */
/**
 * 표시용 마스킹 — `sinhyeok@day1company.co.kr` → `s***@day1company.co.kr`.
 *
 * ⚠️ **정규화가 아니다.** 되돌릴 수 없으므로 저장·대조에 쓰지 않는다 — `normalizeEmail`과 같은 파일에
 * 있는 이유는 둘 다 이메일 문자열을 다루기 때문이고, 소비자가 둘(초대 화면·번역 셀 메타)이라
 * 구현이 갈리면 같은 주소가 화면마다 다르게 보인다.
 *
 * `@`가 없거나 맨 앞이면 자를 지점을 못 믿으므로 통째로 가린다.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * provider가 **검증했다고 증명한** 이메일의 재료.
 *
 * ⚠️ **GitHub은 `addresses`를 우리가 직접 조회해 넘긴다.** provider가 주는 `profile.email`로는
 * 검증 여부를 알 수 없다 — `@auth/core/providers/github.js`가 공개 이메일이 없을 때
 * `/user/emails`를 조회하긴 하지만 `emails.find(e => e.primary) ?? emails[0]`로 **주소만 뽑고
 * `verified`를 버리고**, 그 `emails[0]` 폴백은 미검증 주소일 수 있다 (2026-09-05 실측).
 */
export type EmailProof =
  | { provider: "google"; email: unknown; emailVerified: unknown }
  | { provider: "github"; addresses: unknown };

/**
 * 검증된 이메일을 **정규화해서** 내거나 `null`.
 *
 * **fail-closed**: 모르는 모양·빠진 값·미검증은 전부 `null`이고, 호출부(`signIn`)는 그때 로그인을
 * 거부한다. `checkProjectSlug`(`lib/push/guard.ts`)가 빈 slug를 막는 것과 같은 계보다 — 부재를 통과로 읽으면
 * 이메일 소유권 증명이 사라지고, 그 위에 선 초대 대조(ARCHITECTURE §6.02)가 통째로 무의미해진다.
 */
export function verifiedEmailFrom(proof: EmailProof): string | null {
  if (proof.provider === "google") {
    // 불리언과 문자열 둘 다 받는다 — OIDC 스펙은 불리언이지만 어느 쪽으로 와도 로그인이 깨지지
    // 않게 한다. 이 값은 provider가 서명해 보낸 것이라 관대해도 구멍이 생기지 않는다.
    if (proof.emailVerified !== true && proof.emailVerified !== "true") return null;
    return normalizedOrNull(proof.email);
  }

  if (!Array.isArray(proof.addresses)) return null;
  for (const entry of proof.addresses) {
    if (typeof entry !== "object" || entry === null) continue;
    // unknown을 좁히기만 하는 단언이다 — 위 typeof가 이미 object임을 보장한다.
    const record = entry as Record<string, unknown>;
    if (record["primary"] !== true) continue;
    // ⚠️ **primary가 미검증이면 다른 검증 주소로 넘어가지 않는다.** 넘어가면 `User.email`이
    // primary가 아닌 주소가 되고, 다음 로그인에 어느 주소가 나올지가 GitHub 설정에 따라 흔들린다.
    // 계정의 정본 주소는 primary 하나다. 대가는 **primary와 다른 주소로 초대받은 사람이 수락하지
    // 못하는 것**이고, 회피는 primary 주소로 초대하는 것이다.
    if (record["verified"] !== true) return null;
    return normalizedOrNull(record["email"]);
  }
  return null;
}

function normalizedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = normalizeEmail(value);
  return email === "" ? null : email;
}

/**
 * `signIn` 콜백의 `profile`에서 **지금** provider가 검증한 이메일을 꺼낸다.
 *
 * GitHub은 `auth.ts`의 `userinfo.request`가 만든 객체라 `email`이 이미 검증 결과다(실패면 `""`).
 * Google은 raw OIDC profile이라 `email_verified`를 봐야 한다. 모르는 provider는 `null` — 부재는 갱신이 아니다.
 */
export function freshVerifiedEmail(provider: string | undefined, profile: unknown): string | null {
  if (typeof profile !== "object" || profile === null) return null;
  const record = profile as Record<string, unknown>;
  if (provider === "github") return normalizedOrNull(record["email"]);
  if (provider === "google") {
    return verifiedEmailFrom({ provider: "google", email: record["email"], emailVerified: record["email_verified"] });
  }
  return null;
}

export type EmailRefresh = "keep" | "update" | "conflict";

/**
 * 기존 사용자가 재로그인할 때 `User.email`을 갱신할지.
 *
 * ⚠️ **OAuth 재로그인은 `updateUser`를 부르지 않는다** (`@auth/core` handle-login — email provider 분기만
 * 갱신한다). 그래서 저장된 이메일은 첫 로그인 값으로 굳고, primary를 바꾼 사람은 새 주소로 온 초대를 영영
 * 수락하지 못하며 옛 주소로 온 초대는 수락한다 (Codex 감사 2026-09-06 #5). 초대 대조가 `User.email` 위에 서므로
 * 그 값이 **지금** 검증된 주소여야 한다.
 *
 * `conflict`는 새 주소를 다른 User가 쓰는 경우다 — **갱신도 병합도 하지 않고 로그인은 허용한다**
 * (2026-09-06 결정). 여기서 합치면 `allowDangerousEmailAccountLinking`을 우회한 자동 병합이 된다.
 */
export function planEmailRefresh(input: {
  stored: string;
  fresh: string | null;
  takenByOther: boolean;
  /** 로그인 `Account` 행 수 (`github`·`google`만). `github-app`은 로그인 수단이 아니다. */
  loginMethods: number;
}): EmailRefresh {
  /**
   * ⚠️ **수단이 둘 이상이면 언제나 `keep`이다** (ARCHITECTURE "계정 병합"). 병합 전에는 User당
   * 로그인 수단이 하나라 이 경로가 원리적으로 없었다 — 병합이 그것을 만든다: 한쪽 provider에서
   * 주소를 바꾸면 `User.email`이 **마지막으로 로그인한 provider에 따라 뒤집히고**, 초대 대조
   * (ARCHITECTURE §6.02)가 그 값 위에 서 있다. ARCHITECTURE §6.2.1가 경고한 "정본 판정"이 한 로그인 뒤에 도착한다.
   *
   * ⚠️ **대가**: 병합한 사용자가 provider에서 주소를 바꿔도 malmoi의 이메일은 따라가지 않고,
   * 초대 대조는 **병합 시점 주소** 기준으로 남는다.
   */
  if (input.loginMethods > 1) return "keep";
  const fresh = input.fresh === null ? "" : normalizeEmail(input.fresh);
  if (fresh === "" || fresh === normalizeEmail(input.stored)) return "keep";
  return input.takenByOther ? "conflict" : "update";
}
