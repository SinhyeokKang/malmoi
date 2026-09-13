/**
 * 표시 이름 저장의 순수 판정 (account-settings 태스크 2).
 *
 * ⚠️ **거부가 값이다** — 던지면 Action이 그것을 `unavailable`로 접고 사용자는 "저장이 안 된다"만
 * 본다. 사유가 화면에 닿으려면 반환값이어야 한다 (POSTMORTEM 2026-09-06).
 *
 * ⚠️ **이름은 사용자 소유다** — 이메일과 축이 다르다. 이메일은 초대 대조가 그 위에 서므로
 * provider가 검증한 값으로 남고(ARCHITECTURE §6.02), 이름은 멤버 목록·초대에서 **남이 나를
 * 알아보는 이름**이라 provider의 표시 이름이 그 자리에 맞지 않을 수 있다 (PRODUCT §4.1).
 */

/**
 * ⚠️ **DB 제약이 아니다** — `User.name`은 `String?`이고 Postgres `text`에 길이 상한이 없다.
 * 이 값이 막는 것은 저장 실패가 아니라 **멤버 목록·초대 화면의 한 줄이 무너지는 것**이다.
 */
export const NAME_MAX_CHARS = 80;

export type NameSave = { ok: true; name: string } | { ok: false; reason: "empty" | "too-long" };

export function planNameSave(raw: string): NameSave {
  // 가운데 공백은 이름의 일부다 — 접으면 남이 나를 알아보는 이름이 바뀐다.
  const name = raw.trim();
  if (name === "") return { ok: false, reason: "empty" };
  /**
   * ⚠️ **UTF-16 길이로 세지 않는다.** 이모지 하나가 `"🙂".length === 2`라 `.length`로 재면 상한이
   * 사람이 보는 글자 수의 절반이 된다 — 한국어·영문 이름은 안 걸리는 부류라 조용하다.
   */
  if ([...name].length > NAME_MAX_CHARS) return { ok: false, reason: "too-long" };
  return { ok: true, name };
}
