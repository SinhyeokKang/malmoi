/**
 * 편집 UI 인가 — **허용 GitHub 핸들 목록**.
 *
 * org 멤버십 검사가 아닌 이유: 대상이 개인 계정 리포(`SinhyeokKang/malmoi`)라 멤버십이
 * 존재하지 않는다. 핸들 목록은 개인·org 양쪽에서 동작하고 동료 몇 명 규모에 맞다.
 * 실제 org를 쓰게 되면 org 검사를 OR로 더한다 (MVP §5).
 *
 * **fail-closed**: 목록이 비면 아무도 통과하지 못한다. 빈 값을 "제한 없음"으로 읽으면
 * 설정 누락이 곧 전면 공개가 된다 (ARCHITECTURE §6).
 */

/** 핸들 정규화 — GitHub 핸들은 대소문자를 구분하지 않는다. */
function normalize(login: string): string {
  return login.trim().toLowerCase();
}

/**
 * `AUTH_ALLOWED_LOGINS`(쉼표 구분) → 정규화된 목록.
 *
 * **빈 항목을 버린다.** `"a, ,b"`가 목록에 빈 문자열을 넣으면, 핸들을 못 받은 로그인의
 * 빈 `login`이 그것과 일치해 통과한다.
 */
export function parseAllowedLogins(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const login = normalize(part);
    if (login !== "") seen.add(login);
  }
  return [...seen];
}

/**
 * @param login OAuth provider가 준 GitHub 핸들. provider가 안 줄 수도 있어 nullable을 받는다.
 * @param allowed `parseAllowedLogins`의 결과.
 */
export function isLoginAllowed(login: string | null | undefined, allowed: readonly string[]): boolean {
  if (!login) return false;
  const normalized = normalize(login);
  // 목록을 직접 만든 경우에도 빈 login이 빈 항목과 일치하지 않게 이중으로 막는다.
  if (normalized === "") return false;
  return allowed.includes(normalized);
}
