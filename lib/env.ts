// 환경변수 단일 접근점. 흩어진 process.env 접근은 누락된 변수를 런타임까지 숨기므로
// 여기서만 읽는다(CLAUDE.md 코드 컨벤션). 새 변수를 추가하면 .env.example도 같은 커밋에서 갱신한다.

/** 필수 환경변수. 없으면 즉시 던진다 — 조용한 폴백이 설정 누락을 프로덕션까지 데려간다. */
export function requireEnv(name: string, source: NodeJS.ProcessEnv = process.env): string {
  const value = source[name];
  if (value === undefined || value === "") {
    throw new Error(`환경변수 ${name}이(가) 없다. .env.example을 참고해 설정한다.`);
  }
  return value;
}

/**
 * GitHub App 개인키 복원. Vercel env에 PEM을 넣으면 개행이 `\n` 두 문자로 이스케이프되고,
 * 그대로 서명에 쓰면 JWT가 **조용히** 실패한다(에러 메시지가 원인을 안 가리킨다).
 */
export function parsePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replaceAll("\\n", "\n") : raw;
}

/**
 * org 멤버십 인가는 fail-closed다. AUTH_ALLOWED_ORG가 비어 있으면 아무도 통과하지 못한다 —
 * 빈 값을 "제한 없음"으로 읽으면 설정 누락이 곧 전면 공개가 된다(ARCHITECTURE §6).
 */
export function isOrgAllowed(userOrgs: readonly string[], allowedOrg: string | undefined): boolean {
  if (!allowedOrg) return false;
  return userOrgs.includes(allowedOrg);
}
