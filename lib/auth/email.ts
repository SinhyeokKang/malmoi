/**
 * 이메일 정규화 — 저장과 비교가 **같은 함수를 지난다**. 갈리면 초대 대조가 대소문자로 실패한다.
 *
 * ⚠️ **trim과 소문자까지만 한다.** gmail의 점이나 `+` 태그를 접는 정규화를 넣지 않는다 —
 * 그건 provider가 준 주소를 우리가 재해석하는 것이고, 결과로 **다른 사람 앞으로 온 초대와
 * 일치시킬 수 있다.** 이메일 소유권 증명은 provider의 몫이고(SAAS §5.6) 우리는 그 값을 그대로 든다.
 */

/**
 * `toLocaleLowerCase`가 아니라 `toLowerCase`다 — 터키어 로케일에서 `I`가 `ı`로 내려가면
 * 서버 로케일에 따라 같은 주소가 다른 값이 된다.
 */
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
 * 거부한다. `lib/auth/allow.ts`가 빈 핸들을 이중으로 막는 것과 같은 계보다 — 부재를 통과로 읽으면
 * 이메일 소유권 증명이 사라지고, 그 위에 선 초대 대조(SAAS §5.6)가 통째로 무의미해진다.
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
