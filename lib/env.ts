// 환경변수 단일 접근점. 흩어진 process.env 접근은 누락된 변수를 런타임까지 숨기므로
// 여기서만 읽는다(CLAUDE.md 코드 컨벤션). 새 변수를 추가하면 .env.example도 같은 커밋에서 갱신한다.

/** 필수 환경변수. 없으면 즉시 던진다 — 조용한 폴백이 설정 누락을 프로덕션까지 데려간다. */
/** 테스트에서 주입할 수 있도록 맵을 받는다. NodeJS.ProcessEnv를 쓰면 Next 타입이
 *  NODE_ENV를 필수로 만들어 테스트가 리터럴을 못 넘긴다. */
type EnvSource = Record<string, string | undefined>;

export function requireEnv(name: string, source: EnvSource = process.env): string {
  const value = source[name];
  if (value === undefined || value === "") {
    throw new Error(`환경변수 ${name}이(가) 없다. .env.example을 참고해 설정한다.`);
  }
  return value;
}

/**
 * 선택 환경변수. 없거나 빈 문자열이면 `undefined` — **던지지 않는다.**
 *
 * `requireEnv`와 갈라 둔 이유: 인가 판정(`checkBearer`·`parseAllowedLogins`)은 누락을 스스로
 * fail-closed로 처리해야 응답이 "미설정 500 / 거부 401"로 갈린다. 여기서 던지면 그 판정에
 * 닿기 전에 본문 없는 500이 된다. 값을 쓰는 쪽이 `process.env`를 직접 읽지 않게 하는 것이
 * 이 함수의 유일한 역할이다 (CLAUDE.md "환경변수는 한 곳에서 읽는다").
 */
export function optionalEnv(name: string, source: EnvSource = process.env): string | undefined {
  const value = source[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * GitHub App 개인키 복원. Vercel env에 PEM을 넣으면 개행이 `\n` 두 문자로 이스케이프되고,
 * 그대로 서명에 쓰면 JWT가 **조용히** 실패한다(에러 메시지가 원인을 안 가리킨다).
 */
export function parsePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replaceAll("\\n", "\n") : raw;
}

/**
 * ⚠️ **현재 호출부가 없다.** 인가는 org 멤버십이 아니라 허용 핸들 목록(`lib/auth/allow.ts`)으로
 * 갔다 — 대상이 개인 계정 리포라 멤버십이 존재하지 않는다 (MVP §5). 실제 org를 쓰게 되면
 * 이 판정을 OR로 더하려고 남겨둔다.
 *
 * fail-closed 규칙은 그대로다: 허용 org가 비어 있으면 아무도 통과하지 못한다 —
 * 빈 값을 "제한 없음"으로 읽으면 설정 누락이 곧 전면 공개가 된다(ARCHITECTURE §6).
 */
export function isOrgAllowed(userOrgs: readonly string[], allowedOrg: string | undefined): boolean {
  if (!allowedOrg) return false;
  return userOrgs.includes(allowedOrg);
}
