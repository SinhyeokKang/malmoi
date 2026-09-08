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
    fail("github: /user lookup failed (response is not an object)");
  }
  const record: Record<string, unknown> = { ...user };
  const id = record["id"];
  // provider의 기본 `profile()`이 `id.toString()`을 부른다 — 없으면 거기서 죽는다.
  if (typeof id !== "number" && typeof id !== "string") {
    fail("github: /user response has no id");
  }

  return { ...record, email: verifiedEmailFrom({ provider: "github", addresses }) ?? "" };
}

/**
 * GitHub REST 조회. **HTTP 실패는 던진다 — 거부로 접지 않는다.**
 *
 * 전에는 non-OK를 `null`로 돌려 `/user/emails` 실패가 "검증된 이메일 없음"이 되고, 사용자는
 * "이메일이 검증되지 않았을 수 있어요"를 봤다 — GitHub 부분 장애 중 **처음 로그인하는 사람만** 막히고
 * 기존 사용자(`signIn`의 `user`가 DB 행)는 재현이 안 되는 형태다 (code-review 2026-09-06 🔴5).
 * `fail()`로 던지면 Auth.js가 `Configuration`으로 접어 로그인 화면이 "잠시 뒤 다시"를 보인다 — 그게 맞다.
 *
 * `fetchImpl`을 받는 것은 테스트용이다. 메시지에 토큰을 담지 않는다.
 */
export async function githubApi(
  path: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (token === "") fail("github: no access_token, cannot verify the email");
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "malmoi",
    },
  });
  if (!response.ok) fail(`github: ${path} lookup failed (${response.status})`);
  return await response.json();
}
