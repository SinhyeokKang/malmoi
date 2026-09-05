import { fail } from "../failure";
import { verifiedEmailFrom } from "./email";

/**
 * GitHub의 두 응답(`/user` + `/user/emails`)을 provider가 쓸 profile 하나로 합친다.
 *
 * **왜 provider 기본 동작을 대체하는가**: `@auth/core`의 GitHub provider는 공개 이메일이 없을
 * 때만 `/user/emails`를 조회하고, 조회해도 `emails.find(e => e.primary) ?? emails[0]`로 **주소만
 * 뽑고 `verified`를 버린다** (2026-09-05 실측). 공개 이메일이 있으면 그 값이 primary가 아닐 수도
 * 있다. 여기서 나온 `email`이 그대로 `User.email`이 되므로 **검증한 주소와 저장되는 주소가
 * 같아야 한다.**
 *
 * ⚠️ **두 실패를 구별한다** (POSTMORTEM 2026-09-03 — 실패와 "해당 없음"을 같은 출력으로 접지 않는다):
 * - **`/user` 조회 실패는 시스템 오류**라 던진다. 안 던지면 provider 기본 `profile()`이
 *   `profile.id.toString()`에서 `undefined.toString()`으로 죽어, 사용자가 원인과 무관한
 *   `Configuration` 오류 화면을 본다.
 * - **이메일 검증 실패는 정상적인 거부**라 `email`을 비워 보낸다. `signIn`이 그때 막는다.
 */
export function githubUserinfo(input: { user: unknown; addresses: unknown }): Record<string, unknown> {
  const { user, addresses } = input;

  if (typeof user !== "object" || user === null) {
    fail("github: /user 조회에 실패했다 (응답이 객체가 아니다)");
  }
  const record: Record<string, unknown> = { ...user };
  const id = record["id"];
  // provider의 기본 `profile()`이 `id.toString()`을 부른다 — 없으면 거기서 죽는다.
  if (typeof id !== "number" && typeof id !== "string") {
    fail("github: /user 응답에 id가 없다");
  }

  return { ...record, email: verifiedEmailFrom({ provider: "github", addresses }) ?? "" };
}
