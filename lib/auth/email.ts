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
